"""
Quick fix to add year column to medicaid_by_npi_year.parquet by re-processing
the raw CSV with streaming to handle the 3.4GB file.
"""
import tempfile
import zipfile
from pathlib import Path
import polars as pl
from dotenv import load_dotenv
import os

load_dotenv()

RAW_DIR = Path(os.environ.get("DATA_RAW", "data/raw"))
OUT_DIR = Path(os.environ.get("DATA_PROCESSED", "data/processed")) / "payments"
BLOB_PARENT = "medicaid-puf/datasets--HHS-Official--medicaid-provider-spending/blobs"

def fix_medicaid_year():
    blobs_dir = RAW_DIR / BLOB_PARENT
    zips = sorted(blobs_dir.iterdir(), key=lambda f: f.stat().st_size, reverse=True)
    zip_path = zips[0]

    print(f"[fix_medicaid] Extracting CSV from {zip_path.name}...")

    # Extract CSV to temp file to avoid loading entire zip into memory
    with zipfile.ZipFile(zip_path) as zf:
        csv_names = [n for n in zf.namelist() if n.endswith(".csv")]
        csv_name = csv_names[0]

        with tempfile.NamedTemporaryFile(mode='wb', suffix='.csv', delete=False) as tmp:
            tmp_path = tmp.name
            print(f"[fix_medicaid] Extracting to {tmp_path}...")
            tmp.write(zf.read(csv_name))

    try:
        print(f"[fix_medicaid] Processing CSV with lazy scan...")
        # Use lazy scan directly on extracted CSV file
        df = (
            pl.scan_csv(
                tmp_path,
                infer_schema_length=10000,
                null_values=["", "NULL", "N/A"],
            )
            .select([
                pl.col("BILLING_PROVIDER_NPI_NUM").cast(pl.Utf8).str.strip_chars().alias("npi"),
                pl.col("CLAIM_FROM_MONTH").cast(pl.Utf8).str.slice(0, 4).cast(pl.Int16, strict=False).alias("year"),
                pl.col("TOTAL_PAID").cast(pl.Float64, strict=False).alias("total_paid"),
                pl.col("TOTAL_CLAIMS").cast(pl.Float64, strict=False).alias("total_claims"),
                pl.col("TOTAL_UNIQUE_BENEFICIARIES").cast(pl.Float64, strict=False).alias("total_beneficiaries"),
            ])
            .group_by(["npi", "year"])
            .agg([
                pl.col("total_paid").sum(),
                pl.col("total_claims").sum(),
                pl.col("total_beneficiaries").sum(),
            ])
            .sort(["npi", "year"])
            .collect(streaming=True)
        )

        print(f"[fix_medicaid] Processed {len(df):,} rows")
        print(f"[fix_medicaid] Year range: {df['year'].min()} - {df['year'].max()}")
        print(f"[fix_medicaid] Sample:\n{df.head(5)}")

        out_path = OUT_DIR / "medicaid_by_npi_year.parquet"
        df.write_parquet(out_path, compression="zstd")
        print(f"[fix_medicaid] → {out_path}")
    finally:
        # Clean up temp file
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
            print(f"[fix_medicaid] Cleaned up temp file")

if __name__ == "__main__":
    fix_medicaid_year()
