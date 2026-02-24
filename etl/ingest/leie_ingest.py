"""
LEIE ingest: reads the OIG full exclusion CSV (+ monthly supplement) and
produces data/processed/exclusions/leie_current.parquet

Source columns: LASTNAME, FIRSTNAME, MIDNAME, BUSNAME, GENERAL, SPECIALTY,
                UPIN, NPI, DOB, ADDRESS, CITY, STATE, ZIP,
                EXCLTYPE, EXCLDATE, REINDATE, WAIVERDATE, WVRSTATE
"""
import os
import uuid
from pathlib import Path
import polars as pl
from dotenv import load_dotenv

load_dotenv()

RAW_DIR = Path(os.environ.get("DATA_RAW", "data/raw"))
OUT_DIR = Path(os.environ.get("DATA_PROCESSED", "data/processed")) / "exclusions"

DATE_FMT = "%Y%m%d"  # LEIE dates are YYYYMMDD strings


def _parse_date(col: str) -> pl.Expr:
    """Parse YYYYMMDD string; '00000000' → null."""
    return (
        pl.when(pl.col(col).str.strip_chars() == "00000000")
        .then(None)
        .otherwise(pl.col(col).str.strip_chars())
        .str.to_date(DATE_FMT, strict=False)
        .alias(col.lower())
    )


def _load_leie_csv(path: Path) -> pl.DataFrame:
    df = pl.read_csv(
        path,
        infer_schema_length=0,
        null_values=["", " "],
    )
    df = df.rename({c: c.strip() for c in df.columns})

    # NPI column: '0000000000' means no NPI
    df = df.with_columns(
        pl.when(pl.col("NPI").str.strip_chars() == "0000000000")
        .then(None)
        .otherwise(pl.col("NPI").str.strip_chars())
        .alias("npi"),
        pl.col("LASTNAME").str.strip_chars().alias("last_name"),
        pl.col("FIRSTNAME").str.strip_chars().alias("first_name"),
        pl.col("MIDNAME").str.strip_chars().alias("middle_name"),
        pl.col("BUSNAME").str.strip_chars().alias("business_name"),
        pl.col("GENERAL").str.strip_chars().alias("general_type"),
        pl.col("SPECIALTY").str.strip_chars().alias("specialty"),
        pl.col("UPIN").str.strip_chars().alias("upin"),
        pl.col("DOB").str.strip_chars().alias("dob_raw"),
        pl.col("ADDRESS").str.strip_chars().alias("address"),
        pl.col("CITY").str.strip_chars().alias("city"),
        pl.col("STATE").str.strip_chars().alias("state"),
        pl.col("ZIP").str.strip_chars().alias("zip"),
        pl.col("EXCLTYPE").str.strip_chars().alias("excl_type"),
        pl.col("WVRSTATE").str.strip_chars().alias("waiver_state"),
        _parse_date("EXCLDATE"),
        _parse_date("REINDATE"),
        _parse_date("WAIVERDATE"),
    )

    keep = [
        "npi", "last_name", "first_name", "middle_name", "business_name",
        "general_type", "specialty", "upin", "dob_raw",
        "address", "city", "state", "zip",
        "excl_type", "excldate", "reindate", "waiverdate", "waiver_state",
    ]
    return df.select([c for c in keep if c in df.columns])


def ingest(raw_dir: Path = RAW_DIR, out_dir: Path = OUT_DIR) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)

    leie_base = raw_dir / "leie"
    # pick the latest YYYY-MM folder (skip named subdirs like monthly-supplements)
    import re
    month_dirs = sorted(
        [d for d in leie_base.iterdir()
         if d.is_dir() and re.match(r'^\d{4}-\d{2}$', d.name)],
        reverse=True,
    )
    if not month_dirs:
        raise FileNotFoundError(f"No LEIE month dirs under {leie_base}")

    latest = month_dirs[0]
    print(f"[leie] Using {latest}")

    # full file
    full_files = sorted(latest.glob("leie_full_*.csv"))
    if not full_files:
        raise FileNotFoundError(f"No leie_full_*.csv in {latest}")
    df = _load_leie_csv(full_files[-1])
    print(f"[leie] Full file: {len(df):,} rows")

    # supplements (may be empty / zero-byte)
    for supp in sorted(latest.glob("*excl*.csv")) + sorted(latest.glob("*rein*.csv")):
        if supp.stat().st_size > 100:
            supp_df = _load_leie_csv(supp)
            print(f"[leie] Supplement {supp.name}: {len(supp_df):,} rows")
            df = pl.concat([df, supp_df], how="diagonal")

    # monthly-supplements folder
    monthly_dir = leie_base / "monthly-supplements"
    if monthly_dir.exists():
        for f in sorted(monthly_dir.glob("*.csv")):
            if f.stat().st_size > 100:
                supp_df = _load_leie_csv(f)
                print(f"[leie] Monthly supplement {f.name}: {len(supp_df):,} rows")
                df = pl.concat([df, supp_df], how="diagonal")

    # stable exclusion_id: hash of npi+excl_type+excl_date or row hash
    df = df.with_columns(
        pl.Series("exclusion_id", [str(uuid.uuid4()) for _ in range(len(df))]),
        pl.lit("LEIE").alias("source"),
        pl.col("reindate").is_not_null().alias("reinstated"),
    )

    df.write_parquet(out_dir / "leie_current.parquet", compression="zstd")
    print(f"[leie] → {out_dir}/leie_current.parquet  ({len(df):,} rows)")


if __name__ == "__main__":
    ingest()
