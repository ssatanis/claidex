"""
Prepare Claidex Risk Score Input Data for Modal
================================================

Exports providers, payments, and exclusions from Postgres to Parquet files
suitable for upload to Modal volume.

Usage
-----
    # Export all data
    python etl/compute/prepare_modal_data.py

    # Export only recent data (last N years)
    python etl/compute/prepare_modal_data.py --years 3

    # Custom output directory
    python etl/compute/prepare_modal_data.py --output ./my_data/

    # Dry run (show row counts without writing files)
    python etl/compute/prepare_modal_data.py --dry-run
"""

from __future__ import annotations

import argparse
import os
from datetime import datetime, timezone
from pathlib import Path

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


def export_providers(conn, output_dir: Path, dry_run: bool = False) -> int:
    """
    Export providers table to parquet.

    Required columns: npi, taxonomy_1, state, is_excluded, display_name
    """
    print("[1/3] Exporting providers...")

    sql = """
        SELECT
            npi,
            taxonomy_1,
            state,
            is_excluded,
            display_name,
            updated_at
        FROM providers
        ORDER BY npi
    """

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql)
        rows = cur.fetchall()

    if not rows:
        print("  ✗ No providers found")
        return 0

    # Convert to DataFrame with explicit handling of NULL values
    df = pl.DataFrame({
        'npi': [r['npi'] for r in rows],
        'taxonomy_1': [r['taxonomy_1'] if r['taxonomy_1'] is not None else 'Unknown' for r in rows],
        'state': [r['state'] if r['state'] is not None else 'Unknown' for r in rows],
        'is_excluded': [bool(r['is_excluded']) if r['is_excluded'] is not None else False for r in rows],
        'display_name': [r['display_name'] if r['display_name'] is not None else '' for r in rows],
        'updated_at': [r['updated_at'] for r in rows],
    })
    print(f"  ✓ {len(df):,} providers")

    if not dry_run:
        output_path = output_dir / "providers.parquet"
        df.write_parquet(output_path)
        file_size = output_path.stat().st_size / (1024 * 1024)
        print(f"  → {output_path} ({file_size:.1f} MB)")

    return len(df)


def export_exclusions(conn, output_dir: Path, dry_run: bool = False) -> int:
    """
    Export exclusions table to parquet.

    Required columns: npi, excldate, reinstated
    """
    print("[2/3] Exporting exclusions...")

    sql = """
        SELECT
            npi,
            excldate,
            reinstated
        FROM exclusions
        ORDER BY npi
    """

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql)
        rows = cur.fetchall()

    if not rows:
        print("  ⚠ No exclusions found (this is OK, table may be empty)")
        # Create empty DataFrame with correct schema
        df = pl.DataFrame(schema={
            "npi": pl.Utf8,
            "excldate": pl.Utf8,
            "reinstated": pl.Boolean,
        })
    else:
        # Convert to DataFrame with explicit handling of NULL values
        df = pl.DataFrame({
            'npi': [r['npi'] for r in rows],
            'excldate': [str(r['excldate']) if r['excldate'] is not None else '' for r in rows],
            'reinstated': [bool(r['reinstated']) if r['reinstated'] is not None else False for r in rows],
        })

    print(f"  ✓ {len(df):,} exclusion records")

    if not dry_run:
        output_path = output_dir / "exclusions.parquet"
        df.write_parquet(output_path)
        file_size = output_path.stat().st_size / (1024 * 1024) if len(df) > 0 else 0
        print(f"  → {output_path} ({file_size:.1f} MB)")

    return len(df)


def export_payments(
    conn,
    output_dir: Path,
    years: int | None = None,
    dry_run: bool = False,
) -> int:
    """
    Export payments_combined_v to parquet.

    Required columns: npi, year, program, payments, claims, beneficiaries, taxonomy, state
    """
    print("[3/3] Exporting payments...")

    # Determine year filter
    if years:
        cur_year = datetime.now(timezone.utc).year
        min_year = cur_year - years
        year_filter = f"WHERE year >= {min_year}"
        print(f"  → Filtering to {years} most recent years ({min_year}+)")
    else:
        year_filter = ""
        print(f"  → Exporting all years")

    sql = f"""
        SELECT
            npi,
            year,
            program,
            payments,
            claims,
            beneficiaries,
            taxonomy,
            state
        FROM payments_combined_v
        {year_filter}
        ORDER BY npi, year, program
    """

    print("  → Querying payments_combined_v (this may take a few minutes)...")
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql)
        rows = cur.fetchall()

    if not rows:
        print("  ✗ No payment data found")
        return 0

    # Convert rows to DataFrame with explicit schema to avoid Polars inference errors
    # (taxonomy/state can have mixed types across Medicaid/Medicare/PartD sources)
    schema = {
        "npi": pl.Utf8,
        "year": pl.Int32,
        "program": pl.Utf8,
        "payments": pl.Float64,
        "claims": pl.Float64,
        "beneficiaries": pl.Float64,
        "taxonomy": pl.Utf8,
        "state": pl.Utf8,
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
    df = pl.DataFrame(rows_data, schema=schema)

    print(f"  ✓ {len(df):,} payment rows")
    print(f"    - Years: {df['year'].min()} to {df['year'].max()}")
    print(f"    - Programs: {', '.join(df['program'].unique().to_list())}")
    print(f"    - Unique NPIs: {df['npi'].n_unique():,}")

    if not dry_run:
        output_path = output_dir / "payments_combined.parquet"
        print(f"  → Writing parquet (may take a minute)...")
        df.write_parquet(output_path, compression="zstd")
        file_size = output_path.stat().st_size / (1024 * 1024)
        print(f"  → {output_path} ({file_size:.1f} MB)")

    return len(df)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Export Claidex data from Postgres to Parquet for Modal upload."
    )
    parser.add_argument(
        "--output", "-o",
        type=Path,
        default=Path("data/modal_input"),
        help="Output directory for parquet files (default: data/modal_input/)",
    )
    parser.add_argument(
        "--years", "-y",
        type=int,
        default=None,
        help="Export only the last N years of payment data (default: all years)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show row counts without writing files",
    )
    args = parser.parse_args()

    output_dir: Path = args.output
    if not args.dry_run:
        output_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 80)
    print("Claidex Risk Score Data Export")
    print("=" * 80)
    print(f"Output directory: {output_dir}")
    print(f"Dry run: {args.dry_run}")
    print()

    conn = get_pg_conn()

    try:
        provider_count = export_providers(conn, output_dir, args.dry_run)
        print()

        exclusion_count = export_exclusions(conn, output_dir, args.dry_run)
        print()

        payment_count = export_payments(conn, output_dir, args.years, args.dry_run)
        print()

        print("=" * 80)
        print("Export Summary")
        print("=" * 80)
        print(f"Providers:  {provider_count:>12,}")
        print(f"Exclusions: {exclusion_count:>12,}")
        print(f"Payments:   {payment_count:>12,}")
        print()

        if not args.dry_run:
            print("Next steps:")
            print()
            print("1. Upload to Modal volume (volume mounts at /data, so use root paths):")
            print()
            print("   modal volume create claidex-data")
            print(f"   modal volume put claidex-data {output_dir}/providers.parquet providers.parquet")
            print(f"   modal volume put claidex-data {output_dir}/payments_combined.parquet payments_combined.parquet")
            print(f"   modal volume put claidex-data {output_dir}/exclusions.parquet exclusions.parquet")
            print()
            print("2. Run the Modal pipeline:")
            print()
            print("   modal run etl/compute/claidex_modal.py --postgres-url 'postgresql://...'")
            print()
        else:
            print("Dry run complete. Re-run without --dry-run to write files.")
            print()

        print("=" * 80)

    finally:
        conn.close()


if __name__ == "__main__":
    main()
