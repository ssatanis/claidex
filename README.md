# Claidex

Healthcare provider and corporate entity data platform: NPI lookup, ownership graphs, and exclusions (LEIE) with Neo4j + Postgres.

## Structure

- **api/** — Node.js/TypeScript REST API (Neo4j + Postgres) — **primary backend**
- **archive/backend/** — Legacy JavaScript backend (deprecated; use api/)
- **frontend/** — Next.js 15 + React 19 web UI
- **etl/** — Python data pipeline (ingest → transform → load)
- **infra/** — Docker Compose configurations
- **scripts/** — Automation scripts for setup and verification
- **data/** — Local only (gitignored): raw downloads, processed files, Neo4j exports

## Quick Start

### First-Time Setup

1. **Environment Setup**
   ```bash
   # Copy and configure environment variables
   cp .env.example .env
   # Edit .env:
   #   - NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD (Aura or local)
   #   - Postgres: set NEON_PROVIDERS_URL (use pooled URL from Neon Console) or POSTGRES_URL for local Docker
   #   - PORT=4002 if running API locally (so frontend can use http://localhost:4002)
   ```
   In **frontend**: `cp .env.local.example .env.local` and set `NEXT_PUBLIC_API_BASE_URL=http://localhost:4002` (or 4001 if API runs in Docker).
   **Note:** The canonical API is **api/** (TypeScript). See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for production (Vercel/Render/Neon/AuraDB).

2. **Initialize Infrastructure**
   ```bash
   # Make scripts executable and run initialization
   chmod +x scripts/*.sh
   ./scripts/init.sh
   ```

3. **Initialize Database Schemas**
   ```bash
   ./scripts/init-postgres-schemas.sh
   ```

4. **Start API** (from repo root so it reads `.env`; use a separate terminal)
   ```bash
   cd api
   npm install
   npm run dev
   ```
   API will be at http://localhost:4001 or 4002 depending on `PORT` in `.env`. Ensure frontend `.env.local` has `NEXT_PUBLIC_API_BASE_URL` set to that URL.

5. **Start Frontend** (in another terminal)
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   Frontend will be available at http://localhost:3000

6. **Verify Everything Works**
   ```bash
   ./scripts/verify.sh
   ```

### Daily Development Workflow

```bash
# Start infrastructure (Neo4j, Postgres, Redis, API on 4001)
./scripts/up.sh
# Or only Docker services:
docker compose -f infra/docker-compose.yml --env-file .env up -d

# Verify services
./scripts/verify.sh

# Start API (separate terminal)
cd api && npm run dev

# Start frontend (separate terminal)
cd frontend && npm run dev
```

### ETL Pipeline Setup

If you need to load data, run the ETL pipeline after infrastructure is ready:

```bash
cd etl
pip install -e .  # Install once

# Run the complete pipeline
./scripts/run_pipeline.sh ingest_nppes ingest_leie ingest_snf
./scripts/run_pipeline.sh transform_providers transform_exclusions transform_ownership
./scripts/run_pipeline.sh load_postgres load_neo4j
```

## Data sources (ETL)

- NPPES, Medicaid PUF, Medicare Physician, SNF ownership, LEIE, OpenCorporates.

## Neo4j Setup

### 1. Start Neo4j

```bash
docker compose -f infra/docker-compose.yml --env-file .env up -d neo4j
```

Neo4j Browser: http://localhost:7475 (host port; container uses 7474).
Bolt: `bolt://localhost:7688` (host port; container uses 7687).

Credentials are read from `.env` — ensure `NEO4J_PASSWORD` is set.

The container mounts `data/exports/` as `/var/lib/neo4j/import`, which is the
directory Neo4j's `LOAD CSV` reads from.

### 2. Run the ETL pipeline (ingest + transform)

Before loading the graph, ensure the processed Parquets exist:

```bash
cd etl
# Install deps once
pip install -e .

# Ingest (downloads/processes raw data)
python ingest/leie_ingest.py
python ingest/snf_ownership_ingest.py
python ingest/medicare_physician_ingest.py   # large — ~6M rows
# python ingest/nppes_ingest.py              # optional; enriches provider nodes

# Transform
python transform/exclusions_transform.py
python transform/ownership_transform.py
python transform/payments_transform.py
python transform/providers_transform.py      # requires nppes_ingest
```

### 3. Load the graph

The loader exports Parquets → CSVs, validates column headers, then executes
`infra/neo4j_init.cypher` via the Bolt driver.

```bash
# From repo root
python etl/load/neo4j_loader.py          # export + load (default)
python etl/load/neo4j_loader.py export   # export CSVs only
python etl/load/neo4j_loader.py load     # load from existing CSVs
```

Alternatively, export CSVs without touching Neo4j:

```bash
python etl/export_for_neo4j.py
```

This writes seven files to `data/exports/`:

| File | Description |
|---|---|
| `nodes_providers.csv` | Provider nodes (NPI, name, city, state, taxonomy, is_excluded) |
| `nodes_entities.csv` | CorporateEntity nodes (org owners + SNF stubs) |
| `nodes_persons.csv` | Person nodes (individual SNF owners) |
| `nodes_exclusions.csv` | Exclusion nodes (LEIE) |
| `edges_ownership.csv` | OWNS / CONTROLLED_BY edges (owner → SNF) |
| `edges_payments.csv` | RECEIVED_PAYMENT edges (provider → PaymentSummary) |
| `edges_exclusions.csv` | EXCLUDED_BY edges (provider → exclusion) |

The graph schema:

```
(:Provider)        -[:RECEIVED_PAYMENT]-> (:PaymentSummary)
(:Provider)        -[:EXCLUDED_BY]->      (:Exclusion)
(:CorporateEntity) -[:OWNS]->             (:CorporateEntity)
(:CorporateEntity) -[:CONTROLLED_BY]->    (:Person)
```

### 4. Run sanity checks

```bash
python scripts/check_neo4j_basic.py
```

Prints node/relationship counts, top-10 providers by total payments,
recently excluded providers, and multi-hop ownership chains.

### 5. Re-running

All Cypher uses `MERGE`, so the loader is fully idempotent — re-running
overwrites existing properties without duplicating nodes or relationships.

## Accessing Services

- **Neo4j Browser**: http://localhost:7475 (login: neo4j / [your NEO4J_PASSWORD])
- **API Health Check**: http://localhost:4001/health
- **API Documentation**: http://localhost:4001/docs
- **Frontend**: http://localhost:3000
- **Postgres**: localhost:5432 (use psql or any PostgreSQL client)

## Troubleshooting

### Docker Services Won't Start

```bash
# Check if ports are in use
lsof -i :5432  # Postgres
lsof -i :7688  # Neo4j (host bolt)
lsof -i :6379  # Redis
lsof -i :4001  # API

# View logs
docker compose logs neo4j
docker compose logs postgres

# Restart services
docker compose restart
```

### Environment Variable Issues

If you see warnings about `NEO4J_PASSWORD` or `POSTGRES_PASSWORD` not being set:

```bash
# Verify .env file exists and has the variables
cat .env | grep PASSWORD

# Ensure you're running docker compose from the project root
docker compose up -d
```

### Database Connection Errors

```bash
# Test Postgres connection
docker compose exec postgres psql -U claidex -d claidex -c "SELECT 1;"

# Test Neo4j connection
curl http://localhost:7475

# Check if services are healthy
docker compose ps
```

### ETL Pipeline Errors

```bash
# Ensure Python dependencies are installed
pip install -e etl/

# Verify data directories exist
ls -la data/

# Check environment variables are loaded
python -c "from dotenv import load_dotenv; load_dotenv(); import os; print(os.environ.get('POSTGRES_PASSWORD'))"
```

### API Won't Start

```bash
# Check if .env is being loaded
cd api
cat ../.env | grep NEO4J_PASSWORD

# Install dependencies
npm install

# Run with verbose logging
DEBUG=* npm run dev
```

## Scripts Reference

- **scripts/init.sh** - Complete first-time setup (creates directories, starts Docker, installs dependencies)
- **scripts/init-postgres-schemas.sh** - Initialize Postgres database schemas
- **scripts/verify.sh** - Comprehensive system verification (checks all services)
- **scripts/run_pipeline.sh** - Run ETL pipeline tasks
- **scripts/setup-data-dirs.sh** - Create required data directories
- **scripts/check_neo4j_basic.py** - Verify Neo4j graph data

## License

Private / internal use.
