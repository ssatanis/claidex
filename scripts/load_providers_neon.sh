#!/usr/bin/env bash
# Load providers table from ETL Parquet into Neon.
# Uses NEON_PROVIDERS_URL from .env. Run from repo root.
set -e
cd "$(dirname "$0")/.."
if [[ ! -f .env ]]; then
  echo "Missing .env. Copy .env.example and set NEON_PROVIDERS_URL (or POSTGRES_URL)."
  exit 1
fi
source .env 2>/dev/null || true
export POSTGRES_URL="${POSTGRES_URL:-$NEON_PROVIDERS_URL}"
if [[ -z "$POSTGRES_URL" ]]; then
  echo "Set NEON_PROVIDERS_URL or POSTGRES_URL in .env"
  exit 1
fi
echo "Loading providers into Neon (POSTGRES_URL from .env)..."
python -m etl.load.postgres_loader providers
