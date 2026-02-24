#!/usr/bin/env python3
"""
Run diagnostic queries against Neon Postgres (NEON_PROVIDERS_URL or POSTGRES_URL).
Usage: from repo root, with .env loaded:
  python scripts/neon_diagnostics.py
  POSTGRES_URL="postgresql://..." python scripts/neon_diagnostics.py
"""
import os
import sys
from pathlib import Path

# Load .env from repo root
repo_root = Path(__file__).resolve().parents[1]
env_file = repo_root / ".env"
if env_file.exists():
    from dotenv import load_dotenv
    load_dotenv(env_file)

import psycopg2

def get_conn():
    url = (
        os.environ.get("POSTGRES_URL")
        or os.environ.get("DATABASE_URL")
        or os.environ.get("NEON_PROVIDERS_URL")
    )
    if not url:
        print("Set POSTGRES_URL, DATABASE_URL, or NEON_PROVIDERS_URL in .env or environment.", file=sys.stderr)
        sys.exit(1)
    return psycopg2.connect(url)


def main():
    queries = [
        ("providers", "SELECT COUNT(*) AS count FROM providers"),
        ("provider_risk_scores", "SELECT COUNT(*) AS count FROM provider_risk_scores"),
        ("exclusions", "SELECT COUNT(*) AS count FROM exclusions"),
        ("payments_medicaid", "SELECT COUNT(*) AS count FROM payments_medicaid"),
        ("medicare_part_d", "SELECT COUNT(*) AS count FROM medicare_part_d"),
    ]
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            print("--- Neon Postgres diagnostics ---")
            for name, sql in queries:
                try:
                    cur.execute(sql)
                    row = cur.fetchone()
                    count = row[0] if row else 0
                    print(f"  {name}: {count:,}")
                except Exception as e:
                    print(f"  {name}: ERROR - {e}")
            # Join coverage: providers ⋈ provider_risk_scores
            try:
                cur.execute("""
                    SELECT COUNT(*) AS count
                    FROM providers p
                    JOIN provider_risk_scores prs ON p.npi = prs.npi
                """)
                row = cur.fetchone()
                join_count = row[0] if row else 0
                print(f"  providers ⋈ provider_risk_scores: {join_count:,}")
            except Exception as e:
                print(f"  providers ⋈ provider_risk_scores: ERROR - {e}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
