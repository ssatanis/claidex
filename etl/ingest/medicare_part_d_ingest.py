"""
Medicare Part D Prescribers ingest.

Reads CMS Medicare Part D Prescribers by Provider summary CSVs for 2019–2022
and produces a single NPI+year aggregated Parquet.

Source files:
  data/raw/medicare-part-d/{year}/medicare_part_d_prescribers_{year}.csv

Key columns (from actual 2019 header):
  Prscrbr_NPI        — prescriber NPI (10-digit)
  Prscrbr_Last_Org_Name
  Prscrbr_State_Abrvtn
  Prscrbr_Type       — provider specialty
  Tot_Clms           — total drug claims
  Tot_Drug_Cst       — total drug cost
  Tot_Benes          — total beneficiaries
  Opioid_Tot_Clms    — opioid claims
  Opioid_Tot_Drug_Cst — opioid drug cost

Output:
  data/processed/payments/medicare_part_d_by_npi_year.parquet
"""
import os
from pathlib import Path

import polars as pl
from dotenv import load_dotenv

load_dotenv()

RAW       = Path(os.environ.get("DATA_RAW",       "data/raw"))
PROCESSED = Path(os.environ.get("DATA_PROCESSED", "data/processed"))

PART_D_DIR = RAW / "medicare-part-d"
OUT_PATH   = PROCESSED / "payments" / "medicare_part_d_by_npi_year.parquet"

YEARS = range(2019, 2023)

# Columns to keep → canonical names
KEEP_COLS = {
    "Prscrbr_NPI":           "npi",
    "Prscrbr_Last_Org_Name": "last_org_name",
    "Prscrbr_State_Abrvtn":  "state",
    "Prscrbr_Type":          "provider_type",
    "Tot_Clms":              "total_claims",
    "Tot_Drug_Cst":          "total_drug_cost",
    "Tot_Benes":             "total_benes",
    "Opioid_Tot_Clms":       "opioid_claims",
    "Opioid_Tot_Drug_Cst":   "opioid_cost",
}

NUMERIC_COLS = ["total_claims", "total_drug_cost", "total_benes",
                "opioid_claims", "opioid_cost"]


def ingest() -> pl.DataFrame:
    frames: list[pl.DataFrame] = []

    for year in YEARS:
        csv_path = PART_D_DIR / str(year) / f"medicare_part_d_prescribers_{year}.csv"
        if not csv_path.exists():
            print(f"[part_d_ingest] SKIP {year}: {csv_path} not found")
            continue

        df = pl.read_csv(
            csv_path,
            infer_schema_length=10000,
            null_values=["", "N/A", "*"],
            truncate_ragged_lines=True,
        )

        available = {k: v for k, v in KEEP_COLS.items() if k in df.columns}
        df = df.select(list(available.keys())).rename(available)

        # Coerce numerics (suppressed values like "*" become null via null_values above)
        for col in NUMERIC_COLS:
            if col in df.columns:
                df = df.with_columns(pl.col(col).cast(pl.Float64, strict=False))

        df = df.with_columns(pl.lit(year).alias("year"))
        frames.append(df)
        print(f"[part_d_ingest] {year}: {len(df):,} prescriber rows")

    if not frames:
        raise FileNotFoundError(
            f"No Part D CSVs found under {PART_D_DIR}. "
            "Expected files: medicare_part_d_prescribers_YYYY.csv"
        )

    combined = pl.concat(frames, how="diagonal")
    combined = combined.filter(
        pl.col("npi").is_not_null() & (pl.col("npi").cast(pl.Utf8) != "")
    )

    # Cast NPI to string, zero-pad to 10 digits
    combined = combined.with_columns(
        pl.col("npi").cast(pl.Utf8).str.zfill(10)
    )

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    combined.write_parquet(OUT_PATH, compression="zstd")
    print(f"[part_d_ingest] → {OUT_PATH}  ({len(combined):,} rows, {combined['year'].n_unique()} years)")
    return combined


if __name__ == "__main__":
    ingest()
