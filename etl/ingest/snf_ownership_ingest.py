"""
SNF Ownership ingest (CMS Skilled Nursing Facility ownership bundle).

Sources (all under data/raw/snf-ownership/YYYY-MM/):
  - SNF_All_Owners_YYYY.MM.DD.csv       → ownership edges
  - SNF_Affiliated_Entities_*.zip/csv   → affiliated chain entities

Outputs:
  data/processed/ownership/snf_owners.parquet
  data/processed/ownership/snf_affiliated_entities.parquet

Column reference (SNF_All_Owners):
  ENROLLMENT ID, ASSOCIATE ID, ORGANIZATION NAME,
  ASSOCIATE ID - OWNER, TYPE - OWNER, ROLE CODE - OWNER, ROLE TEXT - OWNER,
  ASSOCIATION DATE - OWNER,
  FIRST NAME - OWNER, MIDDLE NAME - OWNER, LAST NAME - OWNER,
  TITLE - OWNER, ORGANIZATION NAME - OWNER, DOING BUSINESS AS NAME - OWNER,
  ADDRESS LINE 1 - OWNER … ZIP CODE - OWNER, PERCENTAGE OWNERSHIP,
  CREATED FOR ACQUISITION - OWNER, CORPORATION - OWNER, LLC - OWNER,
  MEDICAL PROVIDER SUPPLIER - OWNER, MANAGEMENT SERVICES COMPANY - OWNER,
  MEDICAL STAFFING COMPANY - OWNER, HOLDING COMPANY - OWNER,
  INVESTMENT FIRM - OWNER, FINANCIAL INSTITUTION - OWNER,
  CONSULTING FIRM - OWNER, FOR PROFIT - OWNER, NON PROFIT - OWNER,
  PRIVATE EQUITY COMPANY - OWNER, REIT - OWNER, CHAIN HOME OFFICE - OWNER,
  TRUST OR TRUSTEE - OWNER, OTHER TYPE - OWNER, OTHER TYPE TEXT - OWNER,
  PARENT COMPANY - OWNER, OWNED BY ANOTHER ORG OR IND - OWNER
"""
import os
import zipfile
from pathlib import Path
import polars as pl
from dotenv import load_dotenv

load_dotenv()

RAW_DIR = Path(os.environ.get("DATA_RAW", "data/raw"))
OUT_DIR = Path(os.environ.get("DATA_PROCESSED", "data/processed")) / "ownership"

OWNER_COL_MAP = {
    "ENROLLMENT ID": "enrollment_id",
    "ASSOCIATE ID": "provider_associate_id",
    "ORGANIZATION NAME": "provider_org_name",
    "ASSOCIATE ID - OWNER": "owner_associate_id",
    "TYPE - OWNER": "owner_type",
    "ROLE CODE - OWNER": "role_code",
    "ROLE TEXT - OWNER": "role_text",
    "ASSOCIATION DATE - OWNER": "association_date_raw",
    "FIRST NAME - OWNER": "owner_first_name",
    "MIDDLE NAME - OWNER": "owner_middle_name",
    "LAST NAME - OWNER": "owner_last_name",
    "TITLE - OWNER": "owner_title",
    "ORGANIZATION NAME - OWNER": "owner_org_name",
    "DOING BUSINESS AS NAME - OWNER": "owner_dba",
    "ADDRESS LINE 1 - OWNER": "owner_address",
    "CITY - OWNER": "owner_city",
    "STATE - OWNER": "owner_state",
    "ZIP CODE - OWNER": "owner_zip",
    "PERCENTAGE OWNERSHIP": "ownership_pct",
    "CORPORATION - OWNER": "flag_corporation",
    "LLC - OWNER": "flag_llc",
    "HOLDING COMPANY - OWNER": "flag_holding_company",
    "INVESTMENT FIRM - OWNER": "flag_investment_firm",
    "PRIVATE EQUITY COMPANY - OWNER": "flag_private_equity",
    "FOR PROFIT - OWNER": "flag_for_profit",
    "NON PROFIT - OWNER": "flag_non_profit",
    "PARENT COMPANY - OWNER": "flag_parent_company",
    "OWNED BY ANOTHER ORG OR IND - OWNER": "flag_owned_by_another",
}

FLAG_COLS = [v for k, v in OWNER_COL_MAP.items() if k.startswith("flag_") or v.startswith("flag_")]


def _load_owners_csv(path: Path) -> pl.DataFrame:
    available = pl.read_csv(path, n_rows=0, infer_schema_length=0).columns
    wanted = {k: v for k, v in OWNER_COL_MAP.items() if k in available}
    df = pl.read_csv(
        path,
        infer_schema_length=0,
        null_values=["", " "],
        columns=list(wanted),
        encoding="utf8-lossy",
    ).rename(wanted)

    # Normalize Y/N flags to bool
    flag_present = [c for c in FLAG_COLS if c in df.columns]
    df = df.with_columns([
        (pl.col(c).str.strip_chars().str.to_uppercase() == "Y").alias(c)
        for c in flag_present
    ])

    # Parse ownership percentage
    if "ownership_pct" in df.columns:
        df = df.with_columns(
            pl.col("ownership_pct").cast(pl.Float64, strict=False)
        )

    # Parse association date (M/D/YYYY format in this file)
    if "association_date_raw" in df.columns:
        df = df.with_columns(
            pl.col("association_date_raw")
            .str.strip_chars()
            .str.to_date("%m/%d/%Y", strict=False)
            .alias("association_date")
        ).drop("association_date_raw")

    return df


def _find_owners_file(month_dir: Path) -> Path:
    """Prefer the dated all-owners CSV (most recent)."""
    csvs = sorted(
        [f for f in month_dir.glob("SNF_All_Owners_*.csv") if f.stat().st_size > 10_000],
        key=lambda f: f.stat().st_size,
        reverse=True,
    )
    if csvs:
        return csvs[0]
    raise FileNotFoundError(f"No SNF_All_Owners_*.csv with data in {month_dir}")


def _load_affiliated_csv(path: Path) -> pl.DataFrame:
    return pl.read_csv(path, infer_schema_length=0, null_values=["", " "])


def ingest(raw_dir: Path = RAW_DIR, out_dir: Path = OUT_DIR) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    snf_base = raw_dir / "snf-ownership"
    month_dirs = sorted(
        [d for d in snf_base.iterdir() if d.is_dir()],
        reverse=True,
    )
    if not month_dirs:
        raise FileNotFoundError(f"No SNF ownership month dirs under {snf_base}")

    latest = month_dirs[0]
    print(f"[snf_ownership] Using {latest}")

    # All owners
    owners_path = _find_owners_file(latest)
    print(f"[snf_ownership] All owners: {owners_path.name}")
    owners_df = _load_owners_csv(owners_path)
    print(f"[snf_ownership] {len(owners_df):,} owner rows")
    owners_df.write_parquet(out_dir / "snf_owners.parquet", compression="zstd")
    print(f"[snf_ownership] → {out_dir}/snf_owners.parquet")

    # Affiliated entities (may be zipped)
    affil_frames = []
    for affil_zip in sorted(latest.glob("SNF_Affiliated_Entities_*.zip")):
        if affil_zip.stat().st_size < 1000:
            continue
        try:
            zf_handle = zipfile.ZipFile(affil_zip)
        except zipfile.BadZipFile:
            print(f"[snf_ownership] Skipping bad zip: {affil_zip.name}")
            continue
        with zf_handle as zf:
            for name in zf.namelist():
                if name.endswith(".csv") and "__MACOSX" not in name:
                    import io
                    raw_bytes = zf.read(name)
                    df = pl.read_csv(
                        io.BytesIO(raw_bytes),
                        infer_schema_length=0,
                        null_values=["", " "],
                    )
                    affil_frames.append(df)
                    print(f"[snf_ownership] Affiliated: {name} → {len(df):,} rows")

    for affil_csv in sorted(latest.glob("SNF_Affiliated_Entities_*.csv")):
        if affil_csv.stat().st_size > 100:
            df = _load_affiliated_csv(affil_csv)
            affil_frames.append(df)
            print(f"[snf_ownership] Affiliated: {affil_csv.name} → {len(df):,} rows")

    if affil_frames:
        affil_df = pl.concat(affil_frames, how="diagonal")
        affil_df.write_parquet(out_dir / "snf_affiliated_entities.parquet", compression="zstd")
        print(f"[snf_ownership] → {out_dir}/snf_affiliated_entities.parquet  ({len(affil_df):,} rows)")
    else:
        print("[snf_ownership] No affiliated entity files found, skipping.")


if __name__ == "__main__":
    ingest()
