"""
Payments transform: joins Medicaid + Medicare PUFs + Medicare Part D into a
single combined payments table keyed by NPI/year/program.

Reads:  data/processed/payments/medicaid_by_npi_year.parquet
        data/processed/payments/medicare_by_npi_year.parquet
        data/processed/payments/medicare_part_d_by_npi_year.parquet  (optional)
        data/processed/providers/providers_final.parquet  (for provider metadata)
Writes: data/processed/payments/payments_combined.parquet

NOTE: Medicare Inpatient (facility-level, CCN-keyed) is NOT merged here because
      it has no NPI. It lives in its own table: medicare_inpatient_by_facility.parquet.
"""
import os
from pathlib import Path
import polars as pl
from dotenv import load_dotenv

load_dotenv()

PROCESSED = Path(os.environ.get("DATA_PROCESSED", "data/processed"))


def transform() -> pl.DataFrame:
    payments_dir = PROCESSED / "payments"
    frames = []

    medicaid_path = payments_dir / "medicaid_by_npi_year.parquet"
    if medicaid_path.exists():
        medicaid = pl.read_parquet(medicaid_path).with_columns(
            pl.lit("Medicaid").alias("program")
        )
        # Normalize column names
        medicaid = medicaid.rename({
            c: c for c in medicaid.columns  # already normalized in ingest
        })
        if "total_paid" in medicaid.columns:
            medicaid = medicaid.rename({"total_paid": "payments"})
        if "total_claims" in medicaid.columns:
            medicaid = medicaid.rename({"total_claims": "claims"})
        if "total_beneficiaries" in medicaid.columns:
            medicaid = medicaid.rename({"total_beneficiaries": "beneficiaries"})
        frames.append(medicaid)
        print(f"[payments_transform] Medicaid: {len(medicaid):,} rows")

    medicare_path = payments_dir / "medicare_by_npi_year.parquet"
    if medicare_path.exists():
        medicare = pl.read_parquet(medicare_path).with_columns(
            pl.lit("Medicare").alias("program")
        )
        if "medicare_paid" in medicare.columns:
            medicare = medicare.rename({"medicare_paid": "payments"})
        if "medicare_allowed" in medicare.columns:
            medicare = medicare.rename({"medicare_allowed": "allowed"})
        if "total_services" in medicare.columns:
            medicare = medicare.rename({"total_services": "claims"})
        if "total_beneficiaries" in medicare.columns:
            medicare = medicare.rename({"total_beneficiaries": "beneficiaries"})
        frames.append(medicare)
        print(f"[payments_transform] Medicare: {len(medicare):,} rows")

    part_d_path = payments_dir / "medicare_part_d_by_npi_year.parquet"
    if part_d_path.exists():
        part_d = pl.read_parquet(part_d_path).with_columns(
            pl.lit("MedicarePartD").alias("program")
        )
        # Rename to canonical payment schema
        if "total_drug_cost" in part_d.columns:
            part_d = part_d.rename({"total_drug_cost": "payments"})
        if "total_claims" in part_d.columns:
            part_d = part_d.rename({"total_claims": "claims"})
        if "total_benes" in part_d.columns:
            part_d = part_d.rename({"total_benes": "beneficiaries"})
        frames.append(part_d)
        print(f"[payments_transform] MedicarePartD: {len(part_d):,} rows")
    else:
        print(f"[payments_transform] SKIP MedicarePartD: {part_d_path} not found "
              "(run etl/ingest/medicare_part_d_ingest.py first)")

    if not frames:
        raise FileNotFoundError("No payment Parquets found; run ingest scripts first.")

    # Normalize year to Int32 across all frames before diagonal concat
    frames = [
        f.with_columns(pl.col("year").cast(pl.Int32)) if "year" in f.columns else f
        for f in frames
    ]

    combined = pl.concat(frames, how="diagonal").sort(["npi", "year", "program"])
    print(f"[payments_transform] Combined: {len(combined):,} rows")

    out_path = payments_dir / "payments_combined.parquet"
    combined.write_parquet(out_path, compression="zstd")
    print(f"[payments_transform] → {out_path}")
    return combined


if __name__ == "__main__":
    transform()
