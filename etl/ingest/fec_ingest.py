"""
FEC individual contributions ingest.

Sources (data/raw/fec/):
  indiv_header_file.csv   — column names for the pipe-delimited individual files
  indiv24.zip             — itcont.txt (all individual contributions, 2024 cycle)
  cm24.zip                — cm.txt (committee master, 2024 cycle)

Outputs (data/processed/fec/):
  fec_contributions.parquet
  fec_committees.parquet

Usage:
  python etl/ingest/fec_ingest.py            # default: 2024 cycle
  python etl/ingest/fec_ingest.py 2022       # specify cycle year
"""
import io
import os
import re
import sys
import zipfile
from pathlib import Path

import polars as pl
from dotenv import load_dotenv

load_dotenv()

RAW_DIR = Path(os.environ.get("DATA_RAW", "data/raw")) / "fec"
OUT_DIR = Path(os.environ.get("DATA_PROCESSED", "data/processed")) / "fec"

# FEC indiv file column names (from indiv_header_file.csv)
INDIV_COLS = [
    "CMTE_ID", "AMNDT_IND", "RPT_TP", "TRANSACTION_PGI", "IMAGE_NUM",
    "TRANSACTION_TP", "ENTITY_TP", "NAME", "CITY", "STATE", "ZIP_CODE",
    "EMPLOYER", "OCCUPATION", "TRANSACTION_DT", "TRANSACTION_AMT",
    "OTHER_ID", "TRAN_ID", "FILE_NUM", "MEMO_CD", "MEMO_TEXT", "SUB_ID",
]

# FEC committee master column names (standard FEC spec, no header in file)
CM_COLS = [
    "CMTE_ID", "CMTE_NM", "TRES_NM", "CMTE_ST1", "CMTE_ST2",
    "CMTE_CITY", "CMTE_ST", "CMTE_ZIP5", "CMTE_DSGN", "CMTE_TP",
    "CMTE_PTY_AFFILIATION", "CMTE_FILING_FREQ", "ORG_TP",
    "CONNECTED_ORG_NM", "CAND_ID",
]

_PUNCT_RE = re.compile(r"[^A-Z0-9 ]")


def _normalize(expr: pl.Expr) -> pl.Expr:
    """Uppercase → strip punctuation → compress whitespace."""
    return (
        expr.str.to_uppercase()
        .str.replace_all(_PUNCT_RE.pattern, " ")
        .str.replace_all(r" {2,}", " ")
        .str.strip_chars()
    )


def _read_zip_member(zip_path: Path, member: str) -> bytes:
    """Read a single member from a zip into memory as bytes."""
    with zipfile.ZipFile(zip_path) as zf:
        with zf.open(member) as f:
            return f.read()


def ingest_contributions(cycle: int = 2024) -> pl.DataFrame:
    """
    Stream-parse indiv{YY}.zip → normalised contributions DataFrame.
    Only individual (ENTITY_TP = 'IND') contributions are kept.
    """
    zip_path = RAW_DIR / f"indiv{str(cycle)[-2:]}.zip"
    if not zip_path.exists():
        raise FileNotFoundError(f"FEC contributions zip not found: {zip_path}")

    # FEC files are large; read the main itcont.txt member
    with zipfile.ZipFile(zip_path) as zf:
        members = zf.namelist()
        # Prefer the top-level itcont.txt over the by_date partitions
        main_member = next((m for m in members if "/" not in m), members[0])
        print(f"[fec] Reading {zip_path.name}:{main_member}")
        raw_bytes = zf.open(main_member).read()

    df = pl.read_csv(
        io.BytesIO(raw_bytes),
        separator="|",
        has_header=False,
        new_columns=INDIV_COLS,
        infer_schema_length=0,          # all str; we cast manually
        null_values=["", " "],
        truncate_ragged_lines=True,
        encoding="utf8-lossy",
    )

    # Keep only individual contributors (not PAC-level)
    df = df.filter(pl.col("ENTITY_TP").fill_null("IND") == "IND")

    # Cast amount; drop rows with unparseable amounts
    df = df.with_columns(
        pl.col("TRANSACTION_AMT")
        .str.strip_chars()
        .cast(pl.Float64, strict=False)
        .alias("amount")
    ).filter(pl.col("amount").is_not_null() & (pl.col("amount") > 0))

    # Parse date: MMDDYYYY → date
    df = df.with_columns(
        pl.col("TRANSACTION_DT")
        .str.strip_chars()
        .str.to_date("%m%d%Y", strict=False)
        .alias("transaction_date")
    )

    # Raw contributor name (original casing preserved)
    df = df.with_columns(
        pl.col("NAME").str.strip_chars().alias("contributor_name"),
        pl.col("STATE").str.strip_chars().str.to_uppercase().alias("state"),
        pl.col("CITY").str.strip_chars().alias("city"),
        pl.col("EMPLOYER").str.strip_chars().alias("employer"),
        pl.col("OCCUPATION").str.strip_chars().alias("occupation"),
        pl.col("CMTE_ID").str.strip_chars().alias("committee_id"),
        pl.lit(cycle).cast(pl.Int16).alias("cycle"),
    )

    # Normalized name (uppercase, no punctuation)
    df = df.with_columns(
        _normalize(pl.col("contributor_name")).alias("normalized_name"),
        _normalize(pl.col("employer").fill_null("")).alias("normalized_employer"),
    )

    # Split normalized_name into last / first: "LAST FIRST MI" or "LAST, FIRST MI"
    # FEC NAME format is "LAST, FIRST MI" — split on first comma
    df = df.with_columns(
        pl.col("normalized_name")
        .str.splitn(",", 2)
        .struct.field("field_0")
        .str.strip_chars()
        .alias("normalized_last_name"),
        pl.col("normalized_name")
        .str.splitn(",", 2)
        .struct.field("field_1")
        .str.strip_chars()
        .str.slice(0, 1)                # first initial only
        .alias("first_name_initial"),
    )

    keep = [
        "contributor_name", "normalized_name", "normalized_last_name",
        "first_name_initial", "employer", "normalized_employer",
        "occupation", "city", "state", "amount", "committee_id",
        "transaction_date", "cycle",
    ]
    df = df.select([c for c in keep if c in df.columns])

    print(f"[fec] contributions: {len(df):,} rows after filtering")
    return df


def ingest_committees(cycle: int = 2024) -> pl.DataFrame:
    """Parse cm{YY}.zip → committee master DataFrame."""
    zip_path = RAW_DIR / f"cm{str(cycle)[-2:]}.zip"
    if not zip_path.exists():
        raise FileNotFoundError(f"FEC committee zip not found: {zip_path}")

    with zipfile.ZipFile(zip_path) as zf:
        main_member = zf.namelist()[0]
        print(f"[fec] Reading {zip_path.name}:{main_member}")
        raw_bytes = zf.open(main_member).read()

    # Committee master may have fewer columns than the spec in some cycles —
    # use truncate_ragged_lines and pad with None via schema override.
    df = pl.read_csv(
        io.BytesIO(raw_bytes),
        separator="|",
        has_header=False,
        new_columns=CM_COLS,
        infer_schema_length=0,
        null_values=["", " "],
        truncate_ragged_lines=True,
        encoding="utf8-lossy",
    )

    df = df.select(["CMTE_ID", "CMTE_NM", "CMTE_TP", "CMTE_PTY_AFFILIATION"])
    df = df.rename({
        "CMTE_ID": "committee_id",
        "CMTE_NM": "committee_name",
        "CMTE_TP": "type",
        "CMTE_PTY_AFFILIATION": "party",
    })

    df = df.with_columns(
        pl.col("committee_id").str.strip_chars(),
        pl.col("committee_name").str.strip_chars(),
        pl.col("type").str.strip_chars(),
        pl.col("party").str.strip_chars(),
    )

    # Deduplicate on committee_id (keep last for most recent cycle data)
    df = df.unique(subset=["committee_id"], keep="last")

    print(f"[fec] committees: {len(df):,} rows")
    return df


def ingest(cycle: int = 2024) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    contrib_df = ingest_contributions(cycle)
    contrib_out = OUT_DIR / "fec_contributions.parquet"
    contrib_df.write_parquet(contrib_out, compression="zstd")
    print(f"[fec] → {contrib_out}")

    cmte_df = ingest_committees(cycle)
    cmte_out = OUT_DIR / "fec_committees.parquet"
    cmte_df.write_parquet(cmte_out, compression="zstd")
    print(f"[fec] → {cmte_out}")


if __name__ == "__main__":
    cycle_arg = int(sys.argv[1]) if len(sys.argv) > 1 else 2024
    ingest(cycle_arg)
