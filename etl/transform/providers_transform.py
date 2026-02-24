"""
Providers transform: merges canonical NPPES table with LEIE exclusion flags,
deduplicates, and produces the final provider dimension used by loaders.

Reads:  data/processed/providers/providers_canonical.parquet
        data/processed/exclusions/leie_current.parquet  (optional)
Writes: data/processed/providers/providers_final.parquet
"""
import os
from pathlib import Path
import polars as pl
from dotenv import load_dotenv

load_dotenv()

# Resolve from repo root so script works from repo root or etl/
_REPO_ROOT = Path(__file__).resolve().parents[2]
_processed_default = _REPO_ROOT / "data" / "processed"
_proc = os.environ.get("DATA_PROCESSED", str(_processed_default))
PROCESSED = Path(_proc) if Path(_proc).is_absolute() else _REPO_ROOT / _proc


def transform() -> pl.DataFrame:
    providers_path = PROCESSED / "providers" / "providers_canonical.parquet"
    if not providers_path.exists():
        raise FileNotFoundError(f"Run nppes_ingest.py first: {providers_path}")

    df = pl.read_parquet(providers_path)
    print(f"[providers_transform] Loaded {len(df):,} providers")

    # Drop rows with no NPI
    df = df.filter(pl.col("npi").is_not_null() & (pl.col("npi").str.len_chars() > 0))

    # Zip: keep first 5 digits (optional column)
    if "zip" in df.columns:
        df = df.with_columns(pl.col("zip").cast(pl.Utf8).str.slice(0, 5))

    # Build display name (org for type 2, individual for type 1); handle missing columns
    entity_type = pl.col("entity_type_code") if "entity_type_code" in df.columns else pl.lit(None)
    org_name = pl.col("org_name") if "org_name" in df.columns else pl.lit(None)
    first_name = pl.col("first_name") if "first_name" in df.columns else pl.lit(None)
    last_name = pl.col("last_name") if "last_name" in df.columns else pl.lit(None)
    df = df.with_columns(
        pl.when(entity_type == 2)
        .then(org_name)
        .when(first_name.is_not_null() & last_name.is_not_null())
        .then(pl.concat_str([last_name, first_name], separator=", ", ignore_nulls=True))
        .otherwise(org_name)
        .fill_null("")
        .alias("display_name")
    )

    # Merge exclusion flag from LEIE
    leie_path = PROCESSED / "exclusions" / "leie_current.parquet"
    if leie_path.exists():
        leie = pl.read_parquet(leie_path).select(["npi", "reinstated"]).filter(
            pl.col("npi").is_not_null()
        )
        # active exclusions = reinstated == False
        excluded_npis = (
            leie.filter(pl.col("reinstated") == False)
            .select("npi")
            .with_columns(pl.lit(True).alias("is_excluded"))
        )
        df = df.join(excluded_npis, on="npi", how="left")
        df = df.with_columns(
            pl.col("is_excluded").fill_null(False)
        )
        print(f"[providers_transform] {df['is_excluded'].sum():,} providers with active LEIE exclusion")
    else:
        df = df.with_columns(pl.lit(False).alias("is_excluded"))

    # Join Order & Referring eligibility flags
    order_ref_path = PROCESSED / "providers" / "order_referring.parquet"
    if order_ref_path.exists():
        order_ref = pl.read_parquet(order_ref_path).select(
            ["npi"] + [c for c in [
                "eligible_partb", "eligible_dme", "eligible_hha",
                "eligible_pmd", "eligible_hospice",
            ] if c in pl.read_parquet(order_ref_path).columns]
        )
        df = df.join(order_ref, on="npi", how="left")
        for flag in ["eligible_partb", "eligible_dme", "eligible_hha",
                     "eligible_pmd", "eligible_hospice"]:
            if flag in df.columns:
                df = df.with_columns(pl.col(flag).fill_null(False))
        n_eligible = df.filter(pl.col("eligible_partb")).height if "eligible_partb" in df.columns else 0
        print(f"[providers_transform] {n_eligible:,} providers eligible for Part B (order/referring)")
    else:
        print(f"[providers_transform] SKIP order/referring flags: {order_ref_path} not found "
              "(run etl/ingest/order_referring_ingest.py first)")

    out_path = PROCESSED / "providers" / "providers_final.parquet"
    df.write_parquet(out_path, compression="zstd")
    print(f"[providers_transform] → {out_path}  ({len(df):,} rows)")
    return df


if __name__ == "__main__":
    transform()
