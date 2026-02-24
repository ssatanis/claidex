"""
Validate Modal Results Against Local risk_scores.py
====================================================

Compares risk scores computed by the Modal parallel pipeline against
the original local risk_scores.py to ensure correctness.

Usage
-----
    # Download Modal results first:
    modal volume get claidex-data /data/claidex_results_final.parquet ./modal_results.parquet

    # Then validate:
    python etl/compute/validate_modal_results.py \
        --modal-results ./modal_results.parquet \
        --local-results ./local_results.parquet \
        --sample 100

    # Or compare against DB directly:
    python etl/compute/validate_modal_results.py \
        --modal-results ./modal_results.parquet \
        --from-db \
        --sample 100
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
from typing import Optional

import polars as pl
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv


def get_pg_conn() -> psycopg2.extensions.connection:
    """Get Postgres connection from environment variables."""
    load_dotenv(Path(__file__).parents[2] / ".env")
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


def load_from_db(npis: Optional[list[str]] = None) -> pl.DataFrame:
    """Load risk scores from Postgres provider_risk_scores table."""
    conn = get_pg_conn()

    npi_filter = ""
    params: list = []
    if npis:
        placeholders = ",".join(["%s"] * len(npis))
        npi_filter = f"WHERE npi IN ({placeholders})"
        params = list(npis)

    sql = f"""
        SELECT
            npi,
            risk_score,
            risk_label,
            r_raw,
            billing_outlier_score,
            billing_outlier_percentile,
            ownership_chain_risk,
            payment_trajectory_score,
            payment_trajectory_zscore,
            exclusion_proximity_score,
            program_concentration_score,
            peer_taxonomy,
            peer_state,
            peer_count
        FROM provider_risk_scores
        {npi_filter}
        ORDER BY npi
    """

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()

    conn.close()

    if not rows:
        return pl.DataFrame()

    return pl.DataFrame([dict(r) for r in rows])


def compare_dataframes(
    modal_df: pl.DataFrame,
    local_df: pl.DataFrame,
    tolerance: float = 0.01,
) -> dict:
    """
    Compare two risk score DataFrames and return validation metrics.

    Returns dict with:
        - total_npis: number of NPIs compared
        - missing_in_modal: NPIs in local but not modal
        - missing_in_local: NPIs in modal but not local
        - score_differences: list of NPIs with >tolerance difference
        - max_difference: largest absolute difference
        - mean_difference: mean absolute difference
        - identical_count: NPIs with exact matches
    """
    # Join on NPI
    compare = modal_df.join(local_df, on="npi", how="outer_coalesce", suffix="_local")

    # Identify missing NPIs
    missing_in_modal = compare.filter(pl.col("risk_score").is_null())["npi"].to_list()
    missing_in_local = compare.filter(pl.col("risk_score_local").is_null())["npi"].to_list()

    # Compare scores for NPIs present in both
    both = compare.filter(
        pl.col("risk_score").is_not_null() & pl.col("risk_score_local").is_not_null()
    )

    if both.is_empty():
        return {
            "total_npis": 0,
            "missing_in_modal": missing_in_modal,
            "missing_in_local": missing_in_local,
            "score_differences": [],
            "max_difference": 0.0,
            "mean_difference": 0.0,
            "identical_count": 0,
        }

    # Compute differences
    both = both.with_columns([
        (pl.col("risk_score") - pl.col("risk_score_local")).abs().alias("score_diff"),
        (pl.col("billing_outlier_score") - pl.col("billing_outlier_score_local")).abs().alias("billing_diff"),
        (pl.col("ownership_chain_risk") - pl.col("ownership_chain_risk_local")).abs().alias("ownership_diff"),
        (pl.col("payment_trajectory_score") - pl.col("payment_trajectory_score_local")).abs().alias("trajectory_diff"),
    ])

    score_differences = both.filter(pl.col("score_diff") > tolerance).select([
        "npi", "risk_score", "risk_score_local", "score_diff"
    ]).to_dicts()

    identical_count = len(both.filter(pl.col("score_diff") < 0.001))

    return {
        "total_npis": len(both),
        "missing_in_modal": missing_in_modal,
        "missing_in_local": missing_in_local,
        "score_differences": score_differences,
        "max_difference": float(both["score_diff"].max()),
        "mean_difference": float(both["score_diff"].mean()),
        "median_difference": float(both["score_diff"].median()),
        "identical_count": identical_count,
        "component_diffs": {
            "billing_max": float(both["billing_diff"].max()),
            "ownership_max": float(both["ownership_diff"].max()),
            "trajectory_max": float(both["trajectory_diff"].max()),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Validate Modal risk score results against local computation."
    )
    parser.add_argument(
        "--modal-results",
        type=Path,
        required=True,
        help="Path to Modal results parquet file",
    )
    parser.add_argument(
        "--local-results",
        type=Path,
        default=None,
        help="Path to local results parquet file (alternative to --from-db)",
    )
    parser.add_argument(
        "--from-db",
        action="store_true",
        help="Load local results from provider_risk_scores table instead of file",
    )
    parser.add_argument(
        "--sample",
        type=int,
        default=None,
        help="Validate only a random sample of N NPIs (faster for large datasets)",
    )
    parser.add_argument(
        "--tolerance",
        type=float,
        default=0.01,
        help="Acceptable difference threshold for risk scores (default: 0.01)",
    )
    args = parser.parse_args()

    if not args.local_results and not args.from_db:
        parser.error("Must specify either --local-results or --from-db")

    print("=" * 80)
    print("Claidex Risk Score Validation — Modal vs. Local")
    print("=" * 80)
    print()

    # Load Modal results
    print(f"Loading Modal results from {args.modal_results}...")
    modal_df = pl.read_parquet(args.modal_results)
    print(f"  ✓ {len(modal_df):,} NPIs")

    # Sample if requested
    if args.sample and args.sample < len(modal_df):
        print(f"  → Sampling {args.sample} random NPIs for validation")
        modal_df = modal_df.sample(n=args.sample, seed=42)
        sample_npis = modal_df["npi"].to_list()
    else:
        sample_npis = None

    print()

    # Load local/DB results
    if args.from_db:
        print("Loading results from provider_risk_scores table...")
        local_df = load_from_db(npis=sample_npis)
        print(f"  ✓ {len(local_df):,} NPIs")
    else:
        print(f"Loading local results from {args.local_results}...")
        local_df = pl.read_parquet(args.local_results)
        if sample_npis:
            local_df = local_df.filter(pl.col("npi").is_in(sample_npis))
        print(f"  ✓ {len(local_df):,} NPIs")

    print()

    # Compare
    print("Comparing results...")
    metrics = compare_dataframes(modal_df, local_df, tolerance=args.tolerance)

    print()
    print("=" * 80)
    print("Validation Results")
    print("=" * 80)
    print()

    print(f"Total NPIs compared:     {metrics['total_npis']:>12,}")
    print(f"Identical (< 0.001):     {metrics['identical_count']:>12,} "
          f"({100 * metrics['identical_count'] / max(metrics['total_npis'], 1):.1f}%)")
    print()

    print(f"Missing in Modal:        {len(metrics['missing_in_modal']):>12,}")
    if metrics['missing_in_modal'][:5]:
        print(f"  Example NPIs: {', '.join(metrics['missing_in_modal'][:5])}")

    print(f"Missing in Local:        {len(metrics['missing_in_local']):>12,}")
    if metrics['missing_in_local'][:5]:
        print(f"  Example NPIs: {', '.join(metrics['missing_in_local'][:5])}")

    print()
    print("Score Differences:")
    print(f"  Max difference:        {metrics['max_difference']:>12.4f}")
    print(f"  Mean difference:       {metrics['mean_difference']:>12.4f}")
    print(f"  Median difference:     {metrics['median_difference']:>12.4f}")
    print()

    print("Component Max Differences:")
    print(f"  Billing:               {metrics['component_diffs']['billing_max']:>12.4f}")
    print(f"  Ownership:             {metrics['component_diffs']['ownership_max']:>12.4f}")
    print(f"  Trajectory:            {metrics['component_diffs']['trajectory_max']:>12.4f}")
    print()

    # Show examples of differences
    if metrics['score_differences']:
        print(f"NPIs with difference > {args.tolerance}:")
        print(f"  Count: {len(metrics['score_differences'])}")
        print()
        print("  Top 10 differences:")
        for diff in sorted(metrics['score_differences'], key=lambda x: -x['score_diff'])[:10]:
            print(f"    NPI {diff['npi']}: Modal={diff['risk_score']:.2f}, "
                  f"Local={diff['risk_score_local']:.2f}, "
                  f"Diff={diff['score_diff']:.4f}")
    else:
        print(f"✓ All NPIs within tolerance ({args.tolerance})")

    print()

    # Overall verdict
    print("=" * 80)
    pct_identical = 100 * metrics['identical_count'] / max(metrics['total_npis'], 1)
    max_diff = metrics['max_difference']

    if pct_identical >= 95 and max_diff < 1.0:
        print("✓ PASS — Modal results match local within acceptable bounds")
        print(f"  {pct_identical:.1f}% identical, max diff {max_diff:.4f}")
    elif pct_identical >= 90:
        print("⚠ MARGINAL — Most results match, but some differences detected")
        print(f"  {pct_identical:.1f}% identical, max diff {max_diff:.4f}")
        print("  Review component differences above")
    else:
        print("✗ FAIL — Significant differences detected")
        print(f"  Only {pct_identical:.1f}% identical, max diff {max_diff:.4f}")
        print("  Investigate discrepancies before using Modal results")

    print("=" * 80)


if __name__ == "__main__":
    main()
