"""
Medicaid Provider PUF ingest.

Source: data/raw/medicaid-puf/datasets--HHS-Official--medicaid-provider-spending/
        blobs/<sha>   (zip containing medicaid-provider-spending.csv)

Columns: BILLING_PROVIDER_NPI_NUM, SERVICING_PROVIDER_NPI_NUM, HCPCS_CODE,
         CLAIM_FROM_MONTH, TOTAL_UNIQUE_BENEFICIARIES, TOTAL_CLAIMS, TOTAL_PAID

Output: data/processed/payments/medicaid_by_npi_year.parquet
"""
import io
import os
import zipfile
from pathlib import Path
import polars as pl
from dotenv import load_dotenv

load_dotenv()

RAW_DIR = Path(os.environ.get("DATA_RAW", "data/raw"))
OUT_DIR = Path(os.environ.get("DATA_PROCESSED", "data/processed")) / "payments"

# Known blob path (HuggingFace cache layout)
BLOB_PARENT = "medicaid-puf/datasets--HHS-Official--medicaid-provider-spending/blobs"


def _find_zip(raw_dir: Path) -> Path:
    blobs_dir = raw_dir / BLOB_PARENT
    if not blobs_dir.exists():
        raise FileNotFoundError(f"Blobs dir not found: {blobs_dir}")
    zips = [f for f in blobs_dir.iterdir() if f.is_file()]
    if not zips:
        raise FileNotFoundError(f"No blob files in {blobs_dir}")
    # pick largest (the data zip)
    return max(zips, key=lambda f: f.stat().st_size)


def ingest(raw_dir: Path = RAW_DIR, out_dir: Path = OUT_DIR) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    zip_path = _find_zip(raw_dir)
    print(f"[medicaid_puf] Reading {zip_path.name} …")

    with zipfile.ZipFile(zip_path) as zf:
        csv_names = [n for n in zf.namelist() if n.endswith(".csv")]
        if not csv_names:
            raise ValueError(f"No CSV inside {zip_path}")
        csv_name = csv_names[0]
        print(f"[medicaid_puf] Extracting {csv_name} …")
        with zf.open(csv_name) as f:
            df = pl.read_csv(
                io.BytesIO(f.read()),
                infer_schema_length=10_000,
                null_values=["", "NULL", "N/A"],
            )

    print(f"[medicaid_puf] Raw: {len(df):,} rows, columns: {df.columns}")

    # Normalize column names to lowercase
    df = df.rename({c: c.strip().lower().replace(" ", "_") for c in df.columns})

    npi_col = next(
        (c for c in df.columns if "billing" in c and "npi" in c),
        next((c for c in df.columns if "npi" in c), None),
    )
    if npi_col is None:
        raise ValueError(f"Cannot find NPI column. Columns: {df.columns}")

    month_col = next((c for c in df.columns if "month" in c or "year" in c), None)
    paid_col = next((c for c in df.columns if "paid" in c or "payment" in c), None)
    claims_col = next((c for c in df.columns if "claim" in c), None)
    bene_col = next((c for c in df.columns if "benef" in c), None)

    print(f"[medicaid_puf] Using columns: npi={npi_col}, month={month_col}, "
          f"paid={paid_col}, claims={claims_col}, bene={bene_col}")

    select_cols = {npi_col: "npi"}
    if month_col:
        select_cols[month_col] = "month_raw"
    if paid_col:
        select_cols[paid_col] = "total_paid"
    if claims_col:
        select_cols[claims_col] = "total_claims"
    if bene_col:
        select_cols[bene_col] = "total_beneficiaries"

    df = df.select(list(select_cols)).rename(select_cols)
    df = df.with_columns(pl.col("npi").cast(pl.Utf8).str.strip_chars())

    # Parse year from YYYYMM or YYYY-MM
    if "month_raw" in df.columns:
        df = df.with_columns(
            pl.col("month_raw").cast(pl.Utf8).str.slice(0, 4).cast(pl.Int32, strict=False).alias("year")
        ).drop("month_raw")

    # Aggregate to NPI + year
    agg_cols = [c for c in ["total_paid", "total_claims", "total_beneficiaries"] if c in df.columns]
    group_cols = [c for c in ["npi", "year"] if c in df.columns]

    df = (
        df.with_columns([
            pl.col(c).cast(pl.Float64, strict=False) for c in agg_cols
        ])
        .group_by(group_cols)
        .agg([pl.col(c).sum() for c in agg_cols])
        .sort(group_cols)
    )

    df.write_parquet(out_dir / "medicaid_by_npi_year.parquet", compression="zstd")
    print(f"[medicaid_puf] → {out_dir}/medicaid_by_npi_year.parquet  ({len(df):,} rows)")


if __name__ == "__main__":
    ingest()
