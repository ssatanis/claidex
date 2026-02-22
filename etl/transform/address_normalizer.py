"""
Address cleaning and normalization (e.g. USPS-style).
"""
import re
from typing import Optional


def normalize_address(line1: str, city: str, state: str, zip_code: str) -> dict[str, Optional[str]]:
    """Return normalized address components."""
    state = (state or "").strip().upper()[:2]
    zip_code = re.sub(r"\D", "", (zip_code or ""))[:10]
    return {
        "line1": (line1 or "").strip() or None,
        "city": (city or "").strip() or None,
        "state": state or None,
        "zip": zip_code or None,
    }
