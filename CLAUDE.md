# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claidex is a healthcare provider and corporate entity data platform. It provides NPI lookup, ownership graphs, and exclusions (LEIE) using Neo4j for graph relationships and Postgres for relational data.

## Commands

### API (primary backend — Node.js/TypeScript)
```bash
cd api && npm install && npm run dev   # Development (port 4001 or PORT from .env)
cd api && npm test                     # Run tests
```
The legacy JavaScript backend (Express + GraphQL) lives in **archive/backend/** and is not used; use **api/** for all backend work.

### Frontend (Next.js 15 + React 19)
```bash
cd frontend && npm install && npm run dev  # Development server
cd frontend && npm run build               # Production build
cd frontend && npm run lint                # ESLint
```

### ETL Pipeline (Python 3.10+)
```bash
cd etl && pip install -e .                 # Install package
python etl/ingest/nppes_ingest.py          # Run specific ingest
python etl/ingest/hcris_ingest.py          # HCRIS hospital/SNF financials
python etl/load/postgres_loader.py         # Load all tables to Postgres
python etl/load/postgres_loader.py providers exclusions  # Load specific tables
python etl/load/neo4j_loader.py [nodes|edges|all]  # Load to Neo4j
```

### Infrastructure (everything except frontend)
```bash
# From repo root — one command to start Docker + API (Neo4j, Postgres, Redis, API on 4001)
./scripts/up.sh

# Or start only specific services:
./scripts/docker-up.sh              # Same as up.sh: all services
./scripts/docker-up.sh neo4j        # Only Neo4j
./scripts/docker-up.sh postgres     # Only Postgres
./scripts/docker-up.sh neo4j postgres redis  # Infra only (no API container)
```
- **up.sh**: Ensures `.env` exists, then starts Neo4j, Postgres, Redis, and the API (frontend not started). API waits for DB healthchecks before starting.
- Postgres is mapped to host port **5433** (not 5432). Use `POSTGRES_URL=postgres://claidex:PASSWORD@localhost:5433/claidex` from the host (ETL, backend). Postgres uses a Docker named volume so a corrupted host data dir won't break startup.
- Neo4j is mapped to host ports **7475** (browser) and **7688** (bolt) to avoid conflict with a local Neo4j. Use `NEO4J_URI=bolt://localhost:7688` from the host.
- Redis uses host port 6380 to avoid conflict with a local Redis on 6379.
- Manual: `docker compose -f infra/docker-compose.yml --env-file .env up -d [service...]`

## Architecture

### Three-Tier Data Flow
```
Data Sources → ETL (ingest/transform/load) → Databases → Backend API → Frontend
```

### API (`api/src/`) — primary backend
- **Entry**: `index.ts` — Express server, Helmet, CORS, rate limit, REST at `/v1/*`
- **Routes**: `routes/*.ts` — `/v1/providers`, `/v1/entities`, `/v1/ownership`, `/v1/payments`, `/v1/exclusions`, `/v1/search`, `/v1/me`, `/v1/watchlist`, `/v1/watchlists`, `/v1/metrics`, `/v1/events`, etc.
- **Services**: `services/meService.ts` and inline logic in route handlers
- **DB**: `db/neo4j.ts` and `db/postgres.ts`
- **Legacy**: The former JS backend is in **archive/backend/** (deprecated).

### Frontend (`frontend/`)
- Next.js 15 App Router with React 19
- Key routes: `/providers/[npi]`, `/entities/[id]`, `/exclusions`

### ETL Pipeline (`etl/`)
- **ingest/**: Download and parse raw data (NPPES, LEIE, Medicaid PUF, Medicare Physician, SNF ownership)
- **transform/**: Clean, normalize, entity resolution, UBO inference
- **load/**: Bulk load to Postgres (COPY) and Neo4j (LOAD CSV)
- **schemas/**: SQL table definitions

Data flows from `data/raw/` → `data/processed/` → databases. The `data/` directory is gitignored.

### Database Schema

**Postgres tables** (see `etl/schemas/*.sql`):
- `providers` — NPI registry with FTS index on name
- `corporate_entities` — CMS associate IDs with ownership flags
- `payments_medicaid`, `payments_medicare` — payment aggregates by NPI/year
- `exclusions` — LEIE exclusion records
- `ownership_snf` — SNF ownership relationships

**Neo4j graph**:
- Nodes: `Provider`, `CorporateEntity`, `Person`, `Exclusion`
- Edges: `OWNS`, `EXCLUDED_BY`, `RECEIVED_PAYMENT`

### Environment Variables
See `.env.example` for required vars. Key groupings:
- Local: `NEO4J_*`, `POSTGRES_*`
- Cloud: `NEON_*_URL` (separate databases per domain; use pooled connection strings for production — see [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)), `UPSTASH_REDIS_*`, `R2_*`
- External APIs: `OPENCORPORATES_API_KEY`, `SAM_GOV_API_KEY`

## Key Patterns

### ETL Scripts
Each ingest script reads from `data/raw/` and writes Parquet to `data/processed/`. Transform scripts read from `data/processed/` and write enriched Parquet. Loaders export to CSV for bulk import.

### API pattern
Use `queryPg` and `runCypher` (from `db/postgres` and `db/neo4j`) in route handlers or service modules. Responses use `{ data, meta }` where appropriate.