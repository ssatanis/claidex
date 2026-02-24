#!/usr/bin/env bash
# Full ETL pipeline runner.
# Run from repo root: ./scripts/run_pipeline.sh [step ...]
#
# Steps (run all if none specified):
#   ingest_nppes   ingest_leie   ingest_medicaid   ingest_medicare   ingest_snf
#   transform_providers   transform_payments   transform_ownership   transform_exclusions
#   load_postgres   load_neo4j
#
# Example (run only ingest + transforms, skip load):
#   ./scripts/run_pipeline.sh ingest_nppes ingest_leie transform_providers
#
# Prerequisites:
#   pip install -e etl/           # or: uv pip install -e etl/
#   cp .env.example .env && edit .env
#   ./scripts/up.sh (or docker compose -f infra/docker-compose.yml --env-file .env up -d)
#   Neo4j + Postgres must be running for load steps

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PYTHONPATH="$ROOT"
export DATA_RAW="${DATA_RAW:-$ROOT/data/raw}"
export DATA_PROCESSED="${DATA_PROCESSED:-$ROOT/data/processed}"
export DATA_EXPORTS="${DATA_EXPORTS:-$ROOT/data/exports}"

# Load .env if present
[ -f "$ROOT/.env" ] && set -a && source "$ROOT/.env" && set +a

PYTHON="${PYTHON:-python3}"
ALL_STEPS=(
  ingest_nppes
  ingest_leie
  ingest_medicaid
  ingest_medicare
  ingest_snf
  transform_providers
  transform_payments
  transform_ownership
  transform_exclusions
  load_postgres
  load_neo4j
)

run_step() {
  local step="$1"
  echo ""
  echo "╔══════════════════════════════════════════════════════╗"
  echo "║  Step: $step"
  echo "╚══════════════════════════════════════════════════════╝"
  case "$step" in
    ingest_nppes)
      $PYTHON -m etl.ingest.nppes_ingest ;;
    ingest_leie)
      $PYTHON -m etl.ingest.leie_ingest ;;
    ingest_medicaid)
      $PYTHON -m etl.ingest.medicaid_puf_ingest ;;
    ingest_medicare)
      $PYTHON -m etl.ingest.medicare_physician_ingest ;;
    ingest_snf)
      $PYTHON -m etl.ingest.snf_ownership_ingest ;;
    transform_providers)
      $PYTHON -m etl.transform.providers_transform ;;
    transform_payments)
      $PYTHON -m etl.transform.payments_transform ;;
    transform_ownership)
      $PYTHON -m etl.transform.ownership_transform ;;
    transform_exclusions)
      $PYTHON -m etl.transform.exclusions_transform ;;
    load_postgres)
      $PYTHON -m etl.load.postgres_loader ;;
    load_neo4j)
      $PYTHON -m etl.load.neo4j_loader all ;;
    *)
      echo "Unknown step: $step" >&2
      echo "Valid steps: ${ALL_STEPS[*]}" >&2
      exit 1 ;;
  esac
  echo "✓ $step done"
}

STEPS=("${@:-${ALL_STEPS[@]}}")

START=$(date +%s)
for step in "${STEPS[@]}"; do
  run_step "$step"
done
END=$(date +%s)
echo ""
echo "Pipeline complete in $((END - START))s"
