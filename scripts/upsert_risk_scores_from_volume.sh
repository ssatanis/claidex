#!/usr/bin/env bash
# Download the merged risk scores parquet from the Modal volume and upsert into
# local Postgres. Use after running merge-only with a localhost Postgres URL.
#
# Prerequisites:
#   - Merge already completed (merge_only or full pipeline)
#   - Local Postgres running; POSTGRES_URL in .env or environment
#
# Run from repo root:
#   ./scripts/upsert_risk_scores_from_volume.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Load only POSTGRES_URL from .env (safe parse)
if [[ -f "$ROOT/.env" ]] && [[ -z "${POSTGRES_URL:-}" ]]; then
  while IFS= read -r line; do
    [[ $line =~ ^POSTGRES_URL= ]] && export POSTGRES_URL="${line#POSTGRES_URL=}"
  done < "$ROOT/.env"
fi

mkdir -p results
if [[ ! -f "$ROOT/results/final.parquet" ]]; then
  echo "Downloading merged parquet from Modal volume..."
  modal volume get claidex-data claidex_results_final.parquet "$ROOT/results/final.parquet"
else
  echo "Using existing results/final.parquet (delete to re-download)."
fi

python3 "$ROOT/scripts/upsert_risk_scores_from_parquet.py" "$ROOT/results/final.parquet"
