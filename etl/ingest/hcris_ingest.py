"""
HCRIS (Healthcare Cost Report Information System) ingest.

Reads hospital and SNF cost report CSVs, joins to POS (and optional CCN→NPI crosswalk),
computes standardized financial metrics, and writes data/processed/hcris/hcris_by_npi_year.parquet.

Inputs:
  Hospitals: data/raw/hcris/hospital/CostReport_2020_Final.csv … CostReport_2023_Final.csv
  SNFs:      data/raw/hcris/snf/CostReportsnf_Final_20.csv … CostReportsnf_Final_23.csv
  POS:       data/raw/pos/pos2015.csv (and pos2016–pos2018) for CCN → facility_name, state, type
  Optional:  data/raw/pos/ccn_npi_crosswalk.csv (columns: ccn, npi) for CCN→NPI linkage

Column mapping: see docs/HCRIS_MAPPING.md.
"""
from __future__ import annotations

import os
import re
from pathlib import Path

import polars as pl
from dotenv import load_dotenv

load_dotenv()

# Resolve paths from repo root so script works from any cwd (e.g. "cd etl && python ingest/...")
_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
_raw_default = _REPO_ROOT / "data" / "raw"
_processed_default = _REPO_ROOT / "data" / "processed"
RAW = Path(os.environ.get("DATA_RAW", str(_raw_default)))
PROCESSED = Path(os.environ.get("DATA_PROCESSED", str(_processed_default)))
if not RAW.is_absolute():
    RAW = _REPO_ROOT / RAW
if not PROCESSED.is_absolute():
    PROCESSED = _REPO_ROOT / PROCESSED
POS_DIR = RAW / "pos"
HCRIS_HOSPITAL_DIR = RAW / "hcris" / "hospital"
HCRIS_SNF_DIR = RAW / "hcris" / "snf"
OUT_DIR = PROCESSED / "hcris"
OUT_PARQUET = OUT_DIR / "hcris_by_npi_year.parquet"

# —— Hospital CSV column names (exact) → logical field ——
HOSPITAL_COLS = {
    "Provider CCN": "ccn",
    "Fiscal Year End Date": "fy_end_dt",
    "Net Patient Revenue": "net_patient_revenue",
    "Total Costs": "total_operating_costs",
    "Total Days Title XVIII": "medicare_days",
    "Total Days Title XIX": "medicaid_days",
    "Total Days (V + XVIII + XIX + Unknown)": "total_patient_days",
    "Number of Beds": "total_beds",
}
# —— SNF CSV column names (exact) → logical field ——
SNF_COLS = {
    "Provider CCN": "ccn",
    "Fiscal Year End Date": "fy_end_dt",
    "Net Patient Revenue": "net_patient_revenue",
    "Total Costs": "total_operating_costs",
    "Total Days Title XVIII": "medicare_days",
    "Total Days Title XIX": "medicaid_days",
    "Total Days Total": "total_patient_days",
    "Number of Beds": "total_beds",
}

# POS: prvdr_num = CCN, fac_name, state_cd, city_name; prvdr_ctgry_cd: 01=hospital, 02/03/04/10=snf
POS_CCN_COLS = {"prvdr_num": "ccn", "fac_name": "facility_name", "state_cd": "state", "city_name": "city", "prvdr_ctgry_cd": "prvdr_ctgry_cd"}


def _normalize_ccn(expr: pl.Expr) -> pl.Expr:
    """Zero-pad CCN to 6 digits (works with Expr)."""
    return expr.cast(pl.Utf8).str.strip_chars().str.zfill(6).str.slice(0, 6)


def _parse_year_from_fy_end(expr: pl.Expr) -> pl.Expr:
    """Extract calendar year from fiscal year end date (e.g. 12/31/2022 -> 2022)."""
    return expr.cast(pl.Utf8).str.to_date("%m/%d/%Y", strict=False).dt.year().cast(pl.Int32)


def _safe_numeric(expr: pl.Expr) -> pl.Expr:
    """Cast to Float64; negative or invalid -> null."""
    s = expr.cast(pl.Float64, strict=False)
    return pl.when(s.is_null() | (s < 0)).then(None).otherwise(s)


def _load_hospital_year(path: Path) -> pl.DataFrame | None:
    if not path.exists():
        return None
    available = {k: v for k, v in HOSPITAL_COLS.items() if k in pl.read_csv(path, n_rows=0).columns}
    if not available:
        return None
    df = (
        pl.read_csv(
            path,
            infer_schema_length=0,
            null_values=["", "N/A", "*", "NA"],
            truncate_ragged_lines=True,
        )
        .select(list(available.keys()))
        .rename(available)
    )
    for col in ["net_patient_revenue", "total_operating_costs", "medicare_days", "medicaid_days", "total_patient_days", "total_beds"]:
        if col in df.columns:
            df = df.with_columns(_safe_numeric(pl.col(col)).alias(col))
    if "fy_end_dt" in df.columns:
        df = df.with_columns(_parse_year_from_fy_end(pl.col("fy_end_dt")).alias("year"))
    else:
        df = df.with_columns(pl.lit(None).cast(pl.Int32).alias("year"))
    df = df.with_columns(_normalize_ccn(pl.col("ccn")).alias("ccn"))
    df = df.with_columns(pl.lit("hospital").alias("type"))
    return df


def _load_snf_year(path: Path) -> pl.DataFrame | None:
    if not path.exists():
        return None
    available = {k: v for k, v in SNF_COLS.items() if k in pl.read_csv(path, n_rows=0).columns}
    if not available:
        return None
    df = (
        pl.read_csv(
            path,
            infer_schema_length=0,
            null_values=["", "N/A", "*", "NA"],
            truncate_ragged_lines=True,
        )
        .select(list(available.keys()))
        .rename(available)
    )
    for col in ["net_patient_revenue", "total_operating_costs", "medicare_days", "medicaid_days", "total_patient_days", "total_beds"]:
        if col in df.columns:
            df = df.with_columns(_safe_numeric(pl.col(col)).alias(col))
    if "fy_end_dt" in df.columns:
        df = df.with_columns(_parse_year_from_fy_end(pl.col("fy_end_dt")).alias("year"))
    else:
        df = df.with_columns(pl.lit(None).cast(pl.Int32).alias("year"))
    df = df.with_columns(_normalize_ccn(pl.col("ccn")).alias("ccn"))
    df = df.with_columns(pl.lit("snf").alias("type"))
    return df


def _compute_derived(df: pl.DataFrame) -> pl.DataFrame:
    """Add operating_margin_pct, payer mix %, revenue_per_patient_day; coerce invalid to null."""
    df = df.with_columns(
        (
            100.0
            * (pl.col("net_patient_revenue") - pl.col("total_operating_costs"))
            / pl.col("total_operating_costs").replace(0, None)
        ).alias("operating_margin_pct")
    )
    df = df.with_columns(
        (100.0 * pl.col("medicare_days") / pl.col("total_patient_days").replace(0, None)).alias("medicare_payer_mix_pct")
    )
    df = df.with_columns(
        (100.0 * pl.col("medicaid_days") / pl.col("total_patient_days").replace(0, None)).alias("medicaid_payer_mix_pct")
    )
    df = df.with_columns(
        (pl.col("net_patient_revenue") / pl.col("total_patient_days").replace(0, None)).alias("revenue_per_patient_day")
    )
    # Sanity: replace obviously invalid derived values with null
    df = df.with_columns(
        pl.when((pl.col("operating_margin_pct") < -100) | (pl.col("operating_margin_pct") > 100))
        .then(None)
        .otherwise(pl.col("operating_margin_pct"))
        .alias("operating_margin_pct"),
        pl.when((pl.col("medicare_payer_mix_pct") < 0) | (pl.col("medicare_payer_mix_pct") > 100))
        .then(None)
        .otherwise(pl.col("medicare_payer_mix_pct"))
        .alias("medicare_payer_mix_pct"),
        pl.when((pl.col("medicaid_payer_mix_pct") < 0) | (pl.col("medicaid_payer_mix_pct") > 100))
        .then(None)
        .otherwise(pl.col("medicaid_payer_mix_pct"))
        .alias("medicaid_payer_mix_pct"),
    )
    if "total_beds" in df.columns:
        df = df.with_columns(pl.col("total_beds").fill_null(0).cast(pl.Int32).alias("total_beds"))
    if "total_patient_days" in df.columns:
        df = df.with_columns(pl.col("total_patient_days").cast(pl.Int32, strict=False).alias("total_patient_days"))
    return df


def _load_pos_ccn_lookup() -> pl.DataFrame:
    """Build CCN -> facility_name, state, type from POS CSVs. One row per CCN (latest)."""
    frames = []
    want = list(POS_CCN_COLS.keys())
    for name in ["pos2015.csv", "pos2016.csv", "pos2017.csv", "pos2018.csv"]:
        path = POS_DIR / name
        if not path.exists():
            continue
        try:
            # Read only needed columns; POS has many columns and some dirty values
            df = pl.read_csv(
                path,
                columns=want,
                infer_schema_length=0,
                null_values=["", "."],
                ignore_errors=True,
                truncate_ragged_lines=True,
            )
        except Exception as e:
            print(f"[hcris] POS {name} read skip: {e}")
            continue
        cols = [c for c in want if c in df.columns]
        if not cols or "prvdr_num" not in cols:
            continue
        df = df.select(cols)
        df = df.rename({k: v for k, v in POS_CCN_COLS.items() if k in df.columns})
        if "ccn" not in df.columns:
            continue
        df = df.with_columns(_normalize_ccn(pl.col("ccn")).alias("ccn"))
        df = df.filter(pl.col("ccn").is_not_null() & (pl.col("ccn").str.len_chars() >= 4))
        frames.append(df)
    if not frames:
        return pl.DataFrame(schema={"ccn": pl.Utf8, "facility_name": pl.Utf8, "state": pl.Utf8, "prvdr_ctgry_cd": pl.Utf8})
    all_pos = pl.concat(frames, how="diagonal").unique(subset=["ccn"], keep="last")
    # Map category to facility_type: 01=hospital, 02/03/04/10=snf
    all_pos = all_pos.with_columns(
        pl.when(pl.col("prvdr_ctgry_cd") == "01")
        .then(pl.lit("hospital"))
        .when(pl.col("prvdr_ctgry_cd").is_in(["02", "03", "04", "10"]))
        .then(pl.lit("snf"))
        .otherwise(pl.lit("other"))
        .alias("facility_type")
    )
    return all_pos.select(["ccn", "facility_name", "state", "facility_type"])


def _load_ccn_npi_crosswalk() -> pl.DataFrame | None:
    """Load optional CCN→NPI crosswalk. Columns: ccn, npi (or prvdr_num/npi)."""
    candidates = [
        POS_DIR / "ccn_npi_crosswalk.csv",
        RAW / "pos" / "ccn_npi_crosswalk.csv",
    ]
    for path in candidates:
        if not path.exists():
            continue
        df = pl.read_csv(path, infer_schema_length=0)
        cols = df.columns
        ccn_col = "ccn" if "ccn" in cols else "prvdr_num" if "prvdr_num" in cols else None
        npi_col = "npi" if "npi" in cols else "NPI" if "NPI" in cols else None
        if ccn_col and npi_col:
            df = df.select([ccn_col, npi_col]).rename({ccn_col: "ccn", npi_col: "npi"})
            df = df.with_columns(
                _normalize_ccn(pl.col("ccn")).alias("ccn"),
                pl.col("npi").cast(pl.Utf8).str.strip_chars().str.zfill(10).alias("npi"),
            )
            df = df.filter(pl.col("ccn").is_not_null() & pl.col("npi").is_not_null())
            return df
    return None


def ingest(
    raw_dir: Path | None = None,
    out_path: Path | None = None,
    pos_dir: Path | None = None,
) -> pl.DataFrame:
    raw_dir = raw_dir or RAW
    out_path = out_path or OUT_PARQUET
    pos_dir = pos_dir or POS_DIR

    hospital_dir = raw_dir / "hcris" / "hospital"
    snf_dir = raw_dir / "hcris" / "snf"

    # Load hospital years
    hospital_frames = []
    for year in [2020, 2021, 2022, 2023]:
        path = hospital_dir / f"CostReport_{year}_Final.csv"
        df = _load_hospital_year(path)
        if df is not None:
            if "year" not in df.columns or df["year"].null_count() == len(df):
                df = df.with_columns(pl.lit(year).alias("year"))
            hospital_frames.append(df)
            print(f"[hcris] hospital {year}: {len(df):,} rows")
    if not hospital_frames:
        raise FileNotFoundError(f"No hospital HCRIS files found under {hospital_dir}")

    # Load SNF years (file suffix 20, 21, 22, 23)
    snf_frames = []
    for suffix, year in [("20", 2020), ("21", 2021), ("22", 2022), ("23", 2023)]:
        path = snf_dir / f"CostReportsnf_Final_{suffix}.csv"
        df = _load_snf_year(path)
        if df is not None:
            if "year" not in df.columns or df["year"].null_count() == len(df):
                df = df.with_columns(pl.lit(year).alias("year"))
            snf_frames.append(df)
            print(f"[hcris] snf {year}: {len(df):,} rows")
    if not snf_frames:
        raise FileNotFoundError(f"No SNF HCRIS files found under {snf_dir}")

    combined = pl.concat(hospital_frames + snf_frames, how="diagonal")
    combined = _compute_derived(combined)

    # Drop rows without valid CCN or year
    combined = combined.filter(
        pl.col("ccn").is_not_null() & (pl.col("ccn").str.len_chars() >= 4) & pl.col("year").is_not_null()
    )

    # Join POS for facility_name, state (and optionally align type)
    pos_lookup = _load_pos_ccn_lookup()
    combined = combined.join(pos_lookup, on="ccn", how="left")
    # Use POS facility_name/state/type when present
    combined = combined.with_columns(
        pl.coalesce(pl.col("facility_type"), pl.col("type")).alias("type"),
    )
    if "facility_type" in combined.columns:
        combined = combined.drop("facility_type")

    # CCN → NPI
    crosswalk = _load_ccn_npi_crosswalk()
    if crosswalk is not None:
        npi_count_per_ccn = crosswalk.group_by("ccn").agg(pl.len().alias("_n"))
        crosswalk = crosswalk.join(npi_count_per_ccn, on="ccn", how="left")
        crosswalk = crosswalk.with_columns(
            pl.when(pl.col("_n") > 1).then(pl.lit("multi_npi_ccn")).otherwise(pl.lit("exact")).alias("link_type")
        ).drop("_n")
        combined = combined.join(crosswalk, on="ccn", how="left")
        combined = combined.with_columns(pl.col("link_type").fill_null("no_npi"))
    else:
        combined = combined.with_columns(
            pl.lit(None).cast(pl.Utf8).alias("npi"),
            pl.lit("no_npi").alias("link_type"),
        )
        print("[hcris] No CCN→NPI crosswalk found; npi=null, link_type=no_npi")

    # Output schema (order)
    out_cols = [
        "npi", "ccn", "year", "facility_name", "state", "type",
        "net_patient_revenue", "total_operating_costs", "operating_margin_pct",
        "medicare_payer_mix_pct", "medicaid_payer_mix_pct",
        "total_beds", "total_patient_days", "revenue_per_patient_day",
        "link_type",
    ]
    combined = combined.select([c for c in out_cols if c in combined.columns])
    for c in out_cols:
        if c not in combined.columns:
            combined = combined.with_columns(pl.lit(None).alias(c))
    combined = combined.select(out_cols)

    # Dedupe: same npi/ccn/year keep first
    combined = combined.unique(subset=["npi", "ccn", "year"], keep="first")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    combined.write_parquet(out_path, compression="zstd")

    # Summary
    n_with_npi = combined.filter(pl.col("npi").is_not_null()).height
    n_ccn_years = combined.height
    print(f"[hcris] → {out_path}  ({n_ccn_years:,} rows)")
    print(f"[hcris] NPIs linked: {n_with_npi:,}  (rows with non-null npi)")
    if "operating_margin_pct" in combined.columns:
        margins = combined.filter(pl.col("operating_margin_pct").is_not_null())["operating_margin_pct"]
        if margins.len() > 0:
            print(f"[hcris] Operating margin %: min={margins.min():.1f}, median={margins.median():.1f}, max={margins.max():.1f}")
    return combined


if __name__ == "__main__":
    ingest()
