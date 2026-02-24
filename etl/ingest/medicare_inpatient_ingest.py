"""
Medicare Inpatient Facility ingest.

Reads CMS Medicare Inpatient Prospective Payment System (IPPS) provider-level
summary CSVs for 2018–2023 and produces a single consolidated Parquet.

Source files:
  data/raw/medicare-facility/inpatient/provider/{year}/medicare_inpatient_provider_{year}.csv

NOTE: These files are keyed by Rndrng_Prvdr_CCN (CMS Certification Number), NOT NPI.
      Hospital inpatient data is facility-level and cannot be merged directly into the
      NPI-keyed payments_combined. It is stored in its own table (medicare_inpatient).

Output:
  data/processed/payments/medicare_inpatient_by_facility.parquet
"""
import os
from pathlib import Path

import polars as pl
from dotenv import load_dotenv

load_dotenv()

RAW      = Path(os.environ.get("DATA_RAW",       "data/raw"))
PROCESSED = Path(os.environ.get("DATA_PROCESSED", "data/processed"))

INPATIENT_DIR = RAW / "medicare-facility" / "inpatient" / "provider"
OUT_PATH      = PROCESSED / "payments" / "medicare_inpatient_by_facility.parquet"

YEARS = range(2018, 2024)

# Columns to keep from the raw CSV (verified against 2018 header)
KEEP_COLS = {
    "Rndrng_Prvdr_CCN":        "ccn",
    "Rndrng_Prvdr_Org_Name":   "facility_name",
    "Rndrng_Prvdr_City":       "city",
    "Rndrng_Prvdr_State_Abrvtn": "state",
    "Rndrng_Prvdr_Zip5":       "zip",
    "Tot_Benes":               "total_benes",
    "Tot_Submtd_Cvrd_Chrg":    "total_submitted_charges",
    "Tot_Pymt_Amt":            "total_payments",
    "Tot_Mdcr_Pymt_Amt":       "total_medicare_payments",
    "Tot_Dschrgs":             "total_discharges",
    "Tot_Cvrd_Days":           "total_covered_days",
}


def ingest() -> pl.DataFrame:
    frames: list[pl.DataFrame] = []

    for year in YEARS:
        csv_path = INPATIENT_DIR / str(year) / f"medicare_inpatient_provider_{year}.csv"
        if not csv_path.exists():
            print(f"[inpatient_ingest] SKIP {year}: {csv_path} not found")
            continue

        df = pl.read_csv(
            csv_path,
            infer_schema_length=10000,
            null_values=["", "N/A", "*"],
            truncate_ragged_lines=True,
            encoding="utf8-lossy",
        )

        # Keep only columns we care about (intersection with what's available)
        available = {k: v for k, v in KEEP_COLS.items() if k in df.columns}
        df = df.select(list(available.keys())).rename(available)

        # Cast numeric columns, coercing any suppressed values to null
        for col in ["total_benes", "total_submitted_charges", "total_payments",
                    "total_medicare_payments", "total_discharges", "total_covered_days"]:
            if col in df.columns:
                df = df.with_columns(
                    pl.col(col).cast(pl.Float64, strict=False)
                )

        df = df.with_columns(pl.lit(year).alias("year"))
        frames.append(df)
        print(f"[inpatient_ingest] {year}: {len(df):,} facilities")

    if not frames:
        raise FileNotFoundError(
            f"No inpatient CSVs found under {INPATIENT_DIR}. "
            "Expected files: medicare_inpatient_provider_YYYY.csv"
        )

    combined = pl.concat(frames, how="diagonal")
    combined = combined.with_columns(pl.col("ccn").cast(pl.Utf8))
    combined = combined.filter(pl.col("ccn").is_not_null() & (pl.col("ccn") != ""))

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    combined.write_parquet(OUT_PATH, compression="zstd")
    print(f"[inpatient_ingest] → {OUT_PATH}  ({len(combined):,} rows, {combined['year'].n_unique()} years)")
    return combined


if __name__ == "__main__":
    ingest()
