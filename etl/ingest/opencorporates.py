"""
OpenCorporates (or similar) entity data.
"""
import os
from pathlib import Path

RAW_DIR = Path(os.environ.get("DATA_RAW", "data/raw"))


def download_opencorporates(out_dir: Path | None = None) -> Path:
    out_dir = out_dir or RAW_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    # TODO: API or bulk download for entity data
    out_path = out_dir / "opencorporates_entities.csv"
    out_path.touch()
    return out_path


if __name__ == "__main__":
    download_opencorporates()
