"""
SNF Change of Ownership (CHOW) ingest.

Reads SNF CHOW CSVs from data/raw/snf-ownership/YYYY-MM/:
  - SNF_CHOW_*.csv           → main CHOW events (buyer/seller, effective date)
  - SNF_CHOW_Owners_*.csv    → optional; not used for event rows (owners file is per-enrollment)

Maps facility and owner associate IDs to entity_id using corporate_entities.parquet.
Output: data/processed/ownership/chow_events.parquet

Column mapping (SNF_CHOW CSV):
  BUYER = new owner (facility after CHOW); SELLER = prior owner.
  facility_ccn = CCN - BUYER, facility_name = ORGANIZATION NAME - BUYER,
  from_owner = SELLER, to_owner = BUYER, effective_date = EFFECTIVE DATE.
"""
import os
from pathlib import Path
import polars as pl
from dotenv import load_dotenv

load_dotenv()

RAW_DIR = Path(os.environ.get("DATA_RAW", "data/raw"))
OUT_DIR = Path(os.environ.get("DATA_PROCESSED", "data/processed")) / "ownership"
PROCESSED = Path(os.environ.get("DATA_PROCESSED", "data/processed"))

# SNF_CHOW_*.csv column names (from actual file)
CHOW_COL_MAP = {
    "ENROLLMENT ID - BUYER": "enrollment_id_buyer",
    "ENROLLMENT STATE - BUYER": "state",
    "PROVIDER TYPE CODE - BUYER": "provider_type_code_buyer",
    "PROVIDER TYPE TEXT - BUYER": "provider_type_text_buyer",
    "NPI - BUYER": "npi_buyer",
    "CCN - BUYER": "facility_ccn",
    "ASSOCIATE ID - BUYER": "associate_id_buyer",
    "ORGANIZATION NAME - BUYER": "org_name_buyer",
    "DOING BUSINESS AS NAME - BUYER": "dba_buyer",
    "CHOW TYPE CODE": "chow_type_code",
    "CHOW TYPE TEXT": "chow_type_text",
    "EFFECTIVE DATE": "effective_date_raw",
    "ENROLLMENT ID - SELLER": "enrollment_id_seller",
    "ENROLLMENT STATE - SELLER": "state_seller",
    "CCN - SELLER": "ccn_seller",
    "ASSOCIATE ID - SELLER": "associate_id_seller",
    "ORGANIZATION NAME - SELLER": "org_name_seller",
    "DOING BUSINESS AS NAME - SELLER": "dba_seller",
}


def _find_chow_file(month_dir: Path) -> Path | None:
    """Return largest SNF_CHOW_*.csv (exclude SNF_CHOW_Owners_*)."""
    csvs = [
        f
        for f in month_dir.glob("SNF_CHOW_*.csv")
        if "Owners" not in f.name and f.stat().st_size > 1000
    ]
    if not csvs:
        return None
    return max(csvs, key=lambda f: f.stat().st_size)


def _load_chow_csv(path: Path) -> pl.DataFrame:
    available = pl.read_csv(path, n_rows=0, infer_schema_length=0).columns
    wanted = {k: v for k, v in CHOW_COL_MAP.items() if k in available}
    if not wanted:
        return pl.DataFrame()
    df = pl.read_csv(
        path,
        infer_schema_length=0,
        null_values=["", " "],
        columns=list(wanted),
        encoding="utf8-lossy",
    ).rename(wanted)

    # Parse effective date (M/D/YYYY)
    if "effective_date_raw" in df.columns:
        df = df.with_columns(
            pl.col("effective_date_raw")
            .str.strip_chars()
            .str.to_date("%m/%d/%Y", strict=False)
            .alias("effective_date")
        ).drop("effective_date_raw")
    return df


def _event_type_expr(
    code_col: pl.Expr,
    text_col: pl.Expr,
) -> pl.Expr:
    """Map CHOW type code/text to canonical event_type using native when/then."""
    text_upper = text_col.fill_null("").str.to_uppercase()
    code_upper = code_col.fill_null("").str.to_uppercase()
    return (
        pl.when(text_upper.str.contains("TERMINATION") | text_upper.str.contains("TERM"))
        .then(pl.lit("termination"))
        .when(text_upper.str.contains("NEW ENROLLMENT") | text_upper.str.contains("INITIAL"))
        .then(pl.lit("new_enrollment"))
        .when(text_upper.str.contains("REVALIDATION"))
        .then(pl.lit("revalidation"))
        .when(
            text_upper.str.contains("CHANGE OF OWNERSHIP") | (code_upper == "CH")
        )
        .then(pl.lit("ownership_change"))
        .otherwise(pl.lit("ownership_change"))
    )


def _resolve_entity_ids(
    df: pl.DataFrame,
    entity_ids: set[str],
    facility_entity_ids: set[str],
) -> pl.DataFrame:
    """
    Resolve facility and owner associate IDs to entity_id.
    entity_ids: from corporate_entities (owners + orgs).
    facility_entity_ids: from ownership_edges.provider_associate_id (SNF facilities).
    """
    all_owner_ids = entity_ids
    all_facility_ids = facility_entity_ids | entity_ids

    def resolve_owner(associate_id_series: pl.Series) -> pl.Series:
        return associate_id_series.map_elements(
            lambda x: x if x and str(x).strip() in all_owner_ids else None,
            return_dtype=pl.Utf8,
        )

    def resolve_facility(associate_id_series: pl.Series) -> pl.Series:
        return associate_id_series.map_elements(
            lambda x: x if x and str(x).strip() in all_facility_ids else None,
            return_dtype=pl.Utf8,
        )

    if "associate_id_buyer" in df.columns:
        df = df.with_columns(
            resolve_facility(pl.col("associate_id_buyer").cast(pl.Utf8).str.strip_chars()).alias(
                "facility_entity_id"
            ),
            resolve_owner(pl.col("associate_id_seller").cast(pl.Utf8).str.strip_chars()).alias(
                "from_owner_entity_id"
            ),
            resolve_owner(pl.col("associate_id_buyer").cast(pl.Utf8).str.strip_chars()).alias(
                "to_owner_entity_id"
            ),
        )
    return df


def ingest(raw_dir: Path = RAW_DIR, out_dir: Path = OUT_DIR) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    snf_base = raw_dir / "snf-ownership"
    if not snf_base.is_dir():
        raise FileNotFoundError(f"SNF ownership raw dir not found: {snf_base}")

    month_dirs = sorted(
        [d for d in snf_base.iterdir() if d.is_dir()],
        reverse=True,
    )
    if not month_dirs:
        raise FileNotFoundError(f"No month dirs under {snf_base}")

    # Load corporate_entities (owners) and ownership_edges (SNF facilities) for resolution
    corp_path = PROCESSED / "ownership" / "corporate_entities.parquet"
    edges_path = PROCESSED / "ownership" / "ownership_edges.parquet"
    entity_ids: set[str] = set()
    facility_entity_ids: set[str] = set()
    if corp_path.exists():
        entities = pl.read_parquet(corp_path)
        if "entity_id" not in entities.columns and "owner_associate_id" in entities.columns:
            entities = entities.with_columns(
                pl.col("owner_associate_id").alias("entity_id")
            )
        entity_ids = set(entities["entity_id"].drop_nulls().cast(pl.Utf8).str.strip_chars().to_list())
        print(f"[chow_ingest] Resolving using {len(entity_ids):,} corporate entities")
    if edges_path.exists():
        edges = pl.read_parquet(edges_path)
        if "provider_associate_id" in edges.columns:
            facility_entity_ids = set(
                edges["provider_associate_id"].drop_nulls().cast(pl.Utf8).str.strip_chars().to_list()
            )
            print(f"[chow_ingest] Facility IDs from edges: {len(facility_entity_ids):,}")
    if not entity_ids and not facility_entity_ids:
        print("[chow_ingest] No corporate_entities or ownership_edges; *_entity_id columns will be NULL")

    frames = []
    for month_dir in month_dirs:
        chow_path = _find_chow_file(month_dir)
        if not chow_path:
            continue
        df = _load_chow_csv(chow_path)
        if df.is_empty():
            continue
        # Build output schema
        code_col = pl.col("chow_type_code") if "chow_type_code" in df.columns else pl.lit("")
        text_col = pl.col("chow_type_text") if "chow_type_text" in df.columns else pl.lit("")
        df = df.with_columns(
            pl.col("org_name_buyer").alias("facility_name"),
            pl.col("state").cast(pl.Utf8),
            pl.col("org_name_seller").alias("from_owner_name"),
            pl.col("org_name_buyer").alias("to_owner_name"),
            _event_type_expr(code_col, text_col).alias("event_type"),
            pl.lit(chow_path.name).alias("source_file"),
        )
        df = _resolve_entity_ids(df, entity_ids, facility_entity_ids)
        # Select final columns
        out_cols = [
            "facility_entity_id",
            "facility_ccn",
            "facility_name",
            "state",
            "effective_date",
            "from_owner_entity_id",
            "from_owner_name",
            "to_owner_entity_id",
            "to_owner_name",
            "event_type",
            "source_file",
        ]
        df = df.select([c for c in out_cols if c in df.columns])
        frames.append(df)
        print(f"[chow_ingest] {chow_path.name} → {len(df):,} rows")

    if not frames:
        raise FileNotFoundError(
            f"No SNF_CHOW_*.csv (excluding Owners) with data under {snf_base}"
        )

    combined = pl.concat(frames, how="diagonal")
    # Dedupe by facility_ccn + effective_date + from/to (same event can appear in multiple files)
    combined = combined.unique(
        subset=["facility_ccn", "effective_date", "from_owner_name", "to_owner_name"],
        keep="first",
    )
    combined.write_parquet(out_dir / "chow_events.parquet", compression="zstd")
    print(f"[chow_ingest] → {out_dir}/chow_events.parquet  ({len(combined):,} rows)")


if __name__ == "__main__":
    ingest()
