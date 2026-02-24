#!/usr/bin/env bash
# Initialize Postgres database schemas
# Usage:
#   ./scripts/init-postgres-schemas.sh                    # use POSTGRES_URL or NEON_* from .env
#   ./scripts/init-postgres-schemas.sh "$NEON_EXCLUSIONS_URL"   # apply to a specific URL

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "========================================="
echo "  Postgres Schema Initialization"
echo "========================================="
echo ""

# 1. Check .env exists and load it (unless only applying to a passed URL)
if [ ! -f .env ]; then
  echo "✗ ERROR: .env file not found"
  exit 1
fi

source .env

# 2. Set Postgres connection: optional first argument overrides (for syncing multiple Neon DBs)
if [ -n "${1:-}" ]; then
  PG_CONN="$1"
  echo "Connecting using URL from argument (e.g. NEON_*_URL)"
elif [ -n "${POSTGRES_URL:-}" ]; then
  PG_CONN="$POSTGRES_URL"
  echo "Connecting using POSTGRES_URL (host port 5433 if using Docker)"
else
  PGHOST=${POSTGRES_HOST:-localhost}
  PGPORT=${POSTGRES_PORT:-5432}
  PGDATABASE=${POSTGRES_DB:-claidex}
  PGUSER=${POSTGRES_USER:-claidex}
  export PGPASSWORD=${POSTGRES_PASSWORD:-}
  if [ -z "${PGPASSWORD:-}" ]; then
    echo "✗ ERROR: POSTGRES_PASSWORD or POSTGRES_URL must be set in .env"
    exit 1
  fi
  PG_CONN="postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT}/${PGDATABASE}"
  echo "Connecting to: postgresql://${PGUSER}@${PGHOST}:${PGPORT}/${PGDATABASE}"
fi
echo ""

# 3. Test connection
echo "Testing database connection..."
if ! psql "$PG_CONN" -c "SELECT 1;" &> /dev/null; then
  echo "✗ ERROR: Cannot connect to Postgres"
  echo ""
  echo "If using Docker, start Postgres and use port 5433 in .env:"
  echo "  ./scripts/docker-up.sh postgres"
  echo "  POSTGRES_URL=postgres://claidex:YOUR_PASSWORD@localhost:5433/claidex"
  exit 1
fi
echo "✓ Connection successful"
echo ""

# 4. Apply schema files in dependency order (base tables → views → tables that reference users/orgs)
SCHEMA_ORDER=(
  chow.sql entities.sql exclusions.sql fec_committees.sql fec_contributions.sql
  hcris.sql medicare_inpatient.sql medicare_part_d.sql order_referring.sql
  ownership_snf.sql payments.sql providers.sql
  users.sql organizations.sql
  payments_combined_v.sql risk_scores.sql
  api_keys.sql organization_members.sql user_notification_preferences.sql user_security_log.sql
  watchlist.sql watchlists.sql
)

echo "Applying database schemas..."
SCHEMA_COUNT=0
for name in "${SCHEMA_ORDER[@]}"; do
  schema="etl/schemas/$name"
  if [ -f "$schema" ]; then
    echo "  - $name"
    if psql "$PG_CONN" -f "$schema" -q; then
      SCHEMA_COUNT=$((SCHEMA_COUNT + 1))
    else
      echo "    ⚠ WARNING: Error applying $name"
    fi
  fi
done
for schema in etl/schemas/migrations/*.sql; do
  if [ -f "$schema" ]; then
    echo "  - migrations/$(basename "$schema")"
    if psql "$PG_CONN" -f "$schema" -q; then
      SCHEMA_COUNT=$((SCHEMA_COUNT + 1))
    else
      echo "    ⚠ WARNING: Error applying migrations/$(basename "$schema")"
    fi
  fi
done

echo ""
if [ $SCHEMA_COUNT -gt 0 ]; then
  echo "✓ Applied $SCHEMA_COUNT schema files successfully"
else
  echo "⚠ WARNING: No schema files found or applied"
fi

echo ""
echo "========================================="
echo "  ✓ Schema Initialization Complete"
echo "========================================="
echo ""
echo "Next steps:"
echo "  - Load data: ./scripts/run_pipeline.sh load_postgres"
echo "  - Verify: ./scripts/verify.sh"
echo ""
