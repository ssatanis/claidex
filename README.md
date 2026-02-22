# Claidex

Healthcare provider and corporate entity data platform: NPI lookup, ownership graphs, and exclusions (LEIE) with Neo4j + Postgres.

## Structure

- **backend/** — Node.js/Express REST + GraphQL API (Neo4j + Postgres)
- **frontend/** — Next.js 15 + React 19 web UI
- **etl/** — Python data pipeline (ingest → transform → load)
- **infra/** — Docker Compose (Neo4j, Postgres, Redis), nginx
- **data/** — Local only (gitignored): raw downloads, processed files, Neo4j exports

## Quick start

1. Copy `.env.example` to `.env` and set passwords.
2. Start stack: `docker compose -f infra/docker-compose.yml up -d` (or use root `docker-compose.yml` if linked from infra).
3. Backend: `cd backend && npm install && npm run dev`
4. Frontend: `cd frontend && npm install && npm run dev`
5. ETL: `cd etl && pip install -e .` then run ingest/transform/load as needed.

## Data sources (ETL)

- NPPES, Medicaid PUF, Medicare Physician, SNF ownership, LEIE, OpenCorporates.

## License

Private / internal use.
