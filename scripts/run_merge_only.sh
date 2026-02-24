#!/usr/bin/env bash
# Run only the merge step: concatenate all batch chunks on the Modal volume,
# perform global calibration, and optionally upsert to Postgres.
#
# Use this when batch processing already completed and chunks are on the volume
# (e.g. after a previous run that timed out during merge, or for re-merging).
#
# Run from repo root:
#   ./scripts/run_merge_only.sh
#
# With explicit Postgres URL:
#   ./scripts/run_merge_only.sh "postgresql://user:pass@host:5432/db"
#
# Merge only, no DB upsert:
#   ./scripts/run_merge_only.sh --no-upsert
#
# If Postgres URL is localhost, Modal skips cloud upsert (it cannot reach your machine).
# Then run: ./scripts/upsert_risk_scores_from_volume.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Load only POSTGRES_URL / NEON_PROVIDERS_URL from .env (avoids "instance: command not found" from lines with spaces)
if [[ -z "${1:-}" || "${1:-}" != "--no-upsert" ]]; then
  if [[ -f "$ROOT/.env" ]] && [[ -z "${POSTGRES_URL:-}" ]] && [[ -z "${NEON_PROVIDERS_URL:-}" ]]; then
    while IFS= read -r line; do
      [[ $line =~ ^POSTGRES_URL= ]] && export POSTGRES_URL="${line#POSTGRES_URL=}"
      [[ $line =~ ^NEON_PROVIDERS_URL= ]] && export NEON_PROVIDERS_URL="${line#NEON_PROVIDERS_URL=}"
    done < "$ROOT/.env"
  fi
fi

if [[ "${1:-}" == "--no-upsert" ]]; then
  modal run etl/compute/claidex_modal.py --merge-only --no-upsert-to-db
else
  URL="${1:-${POSTGRES_URL:-${NEON_PROVIDERS_URL:-}}}"
  modal run etl/compute/claidex_modal.py --merge-only \
    --postgres-url "$URL" \
    --upsert-to-db
fi
