"""
LEIE (List of Excluded Individuals/Entities) download.
"""
import os
import requests
from pathlib import Path

RAW_DIR = Path(os.environ.get("DATA_RAW", "data/raw"))
LEIE_URL = "https://oig.hhs.gov/exclusions/downloadables/LEIE.csv"


def download_leie(out_dir: Path | None = None) -> Path:
    out_dir = out_dir or RAW_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "leie.csv"
    r = requests.get(LEIE_URL, stream=True)
    r.raise_for_status()
    with open(out_path, "wb") as f:
        for chunk in r.iter_content(chunk_size=2**20):
            f.write(chunk)
    return out_path


if __name__ == "__main__":
    download_leie()
