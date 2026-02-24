#!/usr/bin/env bash
# Apply schemas and load data into all four Neon Postgres databases.
# Ensures providers, exclusions, payments, entities projects all have the same
# tables and (when ETL data exists) the same data. The API uses NEON_PROVIDERS_URL only.
#
# Prerequisites:
#   - .env with NEON_PROVIDERS_URL, NEON_PAYMENTS_URL, NEON_ENTITIES_URL, NEON_EXCLUSIONS_URL set
#   - For data load: parquet files in data/processed/ (run ETL ingest/transform first, or use Modal)
#   - For risk scores: results/final.parquet (from Modal merge or scripts/upsert_risk_scores_from_parquet.py)
#
# Note: Neon free tier has a 512 MB project size limit. Full providers table may exceed it;
# the loader will skip the failing table and continue. See docs/NEON_SYNC.md.
#
# Usage:
#   ./scripts/sync-neon-databases.sh              # schemas + load for all four
#   ./scripts/sync-neon-databases.sh schemas-only  # only apply schemas (no data load)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -f .env ]; then
  echo "✗ ERROR: .env not found. Create from .env.example and set all NEON_*_URL."
  exit 1
fi

source .env

SCHEMAS_ONLY=false
if [ "${1:-}" = "schemas-only" ]; then
  SCHEMAS_ONLY=true
  echo "Mode: schemas only (no data load)"
  echo ""
fi

# All four Neon DBs (API uses NEON_PROVIDERS_URL only; others are mirrors for consistency)
NEON_URLS=(
  "${NEON_PROVIDERS_URL:-}"
  "${NEON_PAYMENTS_URL:-}"
  "${NEON_ENTITIES_URL:-}"
  "${NEON_EXCLUSIONS_URL:-}"
)

NEON_NAMES=(providers payments entities exclusions)

for i in "${!NEON_URLS[@]}"; do
  url="${NEON_URLS[$i]}"
  name="${NEON_NAMES[$i]}"
  if [ -z "$url" ]; then
    echo "⊘ Skipping Neon $name (no NEON_${name^^}_URL in .env)"
    continue
  fi
  echo "========================================="
  echo "  Neon: $name"
  echo "========================================="

  echo "[1/2] Applying schemas..."
  if ! ./scripts/init-postgres-schemas.sh "$url"; then
    echo "✗ Schema init failed for $name"
    exit 1
  fi

  if [ "$SCHEMAS_ONLY" = true ]; then
    echo "✓ Schemas applied for $name (schemas-only mode)"
    echo ""
    continue
  fi

  echo "[2/2] Loading data (postgres_loader)..."
  export TARGET_POSTGRES_URL="$url"
  if python -m etl.load.postgres_loader 2>&1; then
    echo "✓ Data load completed for $name"
  else
    echo "⚠ Data load had skips or errors (missing parquet is normal if ETL not run yet)"
  fi
  unset TARGET_POSTGRES_URL
  echo ""
done

# Risk scores: only NEON_PROVIDERS_URL is used by the API; optionally fill others
if [ "$SCHEMAS_ONLY" = false ] && [ -f "$ROOT/results/final.parquet" ]; then
  echo "========================================="
  echo "  Risk scores (provider_risk_scores)"
  echo "========================================="
  for i in "${!NEON_URLS[@]}"; do
    url="${NEON_URLS[$i]}"
    name="${NEON_NAMES[$i]}"
    if [ -z "$url" ]; then continue; fi
    echo "Upserting risk scores into $name..."
    if TARGET_POSTGRES_URL="$url" python "$ROOT/scripts/upsert_risk_scores_from_parquet.py" "$ROOT/results/final.parquet" 2>&1; then
      echo "✓ Risk scores loaded for $name"
    else
      echo "⚠ Risk score upsert failed for $name (table may be empty)"
    fi
  done
  echo ""
else
  if [ "$SCHEMAS_ONLY" = false ]; then
    echo "Tip: Put results/final.parquet in place and re-run to load provider_risk_scores."
    echo "     e.g. modal volume get claidex-data claidex_results_final.parquet ./results/final.parquet"
    echo ""
  fi
fi

echo "========================================="
echo "  ✓ Sync complete"
echo "========================================="
echo ""
echo "API uses NEON_PROVIDERS_URL only. Other Neon DBs are synced for consistency."
echo "Verify: open each project in Neon Console → Tables and confirm row counts."
