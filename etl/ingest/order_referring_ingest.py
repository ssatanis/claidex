"""
Medicare Order & Referring Providers ingest.

Reads the CMS Order and Referring file that lists NPIs eligible to order/refer
under Medicare Part B, DME, HHA, PMD, and Hospice.

Source file:
  data/raw/order-referring/order_and_referring_20260219.csv

Columns (from actual header):
  NPI, LAST_NAME, FIRST_NAME, PARTB, DME, HHA, PMD, HOSPICE

The flag columns (PARTB, DME, HHA, PMD, HOSPICE) contain 'Y' or are blank/null.
They are normalized to booleans in the output.

Output:
  data/processed/providers/order_referring.parquet
"""
import os
from pathlib import Path

import polars as pl
from dotenv import load_dotenv

load_dotenv()

RAW       = Path(os.environ.get("DATA_RAW",       "data/raw"))
PROCESSED = Path(os.environ.get("DATA_PROCESSED", "data/processed"))

ORDER_REFERRING_DIR = RAW / "order-referring"
OUT_PATH            = PROCESSED / "providers" / "order_referring.parquet"

FLAG_COLS = ["PARTB", "DME", "HHA", "PMD", "HOSPICE"]


def _find_source_file() -> Path:
    """Find the most recent order_and_referring_*.csv in the source dir."""
    candidates = sorted(ORDER_REFERRING_DIR.glob("order_and_referring_*.csv"), reverse=True)
    if not candidates:
        raise FileNotFoundError(
            f"No order_and_referring_*.csv found under {ORDER_REFERRING_DIR}"
        )
    return candidates[0]


def ingest() -> pl.DataFrame:
    src = _find_source_file()
    print(f"[order_referring_ingest] Reading {src.name}")

    df = pl.read_csv(
        src,
        infer_schema_length=10000,
        null_values=["", "N/A"],
        truncate_ragged_lines=True,
    )

    # Normalize column names to lowercase with canonical prefix
    rename_map: dict[str, str] = {
        "NPI":        "npi",
        "LAST_NAME":  "last_name",
        "FIRST_NAME": "first_name",
    }
    df = df.rename({k: v for k, v in rename_map.items() if k in df.columns})

    # Normalize flag columns: 'Y' → True, anything else → False
    for flag in FLAG_COLS:
        if flag in df.columns:
            new_col = f"eligible_{flag.lower()}"
            df = df.with_columns(
                (pl.col(flag).cast(pl.Utf8).str.to_uppercase() == "Y").alias(new_col)
            ).drop(flag)

    # Ensure NPI is a zero-padded 10-digit string
    df = df.filter(pl.col("npi").is_not_null() & (pl.col("npi").cast(pl.Utf8) != ""))
    df = df.with_columns(pl.col("npi").cast(pl.Utf8).str.zfill(10))

    # Deduplicate on NPI (keep first occurrence — eligible if listed at all)
    df = df.unique(subset=["npi"], keep="first")

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    df.write_parquet(OUT_PATH, compression="zstd")
    print(f"[order_referring_ingest] → {OUT_PATH}  ({len(df):,} rows)")
    return df


if __name__ == "__main__":
    ingest()
