"""
Postgres loader: exports each processed Parquet to a CSV in data/exports/,
then bulk-loads into Postgres using COPY (fast path).

Tables loaded:
  providers                (from providers_final.parquet)
  payments_medicaid        (from medicaid_by_npi_year.parquet)
  payments_medicare        (from medicare_by_npi_year.parquet)
  exclusions               (from exclusions_final.parquet)
  ownership_snf            (from ownership_edges.parquet)
  chow_events              (from ownership/chow_events.parquet)
  hcris_financials         (from hcris/hcris_by_npi_year.parquet)

Usage:
  python -m etl.load.postgres_loader [table ...]
  or: python etl/load/postgres_loader.py          # loads all
  or: python etl/load/postgres_loader.py providers exclusions
"""
import io
import os
import sys
from pathlib import Path
import polars as pl
import psycopg2
from dotenv import load_dotenv

load_dotenv()

# Resolve from repo root so script works from repo root or etl/load/
_REPO_ROOT = Path(__file__).resolve().parents[2]
_proc = os.environ.get("DATA_PROCESSED", "data/processed")
_exports = os.environ.get("DATA_EXPORTS", "data/exports")
PROCESSED = Path(_proc) if Path(_proc).is_absolute() else _REPO_ROOT / _proc
EXPORTS = Path(_exports) if Path(_exports).is_absolute() else _REPO_ROOT / _exports
SCHEMAS_DIR = Path(__file__).resolve().parent.parent / "schemas"

# Maps table name → (parquet path, schema file, [column subset or None])
TABLE_CONFIG: dict[str, tuple[str, str, list[str] | None]] = {
    "providers": (
        "providers/providers_final.parquet",
        "providers.sql",
        ["npi", "entity_type_code", "org_name", "last_name", "first_name",
         "middle_name", "credential", "address_line1", "city", "state", "zip",
         "taxonomy_1", "license_1", "license_state_1", "display_name", "is_excluded",
         # Order & Referring eligibility flags (present only after order_referring_ingest)
         "eligible_partb", "eligible_dme", "eligible_hha", "eligible_pmd", "eligible_hospice"],
    ),
    "payments_medicaid": (
        "payments/medicaid_by_npi_year.parquet",
        "payments.sql",
        None,
    ),
    "payments_medicare": (
        "payments/medicare_by_npi_year.parquet",
        "payments.sql",
        None,
    ),
    "exclusions": (
        "exclusions/exclusions_final.parquet",
        "exclusions.sql",
        ["exclusion_id", "source", "npi", "last_name", "first_name", "business_name",
         "display_name", "excl_type", "excl_type_label", "excldate", "reindate",
         "state", "reinstated"],
    ),
    "ownership_snf": (
        "ownership/ownership_edges.parquet",
        "ownership_snf.sql",
        None,
    ),
    "medicare_inpatient": (
        "payments/medicare_inpatient_by_facility.parquet",
        "medicare_inpatient.sql",
        None,
    ),
    "medicare_part_d": (
        "payments/medicare_part_d_by_npi_year.parquet",
        "medicare_part_d.sql",
        None,
    ),
    "order_referring": (
        "providers/order_referring.parquet",
        "order_referring.sql",
        None,
    ),
    "fec_contributions": (
        "fec/fec_contributions.parquet",
        "fec_contributions.sql",
        [
            "contributor_name", "normalized_name", "normalized_last_name",
            "first_name_initial", "employer", "normalized_employer",
            "occupation", "city", "state", "amount", "committee_id",
            "transaction_date", "cycle",
        ],
    ),
    "fec_committees": (
        "fec/fec_committees.parquet",
        "fec_committees.sql",
        None,
    ),
    "chow_events": (
        "ownership/chow_events.parquet",
        "chow.sql",
        None,
    ),
    "hcris_financials": (
        "hcris/hcris_by_npi_year.parquet",
        "hcris.sql",
        None,
    ),
}


def _get_conn() -> psycopg2.extensions.connection:
    import time
    host = os.environ.get("POSTGRES_HOST", "127.0.0.1")
    port = int(os.environ.get("POSTGRES_PORT", "5432"))
    dbname = os.environ.get("POSTGRES_DB", "claidex")
    user = os.environ.get("POSTGRES_USER", "claidex")
    password = os.environ.get("POSTGRES_PASSWORD", "")
    # TARGET_POSTGRES_URL allows syncing to a specific DB (e.g. when syncing all four Neon projects)
    url = (
        os.environ.get("TARGET_POSTGRES_URL")
        or os.environ.get("POSTGRES_URL")
        or os.environ.get("DATABASE_URL")
        or os.environ.get("NEON_PROVIDERS_URL")
    )

    # Try connection string first (Neon or local); if it fails, use host/port/user/password
    if url:
        try:
            return psycopg2.connect(url, connect_timeout=10)
        except psycopg2.OperationalError:
            pass

    # Validate password is set when using individual connection params
    if not password:
        raise ValueError(
            "POSTGRES_PASSWORD not set in environment.\n"
            "  Set in .env: POSTGRES_PASSWORD=yourpassword\n"
            "  Or export: export POSTGRES_PASSWORD=yourpassword"
        )

    # Prefer 127.0.0.1 so we hit the Docker-mapped port; localhost can resolve to ::1 and fail
    if host == "localhost":
        host = "127.0.0.1"

    last_err = None
    for attempt in range(1, 6):
        try:
            return psycopg2.connect(
                host=host,
                port=port,
                dbname=dbname,
                user=user,
                password=password,
                connect_timeout=5,
            )
        except psycopg2.OperationalError as e:
            last_err = e
            if attempt < 5:
                time.sleep(3)
    raise last_err


def _apply_schema(cur: psycopg2.extensions.cursor, schema_file: str) -> None:
    path = SCHEMAS_DIR / schema_file
    if path.exists():
        cur.execute(path.read_text())


def _drop_and_recreate(cur: psycopg2.extensions.cursor, table: str, schema_file: str) -> None:
    """Drop the table then apply the schema fresh — used when doing a full reload
    so schema changes (new columns, etc.) are picked up cleanly."""
    cur.execute(f"DROP TABLE IF EXISTS {table} CASCADE")
    _apply_schema(cur, schema_file)


def _truncate(cur: psycopg2.extensions.cursor, table: str) -> None:
    cur.execute(f"TRUNCATE TABLE {table} RESTART IDENTITY CASCADE")


def load_table(table: str, truncate: bool = True) -> None:
    parquet_rel, schema_file, col_subset = TABLE_CONFIG[table]
    parquet_path = PROCESSED / parquet_rel

    # Fallback paths for providers when building from Modal or single-file ETL
    if table == "providers" and not parquet_path.exists():
        for fallback in ["providers.parquet", "modal_input/providers.parquet"]:
            candidate = PROCESSED / fallback
            if candidate.exists():
                parquet_path = candidate
                print(f"[postgres] Using fallback {parquet_path} for providers")
                break

    if not parquet_path.exists():
        print(f"[postgres] SKIP {table}: {parquet_path} not found")
        return

    df = pl.read_parquet(parquet_path)

    # If providers from fallback parquet lack display_name, derive it
    if table == "providers" and "display_name" not in df.columns:
        if "org_name" in df.columns:
            df = df.with_columns(pl.col("org_name").alias("display_name"))
        elif "last_name" in df.columns or "first_name" in df.columns:
            df = df.with_columns(
                (pl.col("last_name").fill_null("") + ", " + pl.col("first_name").fill_null("")).str.strip_chars(", ").alias("display_name")
            )
        else:
            df = df.with_columns(pl.lit(None).cast(pl.Utf8).alias("display_name"))

    if col_subset:
        available = [c for c in col_subset if c in df.columns]
        df = df.select(available)

    # Align column names to schema (parquet may use different names)
    if table == "payments_medicaid":
        renames = {"total_paid": "payments", "total_claims": "claims", "total_beneficiaries": "beneficiaries"}
        df = df.rename({k: v for k, v in renames.items() if k in df.columns})
    if table == "hcris_financials":
        if "type" in df.columns:
            df = df.rename({"type": "facility_type"})
        for col in ["total_beds", "total_patient_days"]:
            if col in df.columns:
                df = df.with_columns(pl.col(col).cast(pl.Int32, strict=False))

    # Deduplicate by primary key to avoid UniqueViolation
    if table == "providers" and "npi" in df.columns:
        n_before = len(df)
        df = df.unique(subset=["npi"], keep="first")
        if len(df) < n_before:
            print(f"[postgres] Deduped providers: {n_before:,} -> {len(df):,} rows")
    if table == "ownership_snf" and "enrollment_id" in df.columns and "owner_associate_id" in df.columns:
        n_before = len(df)
        df = df.unique(subset=["enrollment_id", "owner_associate_id"], keep="first")
        if len(df) < n_before:
            print(f"[postgres] Deduped ownership_snf: {n_before:,} -> {len(df):,} rows")
    if table in ("payments_medicaid", "payments_medicare") and "npi" in df.columns and "year" in df.columns:
        n_before = len(df)
        df = df.unique(subset=["npi", "year"], keep="first")
        if len(df) < n_before:
            print(f"[postgres] Deduped {table}: {n_before:,} -> {len(df):,} rows")
    if table == "hcris_financials" and "ccn" in df.columns and "year" in df.columns:
        n_before = len(df)
        keys = ["npi", "ccn", "year"]
        df = df.unique(subset=[c for c in keys if c in df.columns], keep="first")
        if len(df) < n_before:
            print(f"[postgres] Deduped {table}: {n_before:,} -> {len(df):,} rows")

    print(f"[postgres] Loading {table}: {len(df):,} rows, {len(df.columns)} cols")

    # Export to in-memory CSV buffer
    buf = io.BytesIO()
    df.write_csv(buf)
    buf.seek(0)

    conn = _get_conn()
    try:
        with conn:
            with conn.cursor() as cur:
                if truncate:
                    # Drop and recreate so any schema changes (new columns) are applied
                    _drop_and_recreate(cur, table, schema_file)
                else:
                    _apply_schema(cur, schema_file)

                col_names = ", ".join(df.columns)
                cur.copy_expert(
                    f"COPY {table} ({col_names}) FROM STDIN WITH (FORMAT CSV, HEADER TRUE, NULL '')",
                    buf,
                )
                print(f"[postgres] ✓ {table}")
    finally:
        conn.close()

    # Also save the export CSV to disk for Neo4j
    csv_out = EXPORTS / f"{table}.csv"
    EXPORTS.mkdir(parents=True, exist_ok=True)
    df.write_csv(csv_out)
    print(f"[postgres] Export → {csv_out}")


def load_all(tables: list[str] | None = None) -> None:
    targets = tables or list(TABLE_CONFIG)
    for table in targets:
        if table not in TABLE_CONFIG:
            print(f"[postgres] Unknown table: {table}  (known: {list(TABLE_CONFIG)})")
            continue
        try:
            load_table(table)
        except Exception as e:  # noqa: BLE001
            # Neon free tier has ~512 MB project limit; large COPY can raise DiskFull
            err_msg = str(e).lower()
            if "diskfull" in err_msg or "neon.max_cluster_size" in err_msg or "project size limit" in err_msg:
                print(f"[postgres] ⚠ {table}: Neon storage limit exceeded. Load a subset or upgrade plan.")
            else:
                print(f"[postgres] ⚠ {table}: {e}")
            # Continue to next table so other tables (e.g. exclusions, risk_scores) can still load


if __name__ == "__main__":
    args = sys.argv[1:]
    load_all(args if args else None)
