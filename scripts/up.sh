#!/usr/bin/env bash
# Start all Claidex services (Docker: Neo4j, Postgres, Redis, API). No frontend.
# Run from repo root: ./scripts/up.sh
# Requires .env with NEO4J_PASSWORD and POSTGRES_PASSWORD.

set -e
cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "Missing .env. Copy .env.example and set NEO4J_PASSWORD, POSTGRES_PASSWORD."
  exit 1
fi
# Fail fast if required passwords are missing (avoids Postgres/Neo4j unhealthy)
if ! grep -qE '^POSTGRES_PASSWORD=.+' .env; then
  echo "Set POSTGRES_PASSWORD in .env (non-empty value required for Docker Postgres)."
  exit 1
fi
if ! grep -qE '^NEO4J_PASSWORD=.+' .env; then
  echo "Set NEO4J_PASSWORD in .env (non-empty value required for Docker Neo4j)."
  exit 1
fi

echo "Starting Neo4j, Postgres, Redis, and API..."
if ! docker compose -f infra/docker-compose.yml --env-file .env up -d; then
  echo ""
  echo "Start failed. Removing containers and volumes so you can retry with a clean state..."
  docker compose -f infra/docker-compose.yml --env-file .env down -v 2>/dev/null || true
  echo "Run ./scripts/up.sh again."
  exit 1
fi

echo ""
echo "Containers starting (API waits for DBs to be healthy). Check status with:"
echo "  docker compose -f infra/docker-compose.yml ps"
echo ""
echo "Endpoints:"
echo "  API:       http://localhost:4001"
echo "  Neo4j:     http://localhost:7475 (browser) / bolt://localhost:7688"
echo "  Postgres:  localhost:5433 (db: claidex, user: claidex) — use 5433 in POSTGRES_URL from host"
echo "  Redis:     localhost:6380"
