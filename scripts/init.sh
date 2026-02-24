#!/usr/bin/env bash
# Complete first-time setup for Claidex
# Usage: ./scripts/init.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "========================================="
echo "  Claidex Initialization"
echo "========================================="
echo ""

# 1. Check .env exists
echo "1. Checking environment configuration..."
if [ ! -f .env ]; then
  echo "   ✗ ERROR: .env file not found"
  echo ""
  echo "   Please create .env file:"
  echo "     cp .env.example .env"
  echo ""
  echo "   Then set required passwords:"
  echo "     NEO4J_PASSWORD=your-neo4j-password"
  echo "     POSTGRES_PASSWORD=your-postgres-password"
  exit 1
fi

# 2. Verify required env vars
source .env
if [ -z "${NEO4J_PASSWORD:-}" ]; then
  echo "   ✗ ERROR: NEO4J_PASSWORD must be set in .env"
  exit 1
fi

if [ -z "${POSTGRES_PASSWORD:-}" ]; then
  echo "   ✗ ERROR: POSTGRES_PASSWORD must be set in .env"
  exit 1
fi

echo "   ✓ Environment variables configured"
echo ""

# 3. Create data directories
echo "2. Setting up data directories..."
if [ -f scripts/setup-data-dirs.sh ]; then
  ./scripts/setup-data-dirs.sh
else
  # Create directories if script doesn't exist
  mkdir -p data/raw data/processed data/exports data/neo4j data/postgres
  echo "   ✓ Data directories created"
fi
echo ""

# 4. Install Python ETL dependencies
echo "3. Installing Python ETL dependencies..."
if command -v pip &> /dev/null; then
  pip install -e etl/ --quiet || pip install -e etl/
  echo "   ✓ ETL package installed"
else
  echo "   ⚠ WARNING: pip not found, skipping ETL package installation"
  echo "   Install manually: pip install -e etl/"
fi
echo ""

# 5. Start infrastructure (use infra compose so api/ is the backend)
echo "4. Starting Docker services..."
echo "   Starting postgres and redis..."
docker compose -f infra/docker-compose.yml --env-file .env up -d postgres redis

echo "   Starting neo4j..."
docker compose -f infra/docker-compose.yml --env-file .env up -d neo4j

# Wait for services
echo "   Waiting for databases to be ready (30s)..."
sleep 10

# Check postgres
for i in {1..10}; do
  if docker compose -f infra/docker-compose.yml exec -T postgres pg_isready -U claidex -d claidex &> /dev/null; then
    echo "   ✓ Postgres is ready"
    break
  fi
  if [ $i -eq 10 ]; then
    echo "   ⚠ WARNING: Postgres may not be ready yet"
  fi
  sleep 2
done

# Check neo4j
for i in {1..10}; do
  if docker compose -f infra/docker-compose.yml exec -T neo4j wget -q --spider http://localhost:7474 &> /dev/null; then
    echo "   ✓ Neo4j is ready"
    break
  fi
  if [ $i -eq 10 ]; then
    echo "   ⚠ WARNING: Neo4j may not be ready yet"
  fi
  sleep 2
done

echo ""
echo "========================================="
echo "  ✓ Infrastructure is ready!"
echo "========================================="
echo ""
echo "Next steps:"
echo ""
echo "  1. Initialize database schemas:"
echo "     ./scripts/init-postgres-schemas.sh"
echo ""
echo "  2. Run ETL pipeline (if you have data):"
echo "     ./scripts/run_pipeline.sh ingest_nppes ingest_leie ingest_snf"
echo "     ./scripts/run_pipeline.sh transform_providers transform_exclusions"
echo "     ./scripts/run_pipeline.sh load_postgres load_neo4j"
echo ""
echo "  3. Verify setup:"
echo "     ./scripts/verify.sh"
echo ""
echo "  4. Start API (in separate terminal):"
echo "     cd api && npm install && npm run dev"
echo ""
echo "  5. Start frontend (in separate terminal):"
echo "     cd frontend && npm install && npm run dev"
echo ""
echo "  6. Access services:"
echo "     - Neo4j Browser: http://localhost:7475"
echo "     - API: http://localhost:4001/health"
echo "     - Frontend: http://localhost:3000"
echo ""
