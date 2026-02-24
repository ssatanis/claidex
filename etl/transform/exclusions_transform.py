"""
Exclusions transform: standardizes LEIE exclusions and joins to providers.

Reads:  data/processed/exclusions/leie_current.parquet
        data/processed/providers/providers_final.parquet
Writes: data/processed/exclusions/exclusions_final.parquet
        data/exports/nodes_exclusions.csv
        data/exports/edges_exclusions.csv
"""
import os
from pathlib import Path
import polars as pl
from dotenv import load_dotenv

load_dotenv()

PROCESSED = Path(os.environ.get("DATA_PROCESSED", "data/processed"))
EXPORTS = Path(os.environ.get("DATA_EXPORTS", "data/exports"))

EXCL_TYPE_LABELS = {
    "1128a1": "Conviction related to Medicare/Medicaid",
    "1128a2": "Conviction relating to patient abuse",
    "1128a3": "Felony conviction relating to controlled substance",
    "1128a4": "Felony conviction relating to health care fraud",
    "1128b1": "Misdemeanor relating to Medicare/Medicaid",
    "1128b2": "Conviction relating to obstruction",
    "1128b3": "Misdemeanor relating to controlled substance",
    "1128b4": "License revocation/suspension",
    "1128b5": "Exclusion or suspension by federal/state program",
    "1128b6": "Claims for excessive charges",
    "1128b7": "Fraud, kickbacks, or other prohibited activities",
    "1128b8": "Entity controlled by sanctioned individual",
}


def transform() -> pl.DataFrame:
    leie_path = PROCESSED / "exclusions" / "leie_current.parquet"
    if not leie_path.exists():
        raise FileNotFoundError(f"Run leie_ingest.py first: {leie_path}")

    leie = pl.read_parquet(leie_path)
    print(f"[exclusions_transform] Loaded {len(leie):,} LEIE rows")

    leie = leie.with_columns(
        pl.col("excl_type").str.to_lowercase().str.strip_chars().alias("excl_type"),
        pl.col("npi").str.strip_chars().alias("npi"),
    )

    # Add human-readable description
    excl_labels = pl.DataFrame({
        "excl_type": list(EXCL_TYPE_LABELS.keys()),
        "excl_type_label": list(EXCL_TYPE_LABELS.values()),
    })
    leie = leie.join(excl_labels, on="excl_type", how="left")

    # Build display name
    leie = leie.with_columns(
        pl.when(
            pl.col("business_name").is_not_null() & (pl.col("business_name").str.len_chars() > 0)
        )
        .then(pl.col("business_name"))
        .when(
            pl.col("last_name").is_not_null() & pl.col("first_name").is_not_null()
        )
        .then(pl.concat_str(["last_name", "first_name"], separator=", ", ignore_nulls=True))
        .otherwise(pl.col("last_name"))
        .alias("display_name")
    )

    out_path = PROCESSED / "exclusions" / "exclusions_final.parquet"
    leie.write_parquet(out_path, compression="zstd")
    print(f"[exclusions_transform] → {out_path}")

    # Export CSVs for Neo4j
    EXPORTS.mkdir(parents=True, exist_ok=True)

    node_cols = ["exclusion_id", "source", "display_name", "excl_type",
                 "excl_type_label", "excldate", "reinstated", "state"]
    nodes = leie.select([c for c in node_cols if c in leie.columns])
    nodes.write_csv(EXPORTS / "nodes_exclusions.csv")
    print(f"[exclusions_transform] → {EXPORTS}/nodes_exclusions.csv")

    edge_cols = ["npi", "exclusion_id", "excldate"]
    edges = (
        leie.filter(pl.col("npi").is_not_null())
        .select([c for c in edge_cols if c in leie.columns])
    )
    edges.write_csv(EXPORTS / "edges_exclusions.csv")
    print(f"[exclusions_transform] → {EXPORTS}/edges_exclusions.csv  ({len(edges):,} linked by NPI)")

    return leie


if __name__ == "__main__":
    transform()
