"""
Claidex Risk Score — Modal Parallel Batch Compute
==================================================

Refactored version of risk_scores.py designed for Modal's parallel execution
infrastructure. Completes 1.78M NPIs in ~5-15 minutes by:

  1. Batching Neo4j queries via UNWIND (1000 NPIs → 1 query)
  2. Parallel execution across 200+ Modal containers via .starmap()

Usage
-----
    # Setup (one-time):
    pip install modal
    modal setup
    modal secret create claidex-neo4j \
        NEO4J_URI=bolt://your-host:7687 \
        NEO4J_USER=neo4j \
        NEO4J_PASSWORD=your-password

    # Upload input data to volume:
    modal volume put claidex-data ./data/processed/providers.parquet /data/providers.parquet
    modal volume put claidex-data ./data/processed/payments_combined.parquet /data/payments_combined.parquet
    modal volume put claidex-data ./data/processed/exclusions.parquet /data/exclusions.parquet

    # Run:
    modal run etl/compute/claidex_modal.py

    # Download results:
    mkdir -p results && modal volume get claidex-data claidex_results_final.parquet ./results/final.parquet

Architecture
------------
    Modal Volume stores input files + output chunks
    ├── /data/providers.parquet
    ├── /data/payments_combined.parquet
    ├── /data/exclusions.parquet
    └── /data/output_chunks/batch_NNNNNN.parquet

    Modal Secret holds Neo4j credentials

    process_npi_batch() runs ~1,789 times in parallel
    ├── Batched UNWIND Neo4j query (1000 NPIs → 1 query)
    ├── Vectorized metrics (billing, trajectory, concentration)
    └── Write chunk to volume

    merge_results() concatenates all chunks → final parquet
"""

from __future__ import annotations

import math
import os
from pathlib import Path

import modal

# ---------------------------------------------------------------------------
# Modal App + Image + Volume + Secret
# ---------------------------------------------------------------------------

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install([
        "polars==1.19.0",
        "pyarrow==18.1.0",
        "neo4j==5.26.0",
        "psycopg2-binary==2.9.10",
        "numpy==2.2.1",
        "python-dotenv==1.0.1",
    ])
    .add_local_python_source("etl.compute")
)

app = modal.App("claidex-risk-pipeline", image=image)

# Volume for input/output data
volume = modal.Volume.from_name("claidex-data", create_if_missing=True)
VOLUME_PATH = "/data"

# Neo4j credentials (create at: https://modal.com/secrets)
neo4j_secret = modal.Secret.from_name("claidex-neo4j")

# ---------------------------------------------------------------------------
# Worker Function — Process One Batch of NPIs
# ---------------------------------------------------------------------------

@app.function(
    volumes={VOLUME_PATH: volume},
    secrets=[neo4j_secret],
    timeout=900,          # 15 min max per batch
    retries=2,            # auto-retry transient Neo4j errors
    max_containers=300,  # max parallel containers (was concurrency_limit)
    memory=4096,          # 4GB per container
)
def process_npi_batch(
    batch_index: int,
    npi_batch: list[str],
    postgres_url: str,
) -> str:
    """
    Process one batch of NPIs (~1000 NPIs per batch).

    Returns path to output parquet chunk in the volume.

    Key optimization: ONE batched Neo4j UNWIND query for all NPIs in this
    batch instead of 1000 individual queries.
    """
    import json
    import sys
    from datetime import datetime, timezone

    sys.path.insert(0, "/opt/claidex_compute")
    import numpy as np
    import polars as pl
    import psycopg2
    from neo4j import GraphDatabase

    from etl.compute.risk_scores import (
        ALPHA, EPSILON, MAD_SCALE, PEER_MIN_SIZE, PEER_MIN_CLAIMS, WINDOW_YEARS,
        WEIGHTS, LABEL_THRESHOLDS,
        compute_peer_metrics,
        compute_billing_score,
        compute_trajectory_score,
        compute_program_concentration,
        compute_exclusion_proximity,
        compute_ownership_chain_risk,
        generate_flags,
        risk_label,
    )

    print(f"[Batch {batch_index}] Starting with {len(npi_batch)} NPIs")

    # Reload volume to see files uploaded via CLI before this run
    volume.reload()

    # -----------------------------------------------------------------------
    # 1. Load data for this batch from volume
    # -----------------------------------------------------------------------
    payments_path = f"{VOLUME_PATH}/payments_combined.parquet"
    providers_path = f"{VOLUME_PATH}/providers.parquet"
    exclusions_path = f"{VOLUME_PATH}/exclusions.parquet"

    # Load full datasets and filter to this batch
    # (Alternative: if data is pre-partitioned by NPI, load only relevant partitions)
    payments_all = pl.read_parquet(payments_path)
    providers_all = pl.read_parquet(providers_path)
    exclusions_all = pl.read_parquet(exclusions_path)

    # Filter to this batch
    payments = payments_all.filter(pl.col("npi").is_in(npi_batch))
    providers_df = providers_all.filter(pl.col("npi").is_in(npi_batch))
    exclusions_df = exclusions_all.filter(pl.col("npi").is_in(npi_batch))

    print(f"[Batch {batch_index}] Loaded {len(payments)} payment rows, "
          f"{len(providers_df)} providers, {len(exclusions_df)} exclusions")

    if payments.is_empty():
        print(f"[Batch {batch_index}] No payment data — skipping")
        return ""

    # -----------------------------------------------------------------------
    # 2. Vectorized metrics (billing, trajectory, concentration)
    # -----------------------------------------------------------------------
    print(f"[Batch {batch_index}] Computing peer metrics...")
    peer_metrics = compute_peer_metrics(payments)

    print(f"[Batch {batch_index}] Computing billing scores...")
    billing_df = compute_billing_score(peer_metrics)

    print(f"[Batch {batch_index}] Computing trajectory scores...")
    trajectory_df = compute_trajectory_score(peer_metrics)

    print(f"[Batch {batch_index}] Computing concentration scores...")
    conc_df = compute_program_concentration(payments)

    # Top program per NPI (for flags)
    max_year = int(payments["year"].max())
    recent = payments.filter(pl.col("year") >= max_year - 2)
    top_program_df = (
        recent
        .group_by(["npi", "program"])
        .agg(pl.col("payments").sum().alias("prog_total"))
        .sort(["npi", "prog_total"], descending=[False, True])
        .group_by("npi")
        .agg(pl.col("program").first().alias("top_program"))
    )

    # -----------------------------------------------------------------------
    # 3. Neo4j ownership + exclusion (batched UNWIND query)
    # -----------------------------------------------------------------------
    print(f"[Batch {batch_index}] Running batched Neo4j ownership query...")
    neo4j_results = {}
    try:
        uri = (os.environ.get("NEO4J_URI") or "").strip()
        if uri and not (uri.startswith("bolt") or uri.startswith("neo4j")):
            for prefix in ("NEO4J_URI=", "NEO4J_URI ="):
                if uri.upper().startswith(prefix.upper()):
                    uri = uri[len(prefix):].strip().strip('"').strip("'")
                    break
        driver = GraphDatabase.driver(
            uri,
            auth=(os.environ["NEO4J_USER"], os.environ["NEO4J_PASSWORD"]),
        )

        # Aura uses instance ID as database name; default "neo4j" does not exist there
        database = os.environ.get("NEO4J_DATABASE", "").strip()
        if not database and "databases.neo4j.io" in uri:
            # e.g. neo4j+s://5c8d6587.databases.neo4j.io -> 5c8d6587
            try:
                from urllib.parse import urlparse
                parsed = urlparse(uri)
                host = parsed.hostname or ""
                if host.endswith(".databases.neo4j.io"):
                    database = host.split(".")[0] or "neo4j"
                else:
                    database = "neo4j"
            except Exception:
                database = "neo4j"
        if not database:
            database = "neo4j"

        # Build NPI → display_name lookup
        name_lookup = {
            row["npi"]: row.get("display_name") or ""
            for row in providers_df.iter_rows(named=True)
        }

        # Prepare batch input: list of {npi: str, name: str}
        batch_inputs = [
            {"npi": npi, "name": name_lookup.get(npi, "")}
            for npi in npi_batch
        ]

        # CRITICAL: Batched UNWIND query replacing per-NPI loop
        # This is the key optimization: 1 query for 1000 NPIs instead of 1000 queries
        cypher = """
        UNWIND $batch AS item
        WITH item.npi AS npi, item.name AS provider_name

        // Find SNF entity matching this provider name
        OPTIONAL MATCH (snf:CorporateEntity)
        WHERE snf.entityType = 'SNF'
          AND toLower(snf.name) CONTAINS toLower(provider_name)
          AND provider_name IS NOT NULL AND provider_name <> ''
        WITH npi, provider_name, snf
        ORDER BY npi, snf.name
        WITH npi, provider_name, HEAD(COLLECT(snf)) AS snf

        // Traverse up ownership chain
        OPTIONAL MATCH path = (snf)<-[:OWNS*1..5]-(ancestor:CorporateEntity)

        // Aggregate ancestors per (npi, snf) first — Neo4j 5 forbids mixing grouping keys with aggregation in one expression
        WITH npi, snf, COLLECT(DISTINCT ancestor) AS ancestors
        // Build chain_entities from grouping keys + aggregated list (no aggregation here)
        WITH npi,
             CASE WHEN snf IS NULL THEN []
                  ELSE [snf] + [a IN ancestors WHERE a IS NOT NULL]
             END AS chain_entities

        // Expand back down: all SNFs owned by these ancestors
        UNWIND CASE WHEN SIZE(chain_entities) = 0 THEN [null] ELSE chain_entities END AS ce
        OPTIONAL MATCH (ce)-[:OWNS*0..5]->(sibling:CorporateEntity)
        WITH npi, COLLECT(DISTINCT sibling) AS siblings, chain_entities
        WITH npi, [e IN siblings WHERE e IS NOT NULL | e] + chain_entities AS all_entities

        // Find providers associated with these entities (by name containment)
        UNWIND CASE WHEN SIZE(all_entities) = 0 THEN [null] ELSE all_entities END AS ent
        OPTIONAL MATCH (p2:Provider)
        WHERE toLower(p2.name) CONTAINS toLower(ent.name)
          AND ent.name IS NOT NULL AND ent.name <> ''

        // Check for exclusions on providers
        OPTIONAL MATCH (p2)-[:EXCLUDED_BY]->(x:Exclusion)

        // Check if any owning entity has EXCLUDED_BY
        OPTIONAL MATCH (ent)-[:EXCLUDED_BY]->(ox:Exclusion)

        RETURN
            npi,
            COUNT(DISTINCT p2) AS chain_provider_count,
            COUNT(DISTINCT CASE WHEN x IS NOT NULL THEN p2 END) AS chain_excluded_count,
            COUNT(DISTINCT CASE WHEN ox IS NOT NULL THEN ent END) AS owner_excluded_count
        """

        # Suppress schema notifications (e.g. unknown label/relationship) when DB is empty or partial
        with driver.session(
            database=database,
            notifications_min_severity="OFF",
        ) as session:
            result = session.run(cypher, {"batch": batch_inputs})
            for record in result:
                npi = record["npi"]
                chain_provider_count = int(record["chain_provider_count"] or 0)
                chain_excluded_count = int(record["chain_excluded_count"] or 0)
                owner_excluded = int(record["owner_excluded_count"] or 0) > 0

                # Compute ownership chain risk (same logic as original)
                total = max(chain_provider_count, 1)
                oc_risk = min(100.0, 100.0 * chain_excluded_count / total)

                neo4j_results[npi] = {
                    "ownership_chain_risk": round(oc_risk, 2),
                    "chain_excluded_count": chain_excluded_count,
                    "owner_excluded": owner_excluded,
                }

        driver.close()
        print(f"[Batch {batch_index}] Neo4j query complete — {len(neo4j_results)} results")

    except Exception as e:
        print(f"[Batch {batch_index}] Neo4j error: {e}. Setting ownership=0 for batch.")
        for npi in npi_batch:
            neo4j_results[npi] = {
                "ownership_chain_risk": 0.0,
                "chain_excluded_count": 0,
                "owner_excluded": False,
            }

    # Convert Neo4j results to DataFrame
    ownership_rows = [
        {
            "npi": npi,
            "ownership_chain_risk": data["ownership_chain_risk"],
            "chain_excluded_count": data["chain_excluded_count"],
        }
        for npi, data in neo4j_results.items()
    ]
    ownership_df = pl.DataFrame(ownership_rows)

    # Extract sets for exclusion proximity
    chain_excluded_counts = {
        npi: data["chain_excluded_count"]
        for npi, data in neo4j_results.items()
    }
    owner_excluded_set = {
        npi for npi, data in neo4j_results.items()
        if data["owner_excluded"]
    }

    # -----------------------------------------------------------------------
    # 4. Exclusion proximity score
    # -----------------------------------------------------------------------
    print(f"[Batch {batch_index}] Computing exclusion proximity...")
    excl_prox_df = compute_exclusion_proximity(
        exclusions_df, providers_df, chain_excluded_counts, owner_excluded_set
    )

    # -----------------------------------------------------------------------
    # 5. Merge all components
    # -----------------------------------------------------------------------
    print(f"[Batch {batch_index}] Merging components...")
    scores = billing_df

    for df in (trajectory_df, conc_df, ownership_df, excl_prox_df, top_program_df):
        if not df.is_empty():
            common_cols = set(scores.columns) & set(df.columns) - {"npi"}
            if common_cols:
                df = df.drop(list(common_cols))
            scores = scores.join(df, on="npi", how="left")

    # Fill missing scores with 0
    for col in ("payment_trajectory_score", "payment_trajectory_zscore",
                "program_concentration_score", "ownership_chain_risk",
                "exclusion_proximity_score", "chain_excluded_count"):
        if col in scores.columns:
            scores = scores.with_columns(pl.col(col).fill_null(0.0))
        else:
            scores = scores.with_columns(pl.lit(0.0).alias(col))

    # -----------------------------------------------------------------------
    # 6. Composite scoring (per-batch raw scores, global calibration happens later)
    # -----------------------------------------------------------------------
    print(f"[Batch {batch_index}] Computing composite scores...")
    scores = scores.with_columns([
        (
            pl.col("billing_outlier_score")       * WEIGHTS["billing_outlier_score"] +
            pl.col("ownership_chain_risk")         * WEIGHTS["ownership_chain_risk"] +
            pl.col("payment_trajectory_score")     * WEIGHTS["payment_trajectory_score"] +
            pl.col("exclusion_proximity_score")    * WEIGHTS["exclusion_proximity_score"] +
            pl.col("program_concentration_score")  * WEIGHTS["program_concentration_score"]
        ).alias("r_raw"),
    ])

    # Note: risk_score and risk_label will be computed globally in merge step
    # For now, just use r_raw as a placeholder
    scores = scores.with_columns([
        pl.col("r_raw").alias("risk_score"),
        pl.lit("Pending").alias("risk_label"),
    ])

    # -----------------------------------------------------------------------
    # 7. Generate flags
    # -----------------------------------------------------------------------
    print(f"[Batch {batch_index}] Generating flags...")
    now_iso = datetime.now(timezone.utc).isoformat()

    output_rows = []
    for row in scores.iter_rows(named=True):
        top_prog = row.get("top_program")
        flags = generate_flags(
            billing_outlier_score=row.get("billing_outlier_score", 0.0),
            billing_outlier_percentile=row.get("billing_outlier_percentile", 0.0),
            ownership_chain_risk=row.get("ownership_chain_risk", 0.0),
            payment_trajectory_score=row.get("payment_trajectory_score", 0.0),
            exclusion_proximity_score=row.get("exclusion_proximity_score", 0.0),
            program_concentration_score=row.get("program_concentration_score", 0.0),
            chain_excluded_count=int(row.get("chain_excluded_count", 0)),
            top_program=top_prog,
        )
        components = {
            "billing_outlier_score": row.get("billing_outlier_score", 0.0),
            "billing_outlier_percentile": row.get("billing_outlier_percentile", 0.0),
            "ownership_chain_risk": row.get("ownership_chain_risk", 0.0),
            "payment_trajectory_score": row.get("payment_trajectory_score", 0.0),
            "payment_trajectory_zscore": row.get("payment_trajectory_zscore", 0.0),
            "exclusion_proximity_score": row.get("exclusion_proximity_score", 0.0),
            "program_concentration_score": row.get("program_concentration_score", 0.0),
        }
        output_rows.append({
            "npi": row["npi"],
            "risk_score": row.get("r_raw", 0.0),  # Will be calibrated in merge
            "risk_label": "Pending",
            "r_raw": row.get("r_raw", 0.0),
            "billing_outlier_score": row.get("billing_outlier_score", 0.0),
            "billing_outlier_percentile": row.get("billing_outlier_percentile", 0.0),
            "ownership_chain_risk": row.get("ownership_chain_risk", 0.0),
            "payment_trajectory_score": row.get("payment_trajectory_score", 0.0),
            "payment_trajectory_zscore": row.get("payment_trajectory_zscore", 0.0),
            "exclusion_proximity_score": row.get("exclusion_proximity_score", 0.0),
            "program_concentration_score": row.get("program_concentration_score", 0.0),
            "peer_taxonomy": row.get("peer_taxonomy"),
            "peer_state": row.get("peer_state"),
            "peer_count": row.get("peer_count", 0),
            "data_window_years": row.get("data_window_years", []),
            "flags": json.dumps(flags),
            "components": json.dumps(components),
            "updated_at": now_iso,
        })

    result_df = pl.DataFrame(output_rows)

    # -----------------------------------------------------------------------
    # 8. Write output chunk to volume
    # -----------------------------------------------------------------------
    out_path = f"{VOLUME_PATH}/output_chunks/batch_{batch_index:06d}.parquet"
    os.makedirs(f"{VOLUME_PATH}/output_chunks", exist_ok=True)
    result_df.write_parquet(out_path)
    volume.commit()  # Flush writes

    print(f"[Batch {batch_index}] Complete — {len(result_df)} rows → {out_path}")
    return out_path


# ---------------------------------------------------------------------------
# Merge Function — Concatenate All Chunks + Global Calibration
# ---------------------------------------------------------------------------

@app.function(
    volumes={VOLUME_PATH: volume},
    timeout=7200,          # 2 hr for merge (9k+ chunk files)
    memory=32768,         # 32GB for large final concat
)
def merge_results(
    postgres_url: str,
    output_file: str = "/data/claidex_results_final.parquet",
    upsert_to_db: bool = True,
) -> str:
    """
    Read all output chunk parquets, perform global calibration on r_raw,
    and write final results to volume + optionally upsert to Postgres.
    """
    import glob
    import json
    from datetime import datetime, timezone

    import numpy as np
    import polars as pl
    import psycopg2
    import psycopg2.extras

    from etl.compute.risk_scores import LABEL_THRESHOLDS, risk_label

    print("[Merge] Reading all chunk files...")
    chunk_files = sorted(glob.glob(f"{VOLUME_PATH}/output_chunks/batch_*.parquet"))
    print(f"[Merge] Found {len(chunk_files)} chunk files")

    if not chunk_files:
        print("[Merge] No chunks found — exiting")
        return ""

    # Read in batches of 1000 files to avoid 9k+ separate reads and timeout
    read_batch_size = 1000
    batch_dfs = []
    for start in range(0, len(chunk_files), read_batch_size):
        batch_paths = chunk_files[start : start + read_batch_size]
        batch_dfs.append(pl.read_parquet(batch_paths))
    df = pl.concat(batch_dfs, how="vertical_relaxed")
    del batch_dfs
    print(f"[Merge] Concatenated {len(df):,} rows")

    # -----------------------------------------------------------------------
    # Global calibration: r_raw → risk_score via PERCENT_RANK
    # -----------------------------------------------------------------------
    print("[Merge] Performing global PERCENT_RANK calibration...")
    r_raw_arr = df["r_raw"].to_numpy()
    n = len(r_raw_arr)

    if n > 1:
        order = np.argsort(r_raw_arr)
        rank_arr = np.empty(n, dtype=float)
        rank_arr[order] = np.arange(n) / (n - 1)
        calibrated = (rank_arr * 100.0).round(2)
    else:
        calibrated = (r_raw_arr / max(r_raw_arr.max(), 1) * 100.0).round(2)

    df = df.with_columns([
        pl.Series("risk_score", calibrated.tolist()),
    ])

    # Assign risk labels
    def _risk_label(score: float) -> str:
        for threshold, label in LABEL_THRESHOLDS:
            if score >= threshold:
                return label
        return "Low"

    df = df.with_columns(
        pl.col("risk_score").map_elements(_risk_label, return_dtype=pl.Utf8).alias("risk_label")
    )

    # -----------------------------------------------------------------------
    # Sort and write final file
    # -----------------------------------------------------------------------
    df = df.sort("npi")
    df.write_parquet(output_file)
    volume.commit()
    print(f"[Merge] Final merged file: {output_file} ({len(df):,} rows)")

    # -----------------------------------------------------------------------
    # Upsert to Postgres (optional)
    # Merge runs in Modal cloud — localhost/127.0.0.1 is not reachable.
    # Skip cloud upsert for local URLs; user can run local upsert script.
    # -----------------------------------------------------------------------
    if upsert_to_db and postgres_url:
        is_local = (
            "localhost" in postgres_url.split("//")[-1].split("/")[0].lower()
            or "127.0.0.1" in postgres_url
        )
        if is_local:
            print("[Merge] Postgres URL is localhost — skipping upsert in cloud (Modal cannot reach your machine).")
            print("[Merge] To upsert into local Postgres, run: ./scripts/upsert_risk_scores_from_volume.sh")
        else:
            print("[Merge] Upserting to Postgres provider_risk_scores...")
            conn = psycopg2.connect(
                postgres_url,
                sslmode="require" if "neon.tech" in postgres_url else "prefer"
            )

            upsert_sql = """
                INSERT INTO provider_risk_scores (
                    npi, risk_score, risk_label, r_raw,
                    billing_outlier_score, billing_outlier_percentile,
                    ownership_chain_risk,
                    payment_trajectory_score, payment_trajectory_zscore,
                    exclusion_proximity_score, program_concentration_score,
                    peer_taxonomy, peer_state, peer_count,
                    data_window_years, flags, components, updated_at
                ) VALUES (
                    %(npi)s, %(risk_score)s, %(risk_label)s, %(r_raw)s,
                    %(billing_outlier_score)s, %(billing_outlier_percentile)s,
                    %(ownership_chain_risk)s,
                    %(payment_trajectory_score)s, %(payment_trajectory_zscore)s,
                    %(exclusion_proximity_score)s, %(program_concentration_score)s,
                    %(peer_taxonomy)s, %(peer_state)s, %(peer_count)s,
                    %(data_window_years)s, %(flags)s, %(components)s, %(updated_at)s
                )
                ON CONFLICT (npi) DO UPDATE SET
                    risk_score                  = EXCLUDED.risk_score,
                    risk_label                  = EXCLUDED.risk_label,
                    r_raw                       = EXCLUDED.r_raw,
                    billing_outlier_score       = EXCLUDED.billing_outlier_score,
                    billing_outlier_percentile  = EXCLUDED.billing_outlier_percentile,
                    ownership_chain_risk        = EXCLUDED.ownership_chain_risk,
                    payment_trajectory_score    = EXCLUDED.payment_trajectory_score,
                    payment_trajectory_zscore   = EXCLUDED.payment_trajectory_zscore,
                    exclusion_proximity_score   = EXCLUDED.exclusion_proximity_score,
                    program_concentration_score = EXCLUDED.program_concentration_score,
                    peer_taxonomy               = EXCLUDED.peer_taxonomy,
                    peer_state                  = EXCLUDED.peer_state,
                    peer_count                  = EXCLUDED.peer_count,
                    data_window_years           = EXCLUDED.data_window_years,
                    flags                       = EXCLUDED.flags,
                    components                  = EXCLUDED.components,
                    updated_at                  = EXCLUDED.updated_at
            """

            rows = df.to_dicts()
            # Ensure data_window_years is a list of ints for Postgres INTEGER[]
            for r in rows:
                val = r.get("data_window_years")
                if val is not None and isinstance(val, (list, tuple)):
                    r["data_window_years"] = [int(v) for v in val]
                else:
                    r["data_window_years"] = []

            with conn.cursor() as cur:
                psycopg2.extras.execute_batch(cur, upsert_sql, rows, page_size=500)
            conn.commit()
            conn.close()
            print("[Merge] Upsert complete")

    print(f"[Merge] Done — {datetime.now(timezone.utc).isoformat()}")
    return output_file


# ---------------------------------------------------------------------------
# Main Entrypoint — Fan Out All Batches
# ---------------------------------------------------------------------------

@app.local_entrypoint()
def main(
    batch_size: int = 1000,
    postgres_url: str = "",
    upsert_to_db: bool = True,
    providers_file: str = "data/modal_input/providers.parquet",
    max_batches: int = 0,
    merge_only: bool = False,
):
    """
    Main entrypoint: loads NPI list, splits into batches, fans out in parallel.

    Run prepare_modal_data.py first to create data/modal_input/*.parquet, then
    upload to Modal volume before running this.

    Run full pipeline:
        modal run etl/compute/claidex_modal.py \
            --postgres-url "postgresql://..." \
            --batch-size 1000 \
            --upsert-to-db

    Merge only (chunks already on volume; skip batch processing):
        modal run etl/compute/claidex_modal.py --merge-only --postgres-url "postgresql://..."

    Test Neo4j (first 2 batches only, no DB upsert):
        modal run etl/compute/claidex_modal.py --max-batches 2 --no-upsert-to-db

    Or in background (detached):
        modal run --detach etl/compute/claidex_modal.py
    """
    import polars as pl
    from dotenv import load_dotenv

    # Load .env for local postgres URL if not provided
    load_dotenv()
    if not postgres_url:
        postgres_url = os.environ.get("POSTGRES_URL") or os.environ.get("NEON_PROVIDERS_URL")

    # -------------------------------------------------------------------------
    # Merge only: use when all batch chunks are already on the volume
    # -------------------------------------------------------------------------
    if merge_only:
        print("=" * 80)
        print("Claidex Risk Score — Merge Only (global calibration + optional upsert)")
        print("=" * 80)
        print(f"Postgres URL: {postgres_url[:50]}..." if postgres_url else "No DB upsert")
        print(f"Upsert to DB: {upsert_to_db}")
        print()
        print("Merging results and performing global calibration...")
        final_path = merge_results.remote(
            postgres_url=postgres_url or "",
            upsert_to_db=upsert_to_db,
        )
        print()
        print("=" * 80)
        print("Done! Results:")
        print(f"  → Modal Volume: {final_path}")
        if upsert_to_db and postgres_url:
            print(f"  → Postgres table: provider_risk_scores")
        print()
        print("Download with:")
        print(f"  mkdir -p results && modal volume get claidex-data claidex_results_final.parquet ./results/final.parquet")
        print("=" * 80)
        return

    # -------------------------------------------------------------------------
    # Full pipeline: batches + merge
    # -------------------------------------------------------------------------
    print("=" * 80)
    print("Claidex Risk Score — Modal Parallel Batch Compute")
    print("=" * 80)
    print(f"Batch size: {batch_size}")
    print(f"Postgres URL: {postgres_url[:50]}..." if postgres_url else "No DB upsert")
    print(f"Upsert to DB: {upsert_to_db}")
    print()

    # Load NPI list from providers file in volume
    print("Loading NPI list from volume...")
    providers_df = pl.read_parquet(providers_file)
    all_npis = providers_df["npi"].unique().to_list()
    total = len(all_npis)
    print(f"Total NPIs: {total:,}")

    # Split into batches
    total_batch_count = math.ceil(total / batch_size)
    if max_batches and max_batches > 0:
        total_batch_count = min(total_batch_count, max_batches)
        print(f"(Limiting to first {max_batches} batches for test run)")
    batches = [
        (i, all_npis[i * batch_size : (i + 1) * batch_size])
        for i in range(total_batch_count)
    ]
    num_batches = len(batches)
    print(f"Total batches: {num_batches:,} (batch_size={batch_size})")
    print()

    # Fan out ALL batches in parallel using starmap
    print("Launching parallel batch processing on Modal...")
    print(f"  → Up to 300 containers will run concurrently")
    print(f"  → Each batch processes ~{batch_size} NPIs with 1 batched Neo4j query")
    print(f"  → Expected completion: ~5-15 minutes")
    print()

    results = []
    for result_path in process_npi_batch.starmap(
        [(idx, batch, postgres_url) for idx, batch in batches],
        order_outputs=False,
    ):
        if result_path:
            results.append(result_path)
            if len(results) % 100 == 0:
                print(f"  → {len(results)}/{num_batches} batches complete", end="\r")

    print(f"\n\nAll {len(results)} batches complete!")
    print()

    # Trigger merge step
    print("Merging results and performing global calibration...")
    final_path = merge_results.remote(
        postgres_url=postgres_url,
        upsert_to_db=upsert_to_db,
    )

    print()
    print("=" * 80)
    print("Done! Results:")
    print(f"  → Modal Volume: {final_path}")
    if upsert_to_db:
        print(f"  → Postgres table: provider_risk_scores")
    print()
    print("Download with:")
    print(f"  mkdir -p results && modal volume get claidex-data claidex_results_final.parquet ./results/final.parquet")
    print("=" * 80)


if __name__ == "__main__":
    # This allows local testing: python etl/compute/claidex_modal.py
    # But for Modal, use: modal run etl/compute/claidex_modal.py
    print("Use: modal run etl/compute/claidex_modal.py")
