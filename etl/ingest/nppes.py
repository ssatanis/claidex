"""
NPPES NPI registry download.
Saves to data/raw/ (path configurable via env).
"""
import os
import requests
from pathlib import Path

RAW_DIR = Path(os.environ.get("DATA_RAW", "data/raw"))
NPPES_URL = "https://download.cms.gov/nppes/NPPES_Data_Dissemination_January_2025.zip"


def download_nppes(out_dir: Path | None = None) -> Path:
    out_dir = out_dir or RAW_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "nppes_data.zip"
    r = requests.get(NPPES_URL, stream=True)
    r.raise_for_status()
    with open(out_path, "wb") as f:
        for chunk in r.iter_content(chunk_size=2**20):
            f.write(chunk)
    return out_path


if __name__ == "__main__":
    download_nppes()
