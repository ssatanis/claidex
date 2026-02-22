"""
Medicaid PUF download.
"""
import os
from pathlib import Path

RAW_DIR = Path(os.environ.get("DATA_RAW", "data/raw"))


def download_medicaid_puf(out_dir: Path | None = None) -> Path:
    out_dir = out_dir or RAW_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    # TODO: set real CMS/Medicaid PUF URL and download
    out_path = out_dir / "medicaid_puf.csv"
    out_path.touch()
    return out_path


if __name__ == "__main__":
    download_medicaid_puf()
