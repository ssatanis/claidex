"""
NPPES ingest: reads the full NPI dissemination CSV and produces
data/processed/providers/providers_canonical.parquet
data/processed/providers/providers_nppes_orgs.parquet

Source: data/raw/nppes/YYYY-MM/NPPES_Data_Dissemination_*_V2/npidata_pfile_*.csv
The February 2026 full file is used as canonical; weekly deltas go in the same
folder if present (handled by the merge in providers_transform.py).
"""
import os
from pathlib import Path
import polars as pl
from dotenv import load_dotenv

load_dotenv()

# Resolve paths from repo root so script works from repo root or etl/
_REPO_ROOT = Path(__file__).resolve().parents[2]
_raw_default = _REPO_ROOT / "data" / "raw"
_processed_default = _REPO_ROOT / "data" / "processed"
_raw = os.environ.get("DATA_RAW", str(_raw_default))
_processed = os.environ.get("DATA_PROCESSED", str(_processed_default))
RAW_DIR = Path(_raw) if Path(_raw).is_absolute() else _REPO_ROOT / _raw
OUT_DIR = (Path(_processed) if Path(_processed).is_absolute() else _REPO_ROOT / _processed) / "providers"

# Column map: raw NPPES name → our name
NPI_COL_MAP = {
    "NPI": "npi",
    "Entity Type Code": "entity_type_code",
    "Provider Organization Name (Legal Business Name)": "org_name",
    "Provider Last Name (Legal Name)": "last_name",
    "Provider First Name": "first_name",
    "Provider Middle Name": "middle_name",
    "Provider Credential Text": "credential",
    "Provider Business Practice Location Address First Line": "address_line1",
    "Provider Business Practice Location Address City Name": "city",
    "Provider Business Practice Location Address State Name": "state",
    "Provider Business Practice Location Address Postal Code": "zip",
    "Healthcare Provider Taxonomy Code_1": "taxonomy_1",
    "Provider License Number_1": "license_1",
    "Provider License Number State Code_1": "license_state_1",
    "NPI Deactivation Reason Code": "deactivation_reason",
    "NPI Reactivation Date": "reactivation_date",
    "Provider Gender Code": "gender",
    "Authorized Official Last Name": "auth_official_last_name",
    "Authorized Official First Name": "auth_official_first_name",
    "Authorized Official Title or Position": "auth_official_title",
    "Authorized Official Telephone Number": "auth_official_phone",
}

ORG_COLS = [
    "npi", "entity_type_code", "org_name",
    "auth_official_last_name", "auth_official_first_name", "auth_official_title",
    "auth_official_phone", "address_line1", "city", "state", "zip",
    "taxonomy_1", "license_1", "license_state_1",
]


def _resolve_npi_file(raw_dir: Path) -> Path:
    """
    Find the latest full dissemination file.
    Prefers YYYY-MM/NPPES_Data_Dissemination_*_V2/npidata_pfile_*.csv (any month).
    Skips fileheader-only variants.
    """
    # raw_dir is already .../data/raw/nppes
    patterns = [
        "*/NPPES_Data_Dissemination_*_V2/npidata_pfile_*.csv",
        "**/NPPES_Data_Dissemination_*_V2/npidata_pfile_*.csv",
    ]
    all_matches: list[Path] = []
    for pattern in patterns:
        try:
            matches = sorted(raw_dir.glob(pattern))
        except Exception:
            matches = []
        matches = [f for f in matches if f.is_file() and "fileheader" not in f.name.lower()]
        all_matches.extend(matches)
    if all_matches:
        # Dedupe and take latest by path (later month/dir wins)
        return sorted(set(all_matches))[-1]
    raise FileNotFoundError(
        f"No NPPES full dissemination CSV found under {raw_dir}\n"
        f"  Expected: <raw>/nppes/YYYY-MM/NPPES_Data_Dissemination_*_V2/npidata_pfile_*.csv"
    )


def ingest(raw_dir: Path | None = None, out_dir: Path | None = None) -> None:
    raw_dir = raw_dir or RAW_DIR
    out_dir = out_dir or OUT_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    # NPPES raw data lives under raw_dir/nppes (e.g. data/raw/nppes/2026-02/...)
    nppes_raw = raw_dir / "nppes" if raw_dir.name != "nppes" else raw_dir
    npi_path = _resolve_npi_file(nppes_raw)
    print(f"[nppes] Reading {npi_path} …")

    # read only the columns we care about; NPPES has 330 columns so we save a lot
    available = pl.read_csv(npi_path, n_rows=0).columns
    wanted = [c for c in NPI_COL_MAP if c in available]
    rename = {c: NPI_COL_MAP[c] for c in wanted}

    df = (
        pl.scan_csv(npi_path, infer_schema_length=0)
        .select(wanted)
        .rename(rename)
        .with_columns(
            pl.col("npi").str.strip_chars(),
            pl.col("zip").str.slice(0, 5).alias("zip"),
            pl.col("entity_type_code").cast(pl.Int8, strict=False),
        )
        .collect(engine="streaming")
    )

    print(f"[nppes] {len(df):,} rows loaded")

    # canonical (all individual + org providers)
    df.write_parquet(out_dir / "providers_canonical.parquet", compression="zstd")
    print(f"[nppes] → {out_dir}/providers_canonical.parquet")

    # org-only with authorized officials
    org_available = [c for c in ORG_COLS if c in df.columns]
    orgs = df.filter(pl.col("entity_type_code") == 2).select(org_available)
    orgs.write_parquet(out_dir / "providers_nppes_orgs.parquet", compression="zstd")
    print(f"[nppes] → {out_dir}/providers_nppes_orgs.parquet  ({len(orgs):,} org rows)")


if __name__ == "__main__":
    ingest()
