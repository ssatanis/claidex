#!/usr/bin/env bash
# Start Claidex infra (Neo4j, Postgres, Redis, API) with env vars loaded.
# Run from repo root: ./scripts/docker-up.sh [neo4j|postgres|redis|api]
# Without args, starts all services. Use --env-file so NEO4J_PASSWORD and POSTGRES_PASSWORD are set.

set -e
cd "$(dirname "$0")/.."
docker compose -f infra/docker-compose.yml --env-file .env up -d "$@"
