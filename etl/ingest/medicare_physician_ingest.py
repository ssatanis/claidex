"""
Medicare Physician/Supplier PUF ingest (by-provider roll-up, 2019–2023).

Source: data/raw/medicare-physician/YYYY/Medicare_Physician_Other_Practitioners_by_Provider_YYYY.csv
Columns vary slightly by year but always include:
  Rndrng_NPI, Rndrng_Prvdr_Last_Org_Name, Rndrng_Prvdr_First_Name,
  Rndrng_Prvdr_City, Rndrng_Prvdr_State_Abrvtn, Rndrng_Prvdr_Zip5,
  Rndrng_Prvdr_Type, Tot_Mdcr_Alowd_Amt, Tot_Mdcr_Pymt_Amt, Tot_Srvcs, Tot_Benes

Output: data/processed/payments/medicare_by_npi_year.parquet
"""
import os
from pathlib import Path
import polars as pl
from dotenv import load_dotenv

load_dotenv()

RAW_DIR = Path(os.environ.get("DATA_RAW", "data/raw"))
OUT_DIR = Path(os.environ.get("DATA_PROCESSED", "data/processed")) / "payments"

YEARS = [2019, 2020, 2021, 2022, 2023]

WANTED = {
    "Rndrng_NPI": "npi",
    "Rndrng_Prvdr_Last_Org_Name": "last_org_name",
    "Rndrng_Prvdr_First_Name": "first_name",
    "Rndrng_Prvdr_City": "city",
    "Rndrng_Prvdr_State_Abrvtn": "state",
    "Rndrng_Prvdr_Zip5": "zip",
    "Rndrng_Prvdr_Type": "provider_type",
    "Rndrng_Prvdr_Ent_Cd": "entity_code",
    "Tot_Mdcr_Alowd_Amt": "medicare_allowed",
    "Tot_Mdcr_Pymt_Amt": "medicare_paid",
    "Tot_Mdcr_Stdzd_Amt": "medicare_standardized",
    "Tot_Srvcs": "total_services",
    "Tot_Benes": "total_beneficiaries",
}


def _load_year(year: int, raw_dir: Path) -> pl.DataFrame | None:
    year_dir = raw_dir / "medicare-physician" / str(year)
    # prefer the by-provider file (not by-service)
    candidates = sorted(year_dir.glob(f"Medicare_Physician_Other_Practitioners_by_Provider_{year}.csv"))
    if not candidates:
        print(f"[medicare_physician] No file for {year} in {year_dir}, skipping")
        return None

    path = candidates[0]
    print(f"[medicare_physician] {year}: {path.name}")

    available = pl.read_csv(path, n_rows=0, infer_schema_length=0).columns
    wanted_avail = {k: v for k, v in WANTED.items() if k in available}

    df = (
        pl.scan_csv(path, infer_schema_length=0, null_values=["", "*"],
                    ignore_errors=True)
        .select(list(wanted_avail))
        .rename(wanted_avail)
        .with_columns(
            pl.lit(year).cast(pl.Int16).alias("year"),
            pl.col("npi").str.strip_chars(),
        )
        .collect(engine="streaming")
    )

    # Cast numeric columns
    money_cols = ["medicare_allowed", "medicare_paid", "medicare_standardized",
                  "total_services", "total_beneficiaries"]
    df = df.with_columns([
        pl.col(c).cast(pl.Float64, strict=False)
        for c in money_cols if c in df.columns
    ])
    return df


def ingest(raw_dir: Path = RAW_DIR, out_dir: Path = OUT_DIR) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    frames = []
    for year in YEARS:
        df = _load_year(year, raw_dir)
        if df is not None:
            frames.append(df)

    if not frames:
        raise FileNotFoundError("No Medicare physician files found for any year.")

    combined = pl.concat(frames, how="diagonal")
    print(f"[medicare_physician] Combined: {len(combined):,} rows")

    # Aggregate provider-level totals per NPI + year
    money_cols = [c for c in ["medicare_allowed", "medicare_paid", "medicare_standardized",
                               "total_services", "total_beneficiaries"] if c in combined.columns]

    # Keep provider metadata from the latest year (highest year number)
    meta_cols = [c for c in ["last_org_name", "first_name", "city", "state",
                               "zip", "provider_type", "entity_code"] if c in combined.columns]

    agg = (
        combined
        .group_by(["npi", "year"])
        .agg(
            [pl.col(c).sum() for c in money_cols]
            + [pl.col(c).last() for c in meta_cols]
        )
        .sort(["npi", "year"])
    )

    agg.write_parquet(out_dir / "medicare_by_npi_year.parquet", compression="zstd")
    print(f"[medicare_physician] → {out_dir}/medicare_by_npi_year.parquet  ({len(agg):,} rows)")


if __name__ == "__main__":
    ingest()
