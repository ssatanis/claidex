"""
Export canonical CSVs for Neo4j LOAD CSV import.

Reads processed Parquets and writes to data/exports/ (which is mounted as
/var/lib/neo4j/import inside the Docker container).

Files produced
--------------
  nodes_providers.csv   Provider nodes
  nodes_entities.csv    CorporateEntity nodes (org owners + SNF stub entities)
  nodes_persons.csv     Person nodes (individual SNF owners)
  nodes_exclusions.csv  Exclusion nodes (LEIE)
  edges_ownership.csv   OWNS / CONTROLLED_BY edges (owner → SNF)
  edges_payments.csv   RECEIVED_PAYMENT edges (provider → PaymentSummary)
  edges_exclusions.csv  EXCLUDED_BY edges (provider → exclusion)

Column names here are the ground-truth used by infra/neo4j_init.cypher.
If providers_final.parquet is not yet available, providers are derived from
payments_combined.parquet (NPI deduplicated, latest year wins).

Usage
-----
  python etl/export_for_neo4j.py
"""
import os
import sys
from pathlib import Path

import polars as pl
from dotenv import load_dotenv

load_dotenv()

# Resolve from repo root so script works when invoked from etl/ or repo root
_REPO_ROOT = Path(__file__).resolve().parents[1]
_processed_default = _REPO_ROOT / "data" / "processed"
_exports_default = _REPO_ROOT / "data" / "exports"
_proc = os.environ.get("DATA_PROCESSED", str(_processed_default))
_exports = os.environ.get("DATA_EXPORTS", str(_exports_default))
PROCESSED = Path(_proc) if Path(_proc).is_absolute() else _REPO_ROOT / _proc
EXPORTS = Path(_exports) if Path(_exports).is_absolute() else _REPO_ROOT / _exports


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _read_required(path: Path) -> pl.DataFrame:
    if not path.exists():
        raise FileNotFoundError(
            f"Required Parquet missing: {path}\n"
            f"  → Run the corresponding ingest/transform script first."
        )
    return pl.read_parquet(path)


def _read_optional(path: Path) -> pl.DataFrame | None:
    if not path.exists():
        print(f"[export] SKIP (not found): {path}")
        return None
    return pl.read_parquet(path)


def _write_header_only_csv(out: Path, header: list[str]) -> None:
    """Write a CSV with only the header row so Neo4j LOAD CSV runs without data."""
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="", encoding="utf-8") as f:
        import csv
        w = csv.writer(f)
        w.writerow(header)
    print(f"[export] {out.name:<25} (header only, no source data)")


def _safe_bool_col(df: pl.DataFrame, col: str) -> pl.DataFrame:
    """Cast a boolean/null flag column to literal 'true'/'false' strings."""
    if col not in df.columns:
        return df.with_columns(pl.lit("false").alias(col))
    return df.with_columns(
        pl.col(col).cast(pl.Utf8).str.to_lowercase().fill_null("false").alias(col)
    )


# ---------------------------------------------------------------------------
# Node exports
# ---------------------------------------------------------------------------

def export_providers() -> Path:
    """
    nodes_providers.csv columns:
      npi, display_name, entity_type, city, state, zip, taxonomy_1, is_excluded
    """
    out = EXPORTS / "nodes_providers.csv"
    providers_path = PROCESSED / "providers" / "providers_final.parquet"
    payments_path  = PROCESSED / "payments"  / "payments_combined.parquet"

    if providers_path.exists():
        # Full NPPES-sourced providers
        df = pl.read_parquet(providers_path)
        rename = {}
        if "entity_type_code" in df.columns:
            rename["entity_type_code"] = "entity_type"
        if rename:
            df = df.rename(rename)
        keep = ["npi", "display_name", "entity_type", "city", "state", "zip",
                "taxonomy_1", "is_excluded"]
        df = df.select([c for c in keep if c in df.columns])
        # Ensure taxonomy_1 and is_excluded exist
        if "taxonomy_1" not in df.columns:
            df = df.with_columns(pl.lit(None).cast(pl.Utf8).alias("taxonomy_1"))
        if "is_excluded" not in df.columns:
            df = df.with_columns(pl.lit(False).alias("is_excluded"))
        source = "providers_final.parquet"

    elif payments_path.exists():
        # Fallback: derive provider list from payment data (NPPES not yet ingested)
        pay = pl.read_parquet(payments_path)

        # Latest row per NPI → most recent city/state/zip
        df = (
            pay.sort("year", descending=True)
               .unique(subset=["npi"], keep="first")
               .with_columns(
                   pl.when(pl.col("entity_code") == "I")
                   .then(
                       pl.concat_str(
                           [pl.col("last_org_name"), pl.col("first_name")],
                           separator=", ",
                           ignore_nulls=True,
                       )
                   )
                   .otherwise(pl.col("last_org_name"))
                   .alias("display_name")
               )
               .rename({"entity_code": "entity_type"})
               .select(["npi", "display_name", "entity_type", "city", "state", "zip"])
        )

        # Join is_excluded flag from exclusions
        excl_path = PROCESSED / "exclusions" / "exclusions_final.parquet"
        if excl_path.exists():
            excl = pl.read_parquet(excl_path)
            excluded_npis = (
                excl.filter(pl.col("reinstated") == False)
                    .filter(pl.col("npi").is_not_null() & (pl.col("npi") != ""))
                    .select("npi")
                    .unique()
                    .with_columns(pl.lit(True).alias("is_excluded"))
            )
            df = (
                df.join(excluded_npis, on="npi", how="left")
                  .with_columns(pl.col("is_excluded").fill_null(False))
            )
        else:
            df = df.with_columns(pl.lit(False).alias("is_excluded"))

        df = df.with_columns(pl.lit(None).cast(pl.Utf8).alias("taxonomy_1"))
        source = "payments_combined.parquet (providers_final not yet built)"

    else:
        raise FileNotFoundError(
            "No provider source found.\n"
            "  Run nppes_ingest.py + providers_transform.py, OR\n"
            "  Run medicare_physician_ingest.py for a minimal fallback."
        )

    df = df.filter(pl.col("npi").is_not_null() & (pl.col("npi").cast(pl.Utf8) != ""))
    df.write_csv(out)
    print(f"[export] nodes_providers.csv    {len(df):>10,} rows  (source: {source})")
    return out


def export_entities() -> Path:
    """
    nodes_entities.csv columns:
      entity_id, name, dba, city, state, zip, entity_type,
      flag_corporation, flag_llc, flag_holding_company,
      flag_investment_firm, flag_private_equity, flag_for_profit, flag_non_profit
    """
    out = EXPORTS / "nodes_entities.csv"
    corp_path  = PROCESSED / "ownership" / "corporate_entities.parquet"
    edges_path = PROCESSED / "ownership" / "ownership_edges.parquet"
    frames: list[pl.DataFrame] = []

    # Org owners (from ownership_transform)
    corp = _read_optional(corp_path)
    if corp is not None:
        rename = {
            "owner_dba":   "dba",
            "owner_city":  "city",
            "owner_state": "state",
            "owner_zip":   "zip",
        }
        corp = corp.rename({k: v for k, v in rename.items() if k in corp.columns})
        keep = ["entity_id", "name", "dba", "city", "state", "zip", "entity_type",
                "flag_corporation", "flag_llc", "flag_holding_company",
                "flag_investment_firm", "flag_private_equity",
                "flag_for_profit", "flag_non_profit"]
        corp = corp.select([c for c in keep if c in corp.columns])
        frames.append(corp)

    # SNF stub entities (provider side of ownership edges — not in corp table)
    edges = _read_optional(edges_path)
    if edges is not None and "provider_associate_id" in edges.columns:
        snfs = (
            edges.select([
                pl.col("provider_associate_id").alias("entity_id"),
                pl.col("provider_org_name").alias("name"),
            ])
            .unique(subset=["entity_id"])
            .filter(pl.col("entity_id").is_not_null())
            .with_columns([
                pl.lit("SNF").alias("entity_type"),
                pl.lit(None).cast(pl.Utf8).alias("dba"),
                pl.lit(None).cast(pl.Utf8).alias("city"),
                pl.lit(None).cast(pl.Utf8).alias("state"),
                pl.lit(None).cast(pl.Utf8).alias("zip"),
            ])
        )
        frames.append(snfs)

    if not frames:
        _write_header_only_csv(out, ["entity_id", "name", "dba", "city", "state", "zip", "entity_type",
            "flag_corporation", "flag_llc", "flag_holding_company",
            "flag_investment_firm", "flag_private_equity",
            "flag_for_profit", "flag_non_profit"])
        return out

    combined = pl.concat(frames, how="diagonal").unique(subset=["entity_id"], keep="first")

    # Normalize boolean flag columns
    for flag in ["flag_corporation", "flag_llc", "flag_holding_company",
                 "flag_investment_firm", "flag_private_equity",
                 "flag_for_profit", "flag_non_profit"]:
        combined = _safe_bool_col(combined, flag)

    combined.write_csv(out)
    print(f"[export] nodes_entities.csv     {len(combined):>10,} rows")
    return out


def export_persons() -> Path:
    """
    nodes_persons.csv columns:
      associate_id, last_name, first_name, middle_name, title, city, state
    """
    out  = EXPORTS / "nodes_persons.csv"
    path = PROCESSED / "ownership" / "entity_officers.parquet"

    df = _read_optional(path)
    if df is None:
        _write_header_only_csv(out, ["associate_id", "last_name", "first_name", "middle_name", "title", "city", "state"])
        return out
    rename = {
        "owner_associate_id": "associate_id",
        "owner_last_name":    "last_name",
        "owner_first_name":   "first_name",
        "owner_middle_name":  "middle_name",
        "owner_title":        "title",
        "owner_city":         "city",
        "owner_state":        "state",
    }
    df = (
        df.rename({k: v for k, v in rename.items() if k in df.columns})
          .filter(pl.col("associate_id").is_not_null())
          .unique(subset=["associate_id"])
    )
    df.write_csv(out)
    print(f"[export] nodes_persons.csv      {len(df):>10,} rows")
    return out


def export_exclusions() -> Path:
    """
    nodes_exclusions.csv columns:
      exclusion_id, source, display_name, excl_type, excl_type_label,
      excldate, reinstated, state
    """
    out  = EXPORTS / "nodes_exclusions.csv"
    path = PROCESSED / "exclusions" / "exclusions_final.parquet"

    df = _read_optional(path)
    if df is None:
        _write_header_only_csv(out, ["exclusion_id", "source", "display_name", "excl_type",
            "excl_type_label", "excldate", "reinstated", "state"])
        return out
    keep = ["exclusion_id", "source", "display_name", "excl_type",
            "excl_type_label", "excldate", "reinstated", "state"]
    df = df.select([c for c in keep if c in df.columns])
    df.write_csv(out)
    print(f"[export] nodes_exclusions.csv   {len(df):>10,} rows")
    return out


# ---------------------------------------------------------------------------
# Edge exports
# ---------------------------------------------------------------------------

def export_edges_ownership() -> Path:
    """
    edges_ownership.csv columns:
      from_id, from_type (O=org / I=individual), to_id,
      role_code, role_text, association_date, ownership_pct

    from_id = owner_associate_id   (→ CorporateEntity.entity_id  if from_type=O)
                                   (→ Person.associate_id          if from_type=I)
    to_id   = provider_associate_id (→ CorporateEntity.entity_id — the SNF)
    """
    out  = EXPORTS / "edges_ownership.csv"
    path = PROCESSED / "ownership" / "ownership_edges.parquet"

    df = _read_optional(path)
    if df is None:
        _write_header_only_csv(out, ["from_id", "from_type", "to_id", "role_code", "role_text", "association_date", "ownership_pct"])
        return out
    optional_cols = [c for c in ["role_code", "role_text", "association_date", "ownership_pct"]
                     if c in df.columns]
    df = (
        df.rename({
            "owner_associate_id":    "from_id",
            "owner_type":            "from_type",
            "provider_associate_id": "to_id",
        })
        .select(["from_id", "from_type", "to_id"] + optional_cols)
        .filter(pl.col("from_id").is_not_null() & pl.col("to_id").is_not_null())
        .with_columns(
            pl.col("from_type").str.strip_chars().str.to_uppercase()
        )
    )
    df.write_csv(out)
    print(f"[export] edges_ownership.csv    {len(df):>10,} rows  "
          f"(O={df.filter(pl.col('from_type')=='O').height:,}  "
          f"I={df.filter(pl.col('from_type')=='I').height:,})")
    return out


def export_edges_payments() -> Path:
    """
    edges_payments.csv columns:
      record_id (npi:year:program), npi, year, program,
      payments, allowed, claims, beneficiaries
    """
    out  = EXPORTS / "edges_payments.csv"
    path = PROCESSED / "payments" / "payments_combined.parquet"

    if not path.exists():
        raise FileNotFoundError(
            f"Payments Parquet missing: {path}\n"
            f"  → Run payments transform (e.g. medicare_physician_ingest + payments_transform) first."
        )
    df = pl.read_parquet(path)

    # Filter out rows with null year, npi, or program (cannot create valid record_id)
    df = df.filter(
        pl.col("npi").is_not_null() & (pl.col("npi").cast(pl.Utf8) != "") &
        pl.col("year").is_not_null() &
        pl.col("program").is_not_null() & (pl.col("program").cast(pl.Utf8) != "")
    )

    # Surrogate key for the PaymentSummary node
    df = df.with_columns(
        (
            pl.col("npi").cast(pl.Utf8)
            + pl.lit(":")
            + pl.col("year").cast(pl.Utf8)
            + pl.lit(":")
            + pl.col("program").cast(pl.Utf8)
        ).alias("record_id")
    )

    keep = ["record_id", "npi", "year", "program",
            "payments", "allowed", "claims", "beneficiaries"]
    df = df.select([c for c in keep if c in df.columns])
    df.write_csv(out)
    print(f"[export] edges_payments.csv     {len(df):>10,} rows")
    return out


def export_edges_exclusions() -> Path:
    """
    edges_exclusions.csv columns:
      npi, exclusion_id, excldate
    """
    out  = EXPORTS / "edges_exclusions.csv"
    path = PROCESSED / "exclusions" / "exclusions_final.parquet"

    df = _read_optional(path)
    if df is None:
        _write_header_only_csv(out, ["npi", "exclusion_id", "excldate"])
        return out
    df = (
        df.filter(pl.col("npi").is_not_null() & (pl.col("npi").cast(pl.Utf8) != ""))
          .select([c for c in ["npi", "exclusion_id", "excldate"] if c in df.columns])
    )
    df.write_csv(out)
    print(f"[export] edges_exclusions.csv   {len(df):>10,} rows")
    return out


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def export_all() -> dict[str, Path]:
    EXPORTS.mkdir(parents=True, exist_ok=True)
    print(f"\n[export] Target directory: {EXPORTS.resolve()}\n")

    results: dict[str, Path] = {}

    # Nodes first
    results["nodes_providers"]  = export_providers()
    results["nodes_entities"]   = export_entities()
    results["nodes_persons"]    = export_persons()
    results["nodes_exclusions"] = export_exclusions()

    # Then edges
    results["edges_ownership"]  = export_edges_ownership()
    results["edges_payments"]   = export_edges_payments()
    results["edges_exclusions"] = export_edges_exclusions()

    print(f"\n[export] Complete — {len(results)} CSVs written to {EXPORTS.resolve()}\n")
    return results


if __name__ == "__main__":
    try:
        export_all()
    except FileNotFoundError as e:
        print(f"\n[export] ERROR: {e}", file=sys.stderr)
        sys.exit(1)
