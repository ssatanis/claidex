#!/usr/bin/env bash
# Comprehensive system verification for Claidex
# Usage: ./scripts/verify.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "========================================="
echo "  Claidex System Verification"
echo "========================================="
echo ""

ERRORS=0

# 1. Check Docker services (infra compose)
COMPOSE_FILE="infra/docker-compose.yml"
echo "1. Docker Services Status:"
echo ""
if docker compose -f "$COMPOSE_FILE" ps --format "table {{.Service}}\t{{.Status}}" 2>/dev/null; then
  echo ""
else
  echo "   ✗ ERROR: Docker Compose not running or not configured"
  ERRORS=$((ERRORS + 1))
fi

# 2. Check Neo4j
echo "2. Neo4j Status:"
if docker compose -f "$COMPOSE_FILE" exec -T neo4j wget -q --spider http://localhost:7474 2>/dev/null; then
  echo "   ✓ Neo4j is running and accessible"

  # Try to connect via Python if available
  if command -v python &> /dev/null && [ -f scripts/check_neo4j_basic.py ]; then
    echo "   Checking Neo4j data..."
    if python scripts/check_neo4j_basic.py 2>&1 | grep -q "Provider nodes"; then
      echo "   ✓ Neo4j data loaded"
    else
      echo "   ⚠ WARNING: Neo4j is running but data may not be loaded"
      echo "     Run: ./scripts/run_pipeline.sh load_neo4j"
    fi
  fi
else
  echo "   ✗ ERROR: Neo4j is not accessible"
  echo "     Start with: ./scripts/up.sh or docker compose -f $COMPOSE_FILE --env-file .env up -d neo4j"
  ERRORS=$((ERRORS + 1))
fi
echo ""

# 3. Check Postgres
echo "3. Postgres Status:"
if docker compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U claidex -d claidex &> /dev/null; then
  echo "   ✓ Postgres is running and ready"

  # Check if providers table exists and has data
  source .env 2>/dev/null || true
  if [ -n "${POSTGRES_PASSWORD:-}" ]; then
    PROVIDER_COUNT=$(docker compose -f "$COMPOSE_FILE" exec -T postgres psql -U claidex -d claidex -t -c "SELECT COUNT(*) FROM providers;" 2>/dev/null | tr -d ' ' || echo "0")
    if [ "$PROVIDER_COUNT" != "0" ] && [ -n "$PROVIDER_COUNT" ]; then
      echo "   ✓ Providers table has $PROVIDER_COUNT records"
    else
      echo "   ⚠ WARNING: Providers table is empty or doesn't exist"
      echo "     Initialize schemas: ./scripts/init-postgres-schemas.sh"
      echo "     Load data: ./scripts/run_pipeline.sh load_postgres"
    fi
  fi
else
  echo "   ✗ ERROR: Postgres is not ready"
  echo "     Start with: ./scripts/up.sh or docker compose -f $COMPOSE_FILE --env-file .env up -d postgres"
  ERRORS=$((ERRORS + 1))
fi
echo ""

# 4. Check Redis
echo "4. Redis Status:"
if docker compose -f "$COMPOSE_FILE" exec -T redis redis-cli ping &> /dev/null; then
  echo "   ✓ Redis is running"
else
  echo "   ⚠ WARNING: Redis is not responding"
  echo "     Start with: docker compose -f $COMPOSE_FILE --env-file .env up -d redis"
fi
echo ""

# 5. Check API
echo "5. API Status:"
if curl -f -s http://localhost:4001/health &> /dev/null; then
  echo "   ✓ API is running and healthy"
  API_RESPONSE=$(curl -s http://localhost:4001/health)
  echo "     Response: $API_RESPONSE"
else
  echo "   ⚠ WARNING: API is not responding on port 4001"
  echo "     Start with: cd api && npm install && npm run dev"
fi
echo ""

# 6. Check data directories
echo "6. Data Directories:"
if [ -d data/raw ] && [ -d data/processed ] && [ -d data/exports ]; then
  echo "   ✓ Data directories exist"

  # Check for processed data
  PARQUET_COUNT=$(find data/processed -name "*.parquet" 2>/dev/null | wc -l | tr -d ' ')
  CSV_COUNT=$(find data/exports -name "*.csv" 2>/dev/null | wc -l | tr -d ' ')

  echo "     - Processed files: $PARQUET_COUNT .parquet files"
  echo "     - Export files: $CSV_COUNT .csv files"

  if [ "$PARQUET_COUNT" = "0" ] || [ "$CSV_COUNT" = "0" ]; then
    echo "   ⚠ WARNING: Data directories exist but files may not be processed"
    echo "     Run ETL pipeline: ./scripts/run_pipeline.sh"
  fi
else
  echo "   ⚠ WARNING: Some data directories missing"
  echo "     Create with: ./scripts/setup-data-dirs.sh"
fi
echo ""

# 7. Check Python ETL package
echo "7. ETL Package:"
if python -c "import etl" 2>/dev/null; then
  echo "   ✓ ETL package is installed"
else
  echo "   ⚠ WARNING: ETL package not installed"
  echo "     Install with: pip install -e etl/"
fi
echo ""

# Summary
echo "========================================="
if [ $ERRORS -eq 0 ]; then
  echo "  ✓ Verification Complete - No Critical Errors"
else
  echo "  ⚠ Verification Complete - $ERRORS Error(s) Found"
fi
echo "========================================="
echo ""

if [ $ERRORS -gt 0 ]; then
  echo "Fix the errors above and run verification again."
  exit 1
else
  echo "System is ready! Access your services:"
  echo "  - Neo4j Browser: http://localhost:7475"
  echo "  - API Health: http://localhost:4001/health"
  echo ""
fi
