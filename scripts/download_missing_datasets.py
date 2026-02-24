#!/usr/bin/env python3
"""
Download missing CMS datasets for Claidex.
Only downloads datasets that are actually missing based on what exists in data/raw/.
"""

import os
import json
import logging
import time
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Base paths
BASE_DIR = Path(__file__).parent.parent
RAW_DATA_DIR = BASE_DIR / "data" / "raw"
SCRIPTS_DIR = BASE_DIR / "scripts"

# Ensure directories exist
RAW_DATA_DIR.mkdir(parents=True, exist_ok=True)
SCRIPTS_DIR.mkdir(parents=True, exist_ok=True)


def create_session() -> requests.Session:
    """Create a requests session with retry logic."""
    session = requests.Session()
    retry_strategy = Retry(
        total=3,
        backoff_factor=2,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET", "HEAD"]
    )
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    session.headers.update({
        'User-Agent': 'Claidex-ETL/1.0 (Healthcare Data Research)'
    })
    return session


def download_file(session: requests.Session, url: str, output_path: Path,
                  dataset_name: str) -> Dict:
    """Download a file with progress logging."""
    result = {
        'url': url,
        'output_path': str(output_path),
        'dataset_name': dataset_name,
        'timestamp': datetime.now().isoformat(),
        'success': False,
        'file_size_mb': 0,
        'row_count': None,
        'error': None
    }

    try:
        logger.info(f"Downloading {dataset_name} from {url}")
        output_path.parent.mkdir(parents=True, exist_ok=True)

        response = session.get(url, stream=True, timeout=300)
        response.raise_for_status()

        total_size = int(response.headers.get('content-length', 0))

        with open(output_path, 'wb') as f:
            downloaded = 0
            chunk_size = 8192
            for chunk in response.iter_content(chunk_size=chunk_size):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total_size > 0 and downloaded % (1024 * 1024) == 0:
                        pct = (downloaded / total_size) * 100
                        logger.info(f"  {dataset_name}: {pct:.1f}% ({downloaded / (1024**2):.1f} MB)")

        file_size = output_path.stat().st_size
        result['file_size_mb'] = round(file_size / (1024**2), 2)

        # Count rows for CSV files
        if output_path.suffix.lower() == '.csv':
            try:
                with open(output_path, 'r', encoding='utf-8', errors='ignore') as f:
                    result['row_count'] = sum(1 for _ in f) - 1  # Exclude header
            except Exception as e:
                logger.warning(f"Could not count rows: {e}")

        result['success'] = True
        logger.info(f"✓ Downloaded {dataset_name}: {result['file_size_mb']} MB, {result['row_count']} rows")

    except Exception as e:
        result['error'] = str(e)
        logger.error(f"✗ Failed to download {dataset_name}: {e}")
        if output_path.exists():
            output_path.unlink()

    return result


def download_cms_datasets():
    """Download all missing CMS datasets."""
    session = create_session()
    manifest = {
        'download_date': datetime.now().isoformat(),
        'datasets': []
    }

    # =========================================================================
    # ACTUAL CMS DOWNLOAD URLs - Extracted from data.cms.gov/data.json
    # =========================================================================

    # 1. Medicare Inpatient Hospitals by Provider (2018-2023)
    logger.info("=" * 80)
    logger.info("MEDICARE INPATIENT HOSPITALS BY PROVIDER (2018-2023)")
    logger.info("=" * 80)

    inpatient_urls = {
        '2018': 'https://data.cms.gov/sites/default/files/2024-05/7bb03a80-a0ed-4fd9-a7c8-c851c70d484b/MUP_INP_RY24_P04_V10_DY18_Prv.CSV',
        '2019': 'https://data.cms.gov/sites/default/files/2024-05/1c1f6004-9fe2-43d0-907c-203322cd40e7/MUP_INP_RY24_P04_V10_DY19_Prv.CSV',
        '2020': 'https://data.cms.gov/sites/default/files/2024-05/c2f4c3df-c7ec-4402-8064-7f7d2586ba56/MUP_INP_RY24_P04_V10_DY20_Prv.CSV',
        '2021': 'https://data.cms.gov/sites/default/files/2024-05/ef80e842-4949-46e8-ab66-0c4c4310d400/MUP_INP_RY24_P04_V10_DY21_Prv.CSV',
        '2022': 'https://data.cms.gov/sites/default/files/2024-05/e95428bb-00a6-46e2-9be2-ffd9c6fe5186/MUP_INP_RY24_P04_V10_DY22_Prv.CSV',
        '2023': 'https://data.cms.gov/sites/default/files/2025-05/10e4b7e9-40c5-437b-b4d6-61801b6681f2/MUP_INP_RY25_P04_V10_DY23_Prv.CSV',
    }

    for year, url in inpatient_urls.items():
        output_dir = RAW_DATA_DIR / "medicare-facility" / "inpatient" / "provider" / year
        output_file = output_dir / f"medicare_inpatient_provider_{year}.csv"

        if output_file.exists():
            logger.info(f"  Skipping {year} - already exists")
            continue

        result = download_file(session, url, output_file, f"Medicare Inpatient {year}")
        manifest['datasets'].append(result)
        time.sleep(2)  # Rate limiting

    # 2. Medicare Part D Prescribers by Provider (2019-2022)
    logger.info("=" * 80)
    logger.info("MEDICARE PART D PRESCRIBERS BY PROVIDER (2019-2022)")
    logger.info("=" * 80)

    partd_urls = {
        '2019': 'https://data.cms.gov/sites/default/files/2025-11/b8653539-dfde-4d76-8303-efdf87207a4c/MUP_DPR_RY25_P04_V20_DY19_NPI.csv',
        '2020': 'https://data.cms.gov/sites/default/files/2025-11/77e12580-bf64-4cae-a0b9-e04468054a2e/MUP_DPR_RY25_P04_V20_DY20_NPI.csv',
        '2021': 'https://data.cms.gov/sites/default/files/2025-11/0ae3731b-2a46-4233-8aa6-51426a478dbc/MUP_DPR_RY25_P04_V20_DY21_NPI.csv',
        '2022': 'https://data.cms.gov/sites/default/files/2025-11/429c776b-63ab-4976-8764-0b7f05db14bd/MUP_DPR_RY25_P04_V20_DY22_NPI.csv',
    }

    for year, url in partd_urls.items():
        output_dir = RAW_DATA_DIR / "medicare-part-d" / year
        output_file = output_dir / f"medicare_part_d_prescribers_{year}.csv"

        if output_file.exists():
            logger.info(f"  Skipping {year} - already exists")
            continue

        result = download_file(session, url, output_file, f"Medicare Part D {year}")
        manifest['datasets'].append(result)
        time.sleep(2)

    # 3. CMS Order and Referring Provider File
    logger.info("=" * 80)
    logger.info("CMS ORDER AND REFERRING PROVIDER FILE")
    logger.info("=" * 80)

    output_dir = RAW_DATA_DIR / "order-referring"
    output_file = output_dir / "order_and_referring_20260219.csv"

    if not output_file.exists():
        url = 'https://data.cms.gov/sites/default/files/2026-02/83ffc959-98cd-4bd2-9f58-9ead31cf9400/OrderReferring_20260219.csv'
        result = download_file(session, url, output_file, "Order and Referring Providers")
        manifest['datasets'].append(result)
        time.sleep(2)
    else:
        logger.info("  Skipping - already exists")

    # Save manifest
    manifest_path = SCRIPTS_DIR / "download_manifest.json"
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)

    logger.info("=" * 80)
    logger.info(f"Download complete! Manifest saved to {manifest_path}")
    logger.info(f"Total datasets processed: {len(manifest['datasets'])}")
    successful = sum(1 for d in manifest['datasets'] if d['success'])
    logger.info(f"Successful downloads: {successful}/{len(manifest['datasets'])}")
    logger.info("=" * 80)

    return manifest


if __name__ == "__main__":
    try:
        manifest = download_cms_datasets()
    except KeyboardInterrupt:
        logger.info("\nDownload interrupted by user")
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
