"""
Ownership transform: normalizes SNF ownership edges, resolves owner names to
canonical entity IDs, and prepares edges for Neo4j export.

Reads:  data/processed/ownership/snf_owners.parquet
        data/processed/providers/providers_final.parquet  (for NPI lookup by name)
Writes: data/processed/ownership/ownership_edges.parquet
        data/processed/ownership/corporate_entities.parquet
"""
import os
import uuid
from pathlib import Path
import polars as pl
from dotenv import load_dotenv

load_dotenv()

PROCESSED = Path(os.environ.get("DATA_PROCESSED", "data/processed"))


def transform() -> tuple[pl.DataFrame, pl.DataFrame]:
    owners_path = PROCESSED / "ownership" / "snf_owners.parquet"
    if not owners_path.exists():
        raise FileNotFoundError(f"Run snf_ownership_ingest.py first: {owners_path}")

    owners = pl.read_parquet(owners_path)
    print(f"[ownership_transform] Loaded {len(owners):,} ownership rows")

    # Build a deduplicated entity table (org owners + individual owners)
    org_owners = owners.filter(
        pl.col("owner_type").str.strip_chars().str.to_uppercase() == "O"
    ).select([
        "owner_associate_id",
        "owner_org_name",
        "owner_dba",
        "owner_address",
        "owner_city",
        "owner_state",
        "owner_zip",
        "flag_corporation",
        "flag_llc",
        "flag_holding_company",
        "flag_investment_firm",
        "flag_private_equity",
        "flag_for_profit",
        "flag_non_profit",
    ] if all(c in owners.columns for c in ["flag_corporation"]) else
    [c for c in ["owner_associate_id", "owner_org_name", "owner_dba",
                 "owner_address", "owner_city", "owner_state", "owner_zip"]
     if c in owners.columns]
    ).unique(subset=["owner_associate_id"])

    org_owners = org_owners.with_columns(
        pl.col("owner_associate_id").alias("entity_id"),
        pl.lit("Organization").alias("entity_type"),
        pl.col("owner_org_name").alias("name"),
    )
    print(f"[ownership_transform] {len(org_owners):,} unique org entities")

    # Individual owners (persons) — kept separate, not merged to entities table
    ind_owners = owners.filter(
        pl.col("owner_type").str.strip_chars().str.to_uppercase() == "I"
    ).select([
        c for c in ["owner_associate_id", "owner_last_name", "owner_first_name",
                    "owner_middle_name", "owner_title", "owner_city", "owner_state"]
        if c in owners.columns
    ]).unique(subset=["owner_associate_id"])

    # Ownership edges
    edge_cols = [c for c in [
        "enrollment_id", "provider_associate_id", "provider_org_name",
        "owner_associate_id", "owner_type", "role_code", "role_text",
        "association_date", "ownership_pct",
    ] if c in owners.columns]

    edges = owners.select(edge_cols)

    # Write outputs
    out_ownership = PROCESSED / "ownership"
    edges.write_parquet(out_ownership / "ownership_edges.parquet", compression="zstd")
    print(f"[ownership_transform] → {out_ownership}/ownership_edges.parquet  ({len(edges):,} rows)")

    org_owners.write_parquet(out_ownership / "corporate_entities.parquet", compression="zstd")
    print(f"[ownership_transform] → {out_ownership}/corporate_entities.parquet  ({len(org_owners):,} rows)")

    ind_owners.write_parquet(out_ownership / "entity_officers.parquet", compression="zstd")
    print(f"[ownership_transform] → {out_ownership}/entity_officers.parquet  ({len(ind_owners):,} rows)")

    return edges, org_owners


if __name__ == "__main__":
    transform()
