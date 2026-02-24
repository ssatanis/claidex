"""
Claidex Risk Score — batch compute engine
==========================================

Computes the five-component Claidex Risk Score for every provider that has
payment data and upserts the results into ``provider_risk_scores``.

Usage
-----
    # Full batch (all providers)
    python -m etl.compute.risk_scores

    # Single-NPI smoke test
    python -m etl.compute.risk_scores --npi 1316250707 1942248901

    # Dry run: compute but don't write to DB
    python -m etl.compute.risk_scores --dry-run

Components
----------
  1. billing_outlier_score     (w=0.30) — robust z-score vs taxonomy/state peers
  2. ownership_chain_risk      (w=0.25) — excluded providers in ownership chain
  3. payment_trajectory_score  (w=0.20) — YoY payment growth anomaly
  4. exclusion_proximity_score (w=0.15) — LEIE direct/chain exclusion
  5. program_concentration_score (w=0.10) — single-payer concentration
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import numpy as np
import polars as pl
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from neo4j import GraphDatabase

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Load .env with override=True so correct values win over polluted shell env (e.g. NEO4J_URI set to whole assignment line)
load_dotenv(Path(__file__).parents[2] / ".env", override=True)

# Temporal decay factor: recent years count more
ALPHA = 0.7

# Small constant for log-transform to avoid log(0)
EPSILON = 1.0

# Robust scale factor for MAD → σ equivalent
MAD_SCALE = 1.4826

# Min peer group size before falling back to taxonomy-only (no state filter)
PEER_MIN_SIZE = 50

# Min claims for a provider-year to be included in the peer group denominator
PEER_MIN_CLAIMS = 100

# How many past years to include
WINDOW_YEARS = 5

# Component weights (must sum to 1.0)
WEIGHTS = {
    "billing_outlier_score": 0.30,
    "ownership_chain_risk": 0.25,
    "payment_trajectory_score": 0.20,
    "exclusion_proximity_score": 0.15,
    "program_concentration_score": 0.10,
}

# Risk label thresholds
LABEL_THRESHOLDS = [
    (80.0, "High"),
    (60.0, "Elevated"),
    (30.0, "Moderate"),
    (0.0,  "Low"),
]


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

def get_pg_conn() -> psycopg2.extensions.connection:
    # Prefer local POSTGRES_URL when set (e.g. Docker) so payments_combined_v is used
    url = (
        os.environ.get("DATABASE_URL")
        or os.environ.get("POSTGRES_URL")
        or os.environ.get("NEON_PROVIDERS_URL")
    )
    if url:
        conn = psycopg2.connect(url, sslmode="require" if "neon.tech" in url else "prefer")
    else:
        conn = psycopg2.connect(
            host=os.environ.get("POSTGRES_HOST", "localhost"),
            port=int(os.environ.get("POSTGRES_PORT", "5432")),
            dbname=os.environ.get("POSTGRES_DB", "claidex"),
            user=os.environ.get("POSTGRES_USER", "claidex"),
            password=os.environ.get("POSTGRES_PASSWORD", ""),
        )
    return conn


def get_neo4j_driver():
    uri = os.environ.get("NEO4J_URI", "bolt://localhost:7687").strip()
    # If env was set to a whole assignment line (e.g. NEO4J_URI="neo4j+s://..."), extract the URI value
    if uri and not (uri.startswith("bolt") or uri.startswith("neo4j")):
        for prefix in ("NEO4J_URI=", "NEO4J_URI ="):
            if uri.upper().startswith(prefix.upper()):
                uri = uri[len(prefix):].strip().strip('"').strip("'")
                break
    user = os.environ.get("NEO4J_USER", "neo4j")
    password = os.environ.get("NEO4J_PASSWORD", "")
    return GraphDatabase.driver(uri, auth=(user, password))


def _neo4j_database(uri: str) -> str:
    """Resolve database name; Aura uses instance ID, not 'neo4j'."""
    db = os.environ.get("NEO4J_DATABASE", "").strip()
    if db:
        return db
    if "databases.neo4j.io" in (uri or ""):
        try:
            from urllib.parse import urlparse
            parsed = urlparse(uri)
            host = parsed.hostname or ""
            if host.endswith(".databases.neo4j.io"):
                return host.split(".")[0] or "neo4j"
        except Exception:
            pass
    return "neo4j"


# ---------------------------------------------------------------------------
# Statistical helpers (pure functions, easily unit-tested)
# ---------------------------------------------------------------------------

def robust_zscore(values: np.ndarray, target: float) -> float:
    """
    Compute a single robust z-score for *target* relative to *values*.

    Uses median and MAD (median absolute deviation) for robustness against
    outliers.  Result is capped to [-5, 5].
    """
    if len(values) == 0:
        return 0.0
    med = float(np.median(values))
    mad = float(np.median(np.abs(values - med)))
    if mad < 1e-9:
        # All peers identical: z = 0 if on-median, ±5 otherwise
        return float(np.clip((target - med) / 1e-9, -5.0, 5.0))
    z = (target - med) / (MAD_SCALE * mad)
    return float(np.clip(z, -5.0, 5.0))


def map_to_score(z: float) -> float:
    """Map a raw z-score to [0, 100] via logistic transform: 100 * σ(z/2)."""
    return 100.0 / (1.0 + math.exp(-z / 2.0))


def risk_label(score: float) -> str:
    for threshold, label in LABEL_THRESHOLDS:
        if score >= threshold:
            return label
    return "Low"


# ---------------------------------------------------------------------------
# Step 1 — Load payment data from Postgres
# ---------------------------------------------------------------------------

def load_payments(conn, npis: Optional[list[str]] = None) -> pl.DataFrame:
    """
    Load payments_combined_v (or fall back to raw tables if the view does not
    yet exist) for the requested NPI list or all providers.
    """
    cur_year = datetime.now(timezone.utc).year
    min_year = cur_year - WINDOW_YEARS

    npi_filter = ""
    params: list = [min_year]

    if npis:
        placeholders = ",".join([f"%s"] * len(npis))
        npi_filter = f"AND npi IN ({placeholders})"
        params = [min_year] + list(npis)

    sql = f"""
        SELECT
            npi,
            year,
            program,
            COALESCE(payments, 0)      AS payments,
            COALESCE(claims, 0)        AS claims,
            COALESCE(beneficiaries, 0) AS beneficiaries,
            taxonomy,
            state
        FROM payments_combined_v
        WHERE year >= %s
        {npi_filter}
        ORDER BY npi, year, program
    """
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()

    if not rows:
        return pl.DataFrame(schema={
            "npi": pl.Utf8, "year": pl.Int32, "program": pl.Utf8,
            "payments": pl.Float64, "claims": pl.Float64,
            "beneficiaries": pl.Float64, "taxonomy": pl.Utf8, "state": pl.Utf8,
        })

    schema = {
        "npi": pl.Utf8, "year": pl.Int32, "program": pl.Utf8,
        "payments": pl.Float64, "claims": pl.Float64,
        "beneficiaries": pl.Float64, "taxonomy": pl.Utf8, "state": pl.Utf8,
    }
    rows_data = {
        "npi": [str(r["npi"]) for r in rows],
        "year": [int(r["year"]) if r["year"] is not None else 0 for r in rows],
        "program": [str(r["program"]) if r["program"] else "" for r in rows],
        "payments": [float(r["payments"]) if r["payments"] is not None else 0.0 for r in rows],
        "claims": [float(r["claims"]) if r["claims"] is not None else 0.0 for r in rows],
        "beneficiaries": [float(r["beneficiaries"]) if r["beneficiaries"] is not None else 0.0 for r in rows],
        "taxonomy": [str(r["taxonomy"]) if r["taxonomy"] is not None else "Unknown" for r in rows],
        "state": [str(r["state"]) if r["state"] is not None else "Unknown" for r in rows],
    }
    return pl.DataFrame(rows_data, schema=schema)


def load_providers(conn, npis: Optional[list[str]] = None) -> pl.DataFrame:
    npi_filter = ""
    params: list = []
    if npis:
        placeholders = ",".join(["%s"] * len(npis))
        npi_filter = f"WHERE npi IN ({placeholders})"
        params = list(npis)

    sql = f"""
        SELECT npi, taxonomy_1, state, is_excluded, display_name
        FROM providers
        {npi_filter}
    """
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()

    if not rows:
        return pl.DataFrame(schema={
            "npi": pl.Utf8, "taxonomy_1": pl.Utf8,
            "state": pl.Utf8, "is_excluded": pl.Boolean, "display_name": pl.Utf8,
        })
    schema = {
        "npi": pl.Utf8, "taxonomy_1": pl.Utf8,
        "state": pl.Utf8, "is_excluded": pl.Boolean, "display_name": pl.Utf8,
    }
    rows_data = {
        "npi": [str(r["npi"]) for r in rows],
        "taxonomy_1": [str(r["taxonomy_1"]) if r["taxonomy_1"] is not None else "Unknown" for r in rows],
        "state": [str(r["state"]) if r["state"] is not None else "Unknown" for r in rows],
        "is_excluded": [bool(r["is_excluded"]) if r["is_excluded"] is not None else False for r in rows],
        "display_name": [str(r["display_name"]) if r["display_name"] is not None else "" for r in rows],
    }
    return pl.DataFrame(rows_data, schema=schema)


def load_exclusions(conn, npis: Optional[list[str]] = None) -> pl.DataFrame:
    npi_filter = ""
    params: list = []
    if npis:
        placeholders = ",".join(["%s"] * len(npis))
        npi_filter = f"WHERE npi IN ({placeholders})"
        params = list(npis)

    sql = f"""
        SELECT npi, excldate, reinstated
        FROM exclusions
        {npi_filter}
    """
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()

    if not rows:
        return pl.DataFrame(schema={
            "npi": pl.Utf8, "excldate": pl.Utf8, "reinstated": pl.Boolean,
        })
    schema = {"npi": pl.Utf8, "excldate": pl.Utf8, "reinstated": pl.Boolean}
    rows_data = {
        "npi": [str(r["npi"]) for r in rows],
        "excldate": [str(r["excldate"]) if r["excldate"] is not None else "" for r in rows],
        "reinstated": [bool(r["reinstated"]) if r["reinstated"] is not None else False for r in rows],
    }
    return pl.DataFrame(rows_data, schema=schema)


# ---------------------------------------------------------------------------
# Step 2 — Peer-group robust z-scores per (taxonomy_10, state, year)
# ---------------------------------------------------------------------------

def compute_peer_metrics(payments: pl.DataFrame) -> pl.DataFrame:
    """
    Aggregate payments to NPI-year level (sum across programs), compute
    m1/m2/m3 metrics, and attach peer-group robust z-scores.

    Fully vectorized: peer-group stats and z-scores via Polars group_by/join
    (no Python row loop). Returns a DataFrame keyed by (npi, year) with z-score columns.
    """
    # Aggregate across programs for a given NPI-year
    agg = (
        payments
        .group_by(["npi", "year", "taxonomy", "state"])
        .agg([
            pl.col("payments").sum().alias("total_payments"),
            pl.col("claims").sum().alias("total_claims"),
            pl.col("beneficiaries").sum().alias("total_beneficiaries"),
        ])
        .with_columns([
            pl.col("taxonomy").str.slice(0, 10).alias("taxonomy_10"),
            (
                pl.col("total_payments") /
                pl.col("total_claims").clip(lower_bound=1)
            ).alias("m1"),
            (
                pl.col("total_claims") /
                pl.col("total_beneficiaries").clip(lower_bound=1)
            ).alias("m2"),
            pl.col("total_payments").alias("m3"),
        ])
        .with_columns([
            (pl.col("m1") + EPSILON).log().alias("lm1"),
            (pl.col("m2") + EPSILON).log().alias("lm2"),
            (pl.col("m3") + EPSILON).log().alias("lm3"),
        ])
    )

    if agg.is_empty():
        return pl.DataFrame()

    # Eligible peers: >= PEER_MIN_CLAIMS claims
    peers = agg.filter(pl.col("total_claims") >= PEER_MIN_CLAIMS)

    # Primary peer-group stats: (taxonomy_10, state, year) — median and MAD for robust z
    def _med_mad(c: str):
        med = pl.col(c).median()
        return [
            med.alias(f"med_{c}"),
            (pl.col(c) - med).abs().median().alias(f"mad_{c}"),
        ]

    primary_stats = peers.group_by(["taxonomy_10", "state", "year"]).agg(
        [e for c in ("lm1", "lm2", "lm3") for e in _med_mad(c)]
        + [pl.len().alias("peer_count_primary")]
    )
    fallback_stats = peers.group_by(["taxonomy_10", "year"]).agg(
        [e for c in ("lm1", "lm2", "lm3") for e in _med_mad(c)]
        + [pl.len().alias("peer_count_fallback")]
    )

    # Join agg to primary and fallback stats; use primary when peer_count_primary >= PEER_MIN_SIZE
    agg = agg.join(primary_stats, on=["taxonomy_10", "state", "year"], how="left")
    agg = agg.join(
        fallback_stats,
        on=["taxonomy_10", "year"],
        how="left",
        suffix="_fallback",
    )

    use_primary = pl.col("peer_count_primary") >= PEER_MIN_SIZE
    for c in ("lm1", "lm2", "lm3"):
        med_primary = pl.col(f"med_{c}")
        mad_primary = pl.col(f"mad_{c}")
        med_fb = pl.col(f"med_{c}_fallback")
        mad_fb = pl.col(f"mad_{c}_fallback")
        med = pl.when(use_primary).then(med_primary).otherwise(med_fb)
        mad = pl.when(use_primary).then(mad_primary).otherwise(mad_fb)
        mad_safe = mad.clip(lower_bound=1e-9)
        z = (pl.col(c) - med) / (MAD_SCALE * mad_safe)
        agg = agg.with_columns(z.clip(-5.0, 5.0).alias(f"z_{c}"))

    peer_count = pl.when(use_primary).then(pl.col("peer_count_primary")).otherwise(pl.col("peer_count_fallback"))
    agg = agg.with_columns(peer_count.alias("peer_count"))

    # m1 percent rank within peer group: rank in primary or fallback group
    peers_rank = peers.with_columns([
        pl.col("m1").rank().over(["taxonomy_10", "state", "year"]).alias("m1_rank_primary"),
        pl.col("m1").count().over(["taxonomy_10", "state", "year"]).alias("m1_n_primary"),
        pl.col("m1").rank().over(["taxonomy_10", "year"]).alias("m1_rank_fallback"),
        pl.col("m1").count().over(["taxonomy_10", "year"]).alias("m1_n_fallback"),
    ])
    agg = agg.join(
        peers_rank.select([
            "npi", "year", "taxonomy_10", "state",
            "m1_rank_primary", "m1_n_primary", "m1_rank_fallback", "m1_n_fallback",
        ]),
        on=["npi", "year", "taxonomy_10", "state"],
        how="left",
    )
    use_primary_rank = pl.col("m1_n_primary") >= PEER_MIN_SIZE
    m1_rank = pl.when(use_primary_rank).then(pl.col("m1_rank_primary")).otherwise(pl.col("m1_rank_fallback"))
    m1_n = pl.when(use_primary_rank).then(pl.col("m1_n_primary")).otherwise(pl.col("m1_n_fallback"))
    m1_pct_rank = (m1_rank - 1) / (m1_n - 1)
    agg = agg.with_columns(
        (m1_pct_rank.fill_null(0.5) * 100.0).round(2).alias("m1_pct_rank")
    )

    # Drop helper columns and ensure z filled where peer_count was 0
    out = agg.select([
        "npi", "year", "taxonomy_10", "state", "peer_count",
        "m1", "m1_pct_rank", "z_lm1", "z_lm2", "z_lm3",
        "total_payments", "total_claims",
    ])
    out = out.with_columns([
        pl.col("z_lm1").fill_null(0.0),
        pl.col("z_lm2").fill_null(0.0),
        pl.col("z_lm3").fill_null(0.0),
        pl.col("peer_count").fill_null(0),
    ])
    return out



# ---------------------------------------------------------------------------
# Step 3 — Billing outlier score (Component 1)
# ---------------------------------------------------------------------------

def compute_billing_score(peer_metrics: pl.DataFrame) -> pl.DataFrame:
    """
    For each NPI, aggregate year-level z-scores with exponential temporal decay
    and map to [0, 100].  Vectorized with Polars group_by/agg.
    Returns (npi, billing_outlier_score, billing_outlier_percentile,
    peer_taxonomy, peer_state, peer_count, data_window_years).
    """
    if peer_metrics.is_empty():
        return pl.DataFrame()

    max_year = int(peer_metrics["year"].max())
    decay = peer_metrics.with_columns(
        (ALPHA ** (max_year - pl.col("year"))).alias("w_t")
    ).with_columns([
        pl.col("z_lm1").clip(lower_bound=0.0),
        pl.col("z_lm2").clip(lower_bound=0.0),
        pl.col("z_lm3").clip(lower_bound=0.0),
    ]).with_columns(
        ((pl.col("z_lm1") + pl.col("z_lm2") + pl.col("z_lm3")) / 3.0).alias("avg_z")
    )

    weighted = decay.with_columns((pl.col("w_t") * pl.col("avg_z")).alias("wz"))
    agg = weighted.group_by("npi").agg([
        pl.col("wz").sum().alias("weighted_sum"),
        pl.col("w_t").sum().alias("weight_total"),
        pl.col("m1_pct_rank").mean().alias("billing_outlier_percentile"),
        pl.col("year").sort(descending=True).alias("years"),
    ])
    agg = agg.with_columns(
        (pl.col("weighted_sum") / pl.col("weight_total").clip(lower_bound=1e-9)).alias("raw_z")
    )
    agg = agg.with_columns([
        (100.0 / (1.0 + (-pl.col("raw_z") / 2.0).exp())).round(2).alias("billing_outlier_score"),
        pl.col("billing_outlier_percentile").round(2),
        pl.col("years").list.sort().alias("data_window_years"),
    ])

    # Latest-year row per NPI for peer_taxonomy, peer_state, peer_count
    latest = (
        peer_metrics.sort(["npi", "year"], descending=[False, True])
        .group_by("npi")
        .first()
    )
    result = agg.join(
        latest.select(["npi", "taxonomy_10", "state", "peer_count"]),
        on="npi",
        how="left",
    ).rename({"taxonomy_10": "peer_taxonomy", "state": "peer_state"}).select([
        "npi", "billing_outlier_score", "billing_outlier_percentile",
        "peer_taxonomy", "peer_state", "peer_count", "data_window_years",
    ])
    return result.with_columns(pl.col("peer_count").cast(pl.Int64))

# ---------------------------------------------------------------------------
# Step 4 — Payment trajectory score (Component 3)
# ---------------------------------------------------------------------------

def compute_trajectory_score(peer_metrics: pl.DataFrame) -> pl.DataFrame:
    """
    Compute YoY payment growth rates per NPI, then robust z-score of each NPI's
    growth vs peers (taxonomy_10, state, year) and aggregate with temporal decay.
    Vectorized with Polars group_by/join. Returns (npi, payment_trajectory_score,
    payment_trajectory_zscore).
    """
    if peer_metrics.is_empty():
        return pl.DataFrame()

    # Compute per-NPI YoY growth (sorted ascending by year)
    npi_yearly = (
        peer_metrics
        .sort(["npi", "year"])
        .with_columns(
            pl.col("total_payments").shift(1).over("npi").alias("prev_payments")
        )
        .with_columns(
            (
                (pl.col("total_payments") - pl.col("prev_payments")) /
                pl.col("prev_payments").clip(lower_bound=1)
            ).alias("growth_rate")
        )
        .filter(pl.col("prev_payments").is_not_null())
    )

    if npi_yearly.is_empty():
        return pl.DataFrame()

    max_year = int(npi_yearly["year"].max())

    # Peer-group median and MAD for growth_rate per (taxonomy_10, state, year)
    gr_med = pl.col("growth_rate").median()
    gr_stats = npi_yearly.group_by(["taxonomy_10", "state", "year"]).agg(
        gr_med.alias("med_gr"),
        (pl.col("growth_rate") - gr_med).abs().median().alias("mad_gr"),
        pl.len().alias("n_gr"),
    )
    npi_yearly = npi_yearly.join(gr_stats, on=["taxonomy_10", "state", "year"], how="left")
    mad_safe = pl.col("mad_gr").clip(lower_bound=1e-9)
    z_gr = (pl.col("growth_rate") - pl.col("med_gr")) / (MAD_SCALE * mad_safe)
    npi_yearly = npi_yearly.with_columns(
        z_gr.clip(-5.0, 5.0).clip(lower_bound=0.0).alias("z_g")
    )
    # Where peer group too small, z_g stays null -> fill 0
    npi_yearly = npi_yearly.with_columns(pl.col("z_g").fill_null(0.0))

    # Temporal decay weight and weighted z
    npi_yearly = npi_yearly.with_columns(
        (ALPHA ** (max_year - pl.col("year"))).alias("w_t")
    ).with_columns((pl.col("w_t") * pl.col("z_g")).alias("wz"))

    agg = npi_yearly.group_by("npi").agg([
        pl.col("wz").sum().alias("weighted_sum"),
        pl.col("w_t").sum().alias("weight_total"),
    ])
    agg = agg.with_columns(
        (pl.col("weighted_sum") / pl.col("weight_total").clip(lower_bound=1e-9)).alias("payment_trajectory_zscore")
    )
    agg = agg.with_columns(
        (100.0 / (1.0 + (-pl.col("payment_trajectory_zscore") / 2.0).exp())).round(2).alias("payment_trajectory_score"),
        pl.col("payment_trajectory_zscore").round(4),
    )
    return agg.select(["npi", "payment_trajectory_score", "payment_trajectory_zscore"])


# ---------------------------------------------------------------------------
# Step 5 — Program concentration score (Component 5)
# ---------------------------------------------------------------------------

def compute_program_concentration(payments: pl.DataFrame) -> pl.DataFrame:
    """
    Compute program share over the most-recent 3 years.  Returns
    (npi, program_concentration_score).
    """
    if payments.is_empty():
        return pl.DataFrame()

    max_year = int(payments["year"].max())
    recent = payments.filter(pl.col("year") >= max_year - 2)

    npi_program = (
        recent
        .group_by(["npi", "program"])
        .agg(pl.col("payments").sum().alias("prog_total"))
    )
    npi_total = (
        recent
        .group_by("npi")
        .agg(pl.col("payments").sum().alias("grand_total"))
    )

    joined = npi_program.join(npi_total, on="npi", how="left")
    joined = joined.with_columns(
        (pl.col("prog_total") / pl.col("grand_total").clip(lower_bound=1)).alias("share")
    )

    max_shares = (
        joined
        .group_by("npi")
        .agg(pl.col("share").max().alias("max_share"))
        .with_columns(
            pl.when(pl.col("max_share") > 0.5)
            .then(
                (200.0 * (pl.col("max_share") - 0.5)).clip(upper_bound=100.0)
            )
            .otherwise(0.0)
            .alias("program_concentration_score")
        )
        .select(["npi", "program_concentration_score"])
        .with_columns(
            pl.col("program_concentration_score").round(2)
        )
    )
    return max_shares


# ---------------------------------------------------------------------------
# Step 6 — Exclusion proximity score (Component 4)
# ---------------------------------------------------------------------------

def compute_exclusion_proximity(
    exclusions_df: pl.DataFrame,
    providers_df: pl.DataFrame,
    chain_excluded: dict[str, int],   # npi → count of excluded providers in chain
    owner_excluded: set[str],         # npi set whose direct owner is excluded
) -> pl.DataFrame:
    """
    Returns (npi, exclusion_proximity_score).

    Rules:
      - Provider directly excluded        → 100
      - Owning entity directly excluded   →  80
      - Chain contains excluded providers →  50
      - Otherwise                         →   0
    """
    # Direct exclusions from exclusions table (active: reinstated == False)
    if not exclusions_df.is_empty():
        active_excl = exclusions_df.filter(
            pl.col("reinstated").fill_null(False) == False  # noqa: E712
        )
        directly_excluded: set[str] = set(active_excl["npi"].to_list())
    else:
        directly_excluded = set()

    all_npis = providers_df["npi"].to_list()
    rows = []
    for npi in all_npis:
        if npi in directly_excluded:
            score = 100.0
        elif npi in owner_excluded:
            score = 80.0
        elif chain_excluded.get(npi, 0) > 0:
            score = 50.0
        else:
            score = 0.0
        rows.append({"npi": npi, "exclusion_proximity_score": score})

    return pl.DataFrame(rows)


# ---------------------------------------------------------------------------
# Step 7 — Ownership chain risk + exclusion proximity (Component 2 & 4 via Neo4j)
# ---------------------------------------------------------------------------

def query_neo4j_ownership(
    driver,
    npi: str,
    provider_name: str,
) -> dict:
    """
    Query Neo4j for the ownership chain of a provider (via SNF entity name match)
    and compute:
      - chain_provider_count
      - chain_excluded_provider_count (distance-weighted)
      - owner_excluded (True if immediate owner entity has EXCLUDED_BY)
    """
    # Find the SNF entity matching this provider name, then traverse its
    # ownership chain to collect all sibling/child CorporateEntities and their
    # associated providers.
    cypher = """
    MATCH (snf:CorporateEntity)
    WHERE snf.entityType = 'SNF'
      AND toLower(snf.name) CONTAINS toLower($name)
    WITH snf LIMIT 1

    // Traverse up the ownership chain
    OPTIONAL MATCH path = (snf)<-[:OWNS*1..5]-(ancestor:CorporateEntity)

    // All entities in the chain (snf + ancestors)
    WITH snf,
         [snf] + COALESCE(collect(DISTINCT ancestor), []) AS chain_entities

    // Expand back down: all SNFs owned by these ancestors
    UNWIND chain_entities AS ce
    OPTIONAL MATCH (ce)-[:OWNS*0..5]->(sibling:CorporateEntity)
    WITH snf, collect(DISTINCT sibling) AS siblings
    WITH [e IN siblings WHERE e IS NOT NULL | e] + [snf] AS all_entities

    // Find providers associated with these entities (by name containment)
    UNWIND all_entities AS ent
    OPTIONAL MATCH (p2:Provider)
    WHERE toLower(p2.name) CONTAINS toLower(ent.name)
      AND ent.name IS NOT NULL AND ent.name <> ''
    OPTIONAL MATCH (p2)-[:EXCLUDED_BY]->(x:Exclusion)

    // Check if any owning entity has EXCLUDED_BY
    OPTIONAL MATCH (ent)-[:EXCLUDED_BY]->(ox:Exclusion)

    RETURN
        count(DISTINCT p2)                              AS chain_provider_count,
        count(DISTINCT CASE WHEN x IS NOT NULL THEN p2 END) AS chain_excluded_count,
        count(DISTINCT CASE WHEN ox IS NOT NULL THEN ent END) AS owner_excluded_count
    """
    uri = os.environ.get("NEO4J_URI", "").strip()
    if uri and not (uri.startswith("bolt") or uri.startswith("neo4j")):
        for prefix in ("NEO4J_URI=", "NEO4J_URI ="):
            if uri.upper().startswith(prefix.upper()):
                uri = uri[len(prefix):].strip().strip('"').strip("'")
                break
    database = _neo4j_database(uri)
    try:
        with driver.session(database=database) as session:
            result = session.run(cypher, {"name": provider_name})
            record = result.single()
            if record is None:
                return {"chain_provider_count": 0, "chain_excluded_count": 0, "owner_excluded": False}
            return {
                "chain_provider_count": int(record["chain_provider_count"] or 0),
                "chain_excluded_count": int(record["chain_excluded_count"] or 0),
                "owner_excluded": int(record["owner_excluded_count"] or 0) > 0,
            }
    except Exception as exc:
        print(f"[risk] Neo4j query failed for NPI {npi}: {exc}", file=sys.stderr)
        return {"chain_provider_count": 0, "chain_excluded_count": 0, "owner_excluded": False}


def compute_ownership_chain_risk(chain_data: dict) -> float:
    """
    ownership_chain_risk = min(100, 100 * excluded / max(total, 1))

    For this simplified single-query implementation we treat all excluded
    providers in the chain at full weight (distance information not available
    without per-pair shortest-path queries).
    """
    total = max(chain_data["chain_provider_count"], 1)
    excluded = chain_data["chain_excluded_count"]
    return min(100.0, 100.0 * excluded / total)


# ---------------------------------------------------------------------------
# Step 8 — Generate human-readable flags
# ---------------------------------------------------------------------------

def generate_flags(
    billing_outlier_score: float,
    billing_outlier_percentile: float,
    ownership_chain_risk: float,
    payment_trajectory_score: float,
    exclusion_proximity_score: float,
    program_concentration_score: float,
    chain_excluded_count: int,
    top_program: Optional[str] = None,
) -> list[str]:
    flags: list[str] = []

    if billing_outlier_percentile >= 95:
        flags.append(
            "Billing > 95th percentile vs. state/taxonomy peers (payments per claim)."
        )
    if billing_outlier_score >= 80 and payment_trajectory_score >= 60:
        flags.append("Rapid growth and high billing intensity vs. peers.")
    if ownership_chain_risk >= 50:
        suffix = (
            f"Ownership chain includes {chain_excluded_count} excluded provider"
            f"{'s' if chain_excluded_count != 1 else ''}."
        )
        flags.append(suffix)
    if program_concentration_score >= 60:
        prog_label = f" ({top_program})" if top_program else ""
        flags.append(f"Highly concentrated in a single payer program{prog_label}.")
    if exclusion_proximity_score >= 80:
        flags.append("Direct or owner-level exclusion on record.")

    return flags


# ---------------------------------------------------------------------------
# Step 9 — Composite scoring + global calibration
# ---------------------------------------------------------------------------

def compute_composite(scores: pl.DataFrame) -> pl.DataFrame:
    """
    Apply component weights, compute R_raw, then calibrate to a global
    percentile rank scaled to [0, 100].
    """
    scores = scores.with_columns([
        (
            pl.col("billing_outlier_score")       * WEIGHTS["billing_outlier_score"] +
            pl.col("ownership_chain_risk")         * WEIGHTS["ownership_chain_risk"] +
            pl.col("payment_trajectory_score")     * WEIGHTS["payment_trajectory_score"] +
            pl.col("exclusion_proximity_score")    * WEIGHTS["exclusion_proximity_score"] +
            pl.col("program_concentration_score")  * WEIGHTS["program_concentration_score"]
        ).alias("r_raw"),
    ])

    # Global PERCENT_RANK calibration — rescale r_raw to [0, 100]
    r_raw_arr = scores["r_raw"].to_numpy()
    n = len(r_raw_arr)
    if n > 1:
        # For each value, percent_rank = rank / (n - 1) (using dense rank via argsort)
        order = np.argsort(r_raw_arr)
        rank_arr = np.empty(n, dtype=float)
        rank_arr[order] = np.arange(n) / (n - 1)
        calibrated = (rank_arr * 100.0).round(2)
    else:
        calibrated = (r_raw_arr / max(r_raw_arr.max(), 1) * 100.0).round(2)

    scores = scores.with_columns(
        pl.Series("risk_score", calibrated.tolist())
    )
    scores = scores.with_columns(
        pl.col("risk_score").map_elements(
            risk_label, return_dtype=pl.Utf8
        ).alias("risk_label")
    )
    return scores


# ---------------------------------------------------------------------------
# Step 10 — Bulk upsert
# ---------------------------------------------------------------------------

def upsert_risk_scores(conn, rows: list[dict]) -> None:
    sql = """
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
    with conn.cursor() as cur:
        psycopg2.extras.execute_batch(cur, sql, rows, page_size=500)
    conn.commit()


# ---------------------------------------------------------------------------
# Main orchestration
# ---------------------------------------------------------------------------

def _run_pipeline(
    payments: pl.DataFrame,
    providers_df: pl.DataFrame,
    exclusions_df: pl.DataFrame,
    output_conn,           # psycopg2 connection for upsert (closed by caller)
    neo4j_driver=None,
    dry_run: bool = False,
) -> pl.DataFrame:
    """
    Core compute pipeline operating on pre-loaded DataFrames.
    ``output_conn`` must be open; the caller is responsible for closing it.
    Returns the final scores DataFrame.
    """
    all_npis = payments["npi"].unique().to_list()

    # ------------------------------------------------------------------
    # Component 1 & billing percentile
    # ------------------------------------------------------------------
    print("[risk] Computing peer-group metrics…")
    peer_metrics = compute_peer_metrics(payments)
    print(f"[risk]   {len(peer_metrics):,} NPI-year rows with z-scores")

    print("[risk] Computing billing outlier scores…")
    billing_df = compute_billing_score(peer_metrics)
    print(f"[risk]   {len(billing_df):,} providers with billing scores")

    # ------------------------------------------------------------------
    # Component 3 — trajectory
    # ------------------------------------------------------------------
    print("[risk] Computing payment trajectory scores…")
    trajectory_df = compute_trajectory_score(peer_metrics)

    # ------------------------------------------------------------------
    # Component 5 — program concentration
    # ------------------------------------------------------------------
    print("[risk] Computing program concentration scores…")
    conc_df = compute_program_concentration(payments)

    max_year = int(payments["year"].max())
    recent_payments = payments.filter(pl.col("year") >= max_year - 2)
    top_program_df = (
        recent_payments
        .group_by(["npi", "program"])
        .agg(pl.col("payments").sum().alias("prog_total"))
        .sort(["npi", "prog_total"], descending=[False, True])
        .group_by("npi")
        .agg(pl.col("program").first().alias("top_program"))
    )

    # ------------------------------------------------------------------
    # Components 2 & 4 — Neo4j (ownership chain + exclusion proximity)
    # ------------------------------------------------------------------
    print("[risk] Computing Neo4j ownership chain risk…")
    chain_excluded_counts: dict[str, int] = {}
    owner_excluded_set: set[str] = set()
    ownership_risk_rows: list[dict] = []

    if neo4j_driver is not None:
        name_lookup: dict[str, str] = {}
        for row in providers_df.iter_rows(named=True):
            name_lookup[row["npi"]] = row.get("display_name") or ""

        for i, npi in enumerate(all_npis):
            if i % 500 == 0:
                print(f"[risk]   …Neo4j {i}/{len(all_npis)}", end="\r")
            name = name_lookup.get(npi, "")
            chain_data = query_neo4j_ownership(neo4j_driver, npi, name)
            oc_risk = compute_ownership_chain_risk(chain_data)
            chain_excluded_counts[npi] = chain_data["chain_excluded_count"]
            if chain_data["owner_excluded"]:
                owner_excluded_set.add(npi)
            ownership_risk_rows.append({
                "npi": npi,
                "ownership_chain_risk": round(oc_risk, 2),
                "chain_excluded_count": chain_data["chain_excluded_count"],
            })
        print()
    else:
        for npi in all_npis:
            ownership_risk_rows.append({
                "npi": npi,
                "ownership_chain_risk": 0.0,
                "chain_excluded_count": 0,
            })

    ownership_df = pl.DataFrame(ownership_risk_rows)

    # ------------------------------------------------------------------
    # Component 4 — exclusion proximity
    # ------------------------------------------------------------------
    print("[risk] Computing exclusion proximity scores…")
    excl_prox_df = compute_exclusion_proximity(
        exclusions_df, providers_df, chain_excluded_counts, owner_excluded_set
    )

    # ------------------------------------------------------------------
    # Merge all components
    # ------------------------------------------------------------------
    print("[risk] Merging components…")
    scores = billing_df

    for df in (trajectory_df, conc_df, ownership_df, excl_prox_df, top_program_df):
        if not df.is_empty():
            common_cols = set(scores.columns) & set(df.columns) - {"npi"}
            if common_cols:
                df = df.drop(list(common_cols))
            scores = scores.join(df, on="npi", how="left")

    for col in ("payment_trajectory_score", "payment_trajectory_zscore",
                "program_concentration_score", "ownership_chain_risk",
                "exclusion_proximity_score", "chain_excluded_count"):
        if col in scores.columns:
            scores = scores.with_columns(pl.col(col).fill_null(0.0))
        else:
            scores = scores.with_columns(pl.lit(0.0).alias(col))

    # ------------------------------------------------------------------
    # Composite + global calibration
    # ------------------------------------------------------------------
    print("[risk] Computing composite scores + global calibration…")
    scores = compute_composite(scores)

    # ------------------------------------------------------------------
    # Generate flags
    # ------------------------------------------------------------------
    print("[risk] Generating flags…")
    now_iso = datetime.now(timezone.utc).isoformat()
    upsert_rows: list[dict] = []

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
        upsert_rows.append({
            "npi": row["npi"],
            "risk_score": row.get("risk_score", 0.0),
            "risk_label": row.get("risk_label", "Low"),
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

    print(f"[risk] {len(upsert_rows):,} providers scored")

    if not dry_run:
        print("[risk] Upserting to provider_risk_scores…")
        upsert_risk_scores(output_conn, upsert_rows)
        print("[risk] Upsert complete.")
    else:
        print("[risk] Dry run — skipping DB write.")
        for r in upsert_rows[:5]:
            print(f"  NPI {r['npi']}: score={r['risk_score']}, label={r['risk_label']}, "
                  f"billing={r['billing_outlier_score']}, ownership={r['ownership_chain_risk']}")

    print(f"[risk] Done — {datetime.now(timezone.utc).isoformat()}")
    return scores


def run_from_frames(
    payments: pl.DataFrame,
    providers_df: pl.DataFrame,
    exclusions_df: pl.DataFrame,
    output_pg_url: str,
    neo4j_driver=None,
    dry_run: bool = False,
    npis: Optional[list[str]] = None,
) -> pl.DataFrame:
    """
    Run the full risk-score pipeline from pre-loaded DataFrames.

    Designed for Modal / cloud execution where data is loaded from Parquet/R2
    rather than from a Postgres connection.

    Parameters
    ----------
    payments     : DataFrame matching payments_combined_v schema
                   (npi, year, program, payments, claims, beneficiaries, taxonomy, state)
    providers_df : DataFrame matching providers table schema
                   (npi, taxonomy_1, state, is_excluded, display_name)
    exclusions_df: DataFrame with columns npi, excldate, reinstated
    output_pg_url: Postgres connection URL for upserting results
    neo4j_driver : Optional Neo4j driver; if None ownership scores are 0
    dry_run      : If True, compute but do not write to DB
    npis         : Optional NPI filter list (subset of provided data)
    """
    print(f"[risk] Starting Claidex Risk Score compute (from frames) — {datetime.now(timezone.utc).isoformat()}")

    if npis:
        print(f"[risk] NPI filter: {npis}")
        payments = payments.filter(pl.col("npi").is_in(npis))
        providers_df = providers_df.filter(pl.col("npi").is_in(npis))
        exclusions_df = exclusions_df.filter(pl.col("npi").is_in(npis))

    print(f"[risk]   {len(payments):,} payment rows")
    print(f"[risk]   {len(providers_df):,} provider rows")
    print(f"[risk]   {len(exclusions_df):,} exclusion rows")

    if payments.is_empty():
        print("[risk] No payment data found. Exiting.")
        return pl.DataFrame()

    conn = psycopg2.connect(output_pg_url, sslmode="require" if "neon.tech" in output_pg_url else "prefer")
    try:
        scores = _run_pipeline(
            payments, providers_df, exclusions_df,
            output_conn=conn, neo4j_driver=neo4j_driver, dry_run=dry_run,
        )
    finally:
        conn.close()
        if neo4j_driver:
            neo4j_driver.close()

    print(f"[risk] Done — {datetime.now(timezone.utc).isoformat()}")
    return scores


# ---------------------------------------------------------------------------
# Main orchestration (DB-backed entry point — local / Docker)
# ---------------------------------------------------------------------------

def run(npis: Optional[list[str]] = None, dry_run: bool = False) -> pl.DataFrame:
    """
    Full risk-score pipeline.  Returns the final scores DataFrame.
    """
    print(f"[risk] Starting Claidex Risk Score compute — {datetime.now(timezone.utc).isoformat()}")
    if npis:
        print(f"[risk] NPI filter: {npis}")

    conn = get_pg_conn()
    neo4j_driver = None
    try:
        neo4j_driver = get_neo4j_driver()
        neo4j_driver.verify_connectivity()
        print("[risk] Neo4j connectivity OK")
    except Exception as exc:
        print(f"[risk] WARNING: Neo4j unavailable — ownership scores will be 0. ({exc})", file=sys.stderr)
        neo4j_driver = None

    # ------------------------------------------------------------------
    # Load raw data
    # ------------------------------------------------------------------
    print("[risk] Loading payments…")
    payments = load_payments(conn, npis)
    print(f"[risk]   {len(payments):,} payment rows")

    if payments.is_empty():
        print("[risk] No payment data found. Exiting.")
        return pl.DataFrame()

    print("[risk] Loading providers…")
    all_npis = payments["npi"].unique().to_list()
    providers_df = load_providers(conn, all_npis)
    print(f"[risk]   {len(providers_df):,} provider rows")

    print("[risk] Loading exclusions…")
    exclusions_df = load_exclusions(conn, all_npis)
    print(f"[risk]   {len(exclusions_df):,} exclusion rows")

    # ------------------------------------------------------------------
    # Component 1 & billing percentile
    # ------------------------------------------------------------------
    print("[risk] Computing peer-group metrics…")
    peer_metrics = compute_peer_metrics(payments)
    print(f"[risk]   {len(peer_metrics):,} NPI-year rows with z-scores")

    print("[risk] Computing billing outlier scores…")
    billing_df = compute_billing_score(peer_metrics)
    print(f"[risk]   {len(billing_df):,} providers with billing scores")

    # ------------------------------------------------------------------
    # Component 3 — trajectory
    # ------------------------------------------------------------------
    print("[risk] Computing payment trajectory scores…")
    trajectory_df = compute_trajectory_score(peer_metrics)

    # ------------------------------------------------------------------
    # Component 5 — program concentration
    # ------------------------------------------------------------------
    print("[risk] Computing program concentration scores…")
    conc_df = compute_program_concentration(payments)

    # Resolve top program per NPI (for flag text)
    max_year = int(payments["year"].max())
    recent_payments = payments.filter(pl.col("year") >= max_year - 2)
    top_program_df = (
        recent_payments
        .group_by(["npi", "program"])
        .agg(pl.col("payments").sum().alias("prog_total"))
        .sort(["npi", "prog_total"], descending=[False, True])
        .group_by("npi")
        .agg(pl.col("program").first().alias("top_program"))
    )

    # ------------------------------------------------------------------
    # Components 2 & 4 — Neo4j (ownership chain + exclusion proximity)
    # ------------------------------------------------------------------
    print("[risk] Computing Neo4j ownership chain risk…")
    chain_excluded_counts: dict[str, int] = {}
    owner_excluded_set: set[str] = set()
    ownership_risk_rows: list[dict] = []

    if neo4j_driver is not None:
        # Build a npi → display_name lookup
        name_lookup: dict[str, str] = {}
        for row in providers_df.iter_rows(named=True):
            name_lookup[row["npi"]] = row.get("display_name") or ""

        for i, npi in enumerate(all_npis):
            if i % 500 == 0:
                print(f"[risk]   …Neo4j {i}/{len(all_npis)}", end="\r")
            name = name_lookup.get(npi, "")
            chain_data = query_neo4j_ownership(neo4j_driver, npi, name)
            oc_risk = compute_ownership_chain_risk(chain_data)
            chain_excluded_counts[npi] = chain_data["chain_excluded_count"]
            if chain_data["owner_excluded"]:
                owner_excluded_set.add(npi)
            ownership_risk_rows.append({
                "npi": npi,
                "ownership_chain_risk": round(oc_risk, 2),
                "chain_excluded_count": chain_data["chain_excluded_count"],
            })
        print()
    else:
        for npi in all_npis:
            ownership_risk_rows.append({
                "npi": npi,
                "ownership_chain_risk": 0.0,
                "chain_excluded_count": 0,
            })

    ownership_df = pl.DataFrame(ownership_risk_rows)

    # ------------------------------------------------------------------
    # Component 4 — exclusion proximity
    # ------------------------------------------------------------------
    print("[risk] Computing exclusion proximity scores…")
    excl_prox_df = compute_exclusion_proximity(
        exclusions_df, providers_df, chain_excluded_counts, owner_excluded_set
    )

    # ------------------------------------------------------------------
    # Merge all components
    # ------------------------------------------------------------------
    print("[risk] Merging components…")
    scores = billing_df  # has npi, peer_taxonomy, peer_state, peer_count, data_window_years

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

    # ------------------------------------------------------------------
    # Composite + global calibration
    # ------------------------------------------------------------------
    print("[risk] Computing composite scores + global calibration…")
    scores = compute_composite(scores)

    # ------------------------------------------------------------------
    # Generate flags and upsert to DB
    # ------------------------------------------------------------------
    print("[risk] Generating flags…")
    now_iso = datetime.now(timezone.utc).isoformat()
    upsert_rows: list[dict] = []

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
        upsert_rows.append({
            "npi": row["npi"],
            "risk_score": row.get("risk_score", 0.0),
            "risk_label": row.get("risk_label", "Low"),
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

    print(f"[risk] {len(upsert_rows):,} providers scored")

    if not dry_run:
        print("[risk] Upserting to provider_risk_scores…")
        upsert_risk_scores(conn, upsert_rows)
        print("[risk] Upsert complete.")
    else:
        print("[risk] Dry run — skipping DB write.")
        for r in upsert_rows[:5]:
            print(f"  NPI {r['npi']}: score={r['risk_score']}, label={r['risk_label']}, "
                  f"billing={r['billing_outlier_score']}, ownership={r['ownership_chain_risk']}")

    print(f"[risk] Done — {datetime.now(timezone.utc).isoformat()}")
    return scores


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Compute Claidex Risk Scores and upsert to provider_risk_scores."
    )
    parser.add_argument(
        "--npi", nargs="*", metavar="NPI",
        help="Limit computation to specific NPI(s). Omit for full batch.",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Compute scores but do not write to the database.",
    )
    args = parser.parse_args()
    run(npis=args.npi or None, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
