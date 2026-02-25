# AGENTS.md

## Cursor Cloud specific instructions

### Services overview

| Service | Port | How to start |
|---|---|---|
| Postgres 16 (Docker) | localhost:5433 | `docker compose -f infra/docker-compose.yml --env-file .env up -d postgres` |
| Neo4j 5.18 (Docker) | localhost:7688 (bolt), 7475 (browser) | `docker compose -f infra/docker-compose.yml --env-file .env up -d neo4j` |
| API (Node.js/TS) | localhost:4002 (local dev) | `cd api && npm run dev` |
| Frontend (Next.js) | localhost:3000 | `cd frontend && PORT=3000 npm run dev` |

See `CLAUDE.md` for full command reference, architecture, and environment variables.

### Gotchas

- **Docker daemon**: Must be started manually with `sudo dockerd &>/tmp/dockerd.log &` and socket permissions set with `sudo chmod 666 /var/run/docker.sock` before running any `docker compose` commands.
- **Postgres password**: After a fresh `docker compose up`, the Postgres password may not match the `.env` value due to how `env_file` interacts with Docker Compose variable substitution. Run `docker exec infra-postgres-1 psql -U claidex -d claidex -c "ALTER USER claidex WITH PASSWORD '<your_password>';"` to fix auth errors. If in doubt, tear down volumes (`docker compose -f infra/docker-compose.yml --env-file .env down -v`) and recreate.
- **Postgres schemas**: After starting a fresh Postgres container, run `bash scripts/init-postgres-schemas.sh` to create all tables. Without this, the API returns 500 errors for most endpoints.
- **Frontend PORT conflict**: The frontend reads the `PORT` env var from `.env`. Since the API uses `PORT=4002`, start the frontend with `PORT=3000 npm run dev` to avoid port conflicts.
- **API tests**: 33/34 tests pass on a fresh empty database. One test (`search › returns results array`) has a pre-existing assertion mismatch (`meta.source` is `claidex-v1-neon` vs expected `claidex-v1`). Tests that query for specific NPIs gracefully skip when the DB is empty.
- **Lint**: `cd api && npx tsc --noEmit` for API type checks. `cd frontend && npm run lint` for frontend ESLint (pre-existing warnings/errors exist in the codebase).
