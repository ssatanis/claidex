#!/usr/bin/env python3
"""
Upsert provider risk scores from a merged parquet file into local Postgres.

Use after running merge-only with a localhost Postgres URL (Modal skips cloud
upsert). Reads parquet and runs the same upsert as the Modal merge step.

Usage:
  # From repo root; POSTGRES_URL in .env or environment
  python scripts/upsert_risk_scores_from_parquet.py [path/to/final.parquet]

  Default path: results/final.parquet
"""
from __future__ import annotations

import json
import math
import os
import re
import sys
from pathlib import Path

# Repo root
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def _is_nan(obj):
    """True if obj is a float NaN (including numpy/pandas scalar)."""
    if obj is None:
        return False
    if isinstance(obj, float):
        return math.isnan(obj)
    try:
        return math.isnan(float(obj))
    except (TypeError, ValueError):
        pass
    try:
        import numpy as np
        if hasattr(obj, "dtype") and hasattr(obj, "item"):
            return math.isnan(float(obj.item()))
    except (ImportError, TypeError, ValueError):
        pass
    return False


def _sanitize_nan(obj):
    """Replace float('nan') and numpy-style NaN with None so JSON/JSONB is valid in Postgres."""
    if isinstance(obj, dict):
        return {k: _sanitize_nan(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize_nan(v) for v in obj]
    if isinstance(obj, str) and obj.strip().startswith(("{", "[")):
        try:
            # Parquet/JSON may contain literal NaN; replace with null before parsing
            fixed = re.sub(r":\s*NaN\b", ": null", obj, flags=re.IGNORECASE)
            fixed = re.sub(r":\s*-?Infinity\b", ": null", fixed, flags=re.IGNORECASE)
            parsed = json.loads(fixed)
            return _sanitize_nan(parsed)
        except (json.JSONDecodeError, TypeError):
            return obj
    if _is_nan(obj):
        return None
    # Convert numpy/pandas scalars to Python types so psycopg2 never sees NaN
    try:
        if hasattr(obj, "item") and hasattr(obj, "dtype"):
            v = obj.item()
            if isinstance(v, float) and math.isnan(v):
                return None
            return v
    except (TypeError, ValueError, AttributeError):
        pass
    try:
        if type(obj).__name__ in ("float64", "float32", "Float64", "Float32"):
            v = float(obj)
            return None if math.isnan(v) else v
    except (TypeError, ValueError):
        pass
    return obj


def main() -> None:
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")

    postgres_url = (
        os.environ.get("TARGET_POSTGRES_URL")
        or os.environ.get("POSTGRES_URL")
        or os.environ.get("NEON_PROVIDERS_URL")
    )
    if not postgres_url:
        print("Set TARGET_POSTGRES_URL, POSTGRES_URL, or NEON_PROVIDERS_URL in .env or environment.", file=sys.stderr)
        sys.exit(1)

    parquet_path = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "results" / "final.parquet"
    if not parquet_path.is_absolute():
        parquet_path = ROOT / parquet_path
    if not parquet_path.exists():
        print(f"Parquet not found: {parquet_path}", file=sys.stderr)
        print("Download first: mkdir -p results && modal volume get claidex-data claidex_results_final.parquet ./results/final.parquet", file=sys.stderr)
        sys.exit(1)

    import psycopg2
    import psycopg2.extras
    import polars as pl
    from datetime import datetime, timezone

    print(f"Reading {parquet_path}...")
    df = pl.read_parquet(parquet_path)
    print(f"Rows: {len(df):,}")

    upsert_sql = """
        INSERT INTO provider_risk_scores (
            npi, risk_score, risk_label, r_raw,
            billing_outlier_score, billing_outlier_percentile,
            ownership_chain_risk,
            payment_trajectory_score, payment_trajectory_zscore,
            exclusion_proximity_score, program_concentration_score,
            peer_taxonomy, peer_state, peer_count,
            data_window_years, flags, components, updated_at
        ) VALUES (
            %(npi)s, %(risk_score)s, %(risk_label)s, %(r_raw)s,
            %(billing_outlier_score)s, %(billing_outlier_percentile)s,
            %(ownership_chain_risk)s,
            %(payment_trajectory_score)s, %(payment_trajectory_zscore)s,
            %(exclusion_proximity_score)s, %(program_concentration_score)s,
            %(peer_taxonomy)s, %(peer_state)s, %(peer_count)s,
            %(data_window_years)s, %(flags)s, %(components)s, %(updated_at)s
        )
        ON CONFLICT (npi) DO UPDATE SET
            risk_score                  = EXCLUDED.risk_score,
            risk_label                  = EXCLUDED.risk_label,
            r_raw                       = EXCLUDED.r_raw,
            billing_outlier_score       = EXCLUDED.billing_outlier_score,
            billing_outlier_percentile  = EXCLUDED.billing_outlier_percentile,
            ownership_chain_risk        = EXCLUDED.ownership_chain_risk,
            payment_trajectory_score    = EXCLUDED.payment_trajectory_score,
            payment_trajectory_zscore   = EXCLUDED.payment_trajectory_zscore,
            exclusion_proximity_score   = EXCLUDED.exclusion_proximity_score,
            program_concentration_score = EXCLUDED.program_concentration_score,
            peer_taxonomy               = EXCLUDED.peer_taxonomy,
            peer_state                  = EXCLUDED.peer_state,
            peer_count                  = EXCLUDED.peer_count,
            data_window_years           = EXCLUDED.data_window_years,
            flags                       = EXCLUDED.flags,
            components                  = EXCLUDED.components,
            updated_at                  = EXCLUDED.updated_at
    """

    rows = df.to_dicts()
    now = datetime.now(timezone.utc).isoformat()
    for r in rows:
        # Replace NaN with None so Postgres JSONB and numeric columns accept the row
        r.update(_sanitize_nan(r))
        val = r.get("data_window_years")
        if val is not None and isinstance(val, (list, tuple)):
            r["data_window_years"] = [int(x) if x is not None else 0 for x in val]
        else:
            r["data_window_years"] = []
        if r.get("updated_at") is None:
            r["updated_at"] = now
        # Wrap dict/list for JSONB so psycopg2 can adapt them
        for col in ("flags", "components"):
            if col in r and r[col] is not None and isinstance(r[col], (dict, list)):
                r[col] = psycopg2.extras.Json(r[col])

    print("Upserting to Postgres provider_risk_scores...")
    conn = psycopg2.connect(
        postgres_url,
        sslmode="require" if "neon.tech" in postgres_url else "prefer",
    )
    with conn.cursor() as cur:
        psycopg2.extras.execute_batch(cur, upsert_sql, rows, page_size=500)
    conn.commit()
    conn.close()
    print("Done.")


if __name__ == "__main__":
    main()
