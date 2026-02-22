"""
SNF (Skilled Nursing Facility) ownership data download.
"""
import os
from pathlib import Path

RAW_DIR = Path(os.environ.get("DATA_RAW", "data/raw"))


def download_snf_ownership(out_dir: Path | None = None) -> Path:
    out_dir = out_dir or RAW_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    # TODO: set real SNF ownership source URL and download
    out_path = out_dir / "snf_ownership.csv"
    out_path.touch()
    return out_path


if __name__ == "__main__":
    download_snf_ownership()
