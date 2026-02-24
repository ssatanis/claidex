# Claidex deployment guide

Production stack: **Vercel** (frontend), **Render** or **Railway** (API), **Neon** (Postgres), **Neo4j AuraDB Free** (graph).

## Architecture

- **Frontend** (Next.js): Deploy to Vercel. All API calls use `NEXT_PUBLIC_API_BASE_URL` (or `NEXT_PUBLIC_API_URL`). No localhost in production.
- **API** (Node/Express in `api/`): Deploy to Render or Railway. Connects to Neon (Postgres) and AuraDB (Neo4j). Binds to `0.0.0.0` and uses `process.env.PORT`.
- **Postgres**: Neon. One connection string; set as `DATABASE_URL` or `NEON_PROVIDERS_URL` on the API.
- **Neo4j**: AuraDB Free (e.g. 50k nodes). Use a graph subset if the full dataset exceeds limits.

## Environment variables

### Vercel (frontend)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_BASE_URL` | Yes (prod) | Full API URL, e.g. `https://claidex-api.onrender.com`. Do not use localhost in production. |

### Render / Railway (API)

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Yes | Set to `production`. |
| `PORT` | Set by host | Render/Railway set this automatically. |
| `DATABASE_URL` or `NEON_PROVIDERS_URL` | Yes | Neon Postgres connection string. |
| `NEO4J_URI` | Yes | AuraDB URI, e.g. `neo4j+s://xxx.databases.neo4j.io`. |
| `NEO4J_USER` | Yes | Usually `neo4j`. |
| `NEO4J_PASSWORD` | Yes | AuraDB password. |
| `CORS_ORIGIN` | Yes (prod) | Comma-separated list of allowed frontend origins, e.g. `https://your-app.vercel.app`. |

Do not commit secrets. Set them in the Vercel and Render (or Railway) dashboards.

## Neon (Postgres)

The API uses a **single** Postgres connection. Set `NEON_PROVIDERS_URL` (or `DATABASE_URL`) to the Neon project that contains all of: `providers`, `provider_risk_scores`, `exclusions`. Typically that is your **claidex-providers** project.

1. In the [Neon Console](https://console.neon.tech), open the project (e.g. claidex-providers) → **Connection details** → enable **Connection pooling** and copy the connection string. Use the pooled URL (host contains `-pooler`) for production to avoid exhausting `max_connections`. Append `?sslmode=require` (or `verify-full` for stricter verification). See [Neon connection pooling](https://neon.com/docs/connect/connection-pooling) and [securing connections](https://neon.com/docs/connect/connect-securely).
2. Set it in `.env` at repo root (never commit `.env`):
   - `NEON_PROVIDERS_URL=postgresql://...-pooler....neon.tech/neondb?sslmode=require`
3. To use Neon for local dev, leave `POSTGRES_URL` unset so the API uses `NEON_PROVIDERS_URL`. To use local Docker Postgres instead, set `POSTGRES_URL=postgres://claidex:PASSWORD@localhost:5433/claidex`.

The dashboard and `/v1/events` depend on tables: `providers`, `provider_risk_scores`, `exclusions`. Ensure these exist and are populated in the DB you point the API to.

## Neo4j AuraDB Free

- Create an AuraDB Free instance and copy the connection URI, user, and password.
- AuraDB Free has limits (e.g. 50k nodes). For a large graph, export a subset (e.g. one state or one cohort) and load it into Aura. Ownership and other graph endpoints will use this subset.
- Set `NEO4J_URI`, `NEO4J_USER`, and `NEO4J_PASSWORD` on the API. The driver supports `neo4j+s://` out of the box.

## Render (API)

- Use the `render.yaml` at repo root: it defines a web service with `rootDir: api`, build `npm ci --ignore-scripts && npm run build`, start `node dist/index.js`.
- Connect the repo to Render and add the env vars above in the dashboard. Render will set `PORT` automatically.
- Health: `GET https://your-api.onrender.com/health` returns 200 when Postgres and Neo4j are connected; the frontend uses this for the "Service temporarily unavailable" page when the API is down or misconfigured.

## Vercel (frontend)

- Deploy the `frontend/` app (or repo root if frontend is the root). Set `NEXT_PUBLIC_API_BASE_URL` to your Render API URL.
- No localhost: in production the app requires a valid API URL; if missing or localhost, users see "Service temporarily unavailable."

## Local development

- **API**: The canonical API is in `api/` (TypeScript). Docker Compose runs it on port 4001. To run locally: `cd api && npm run dev` (often on port 4002).
- **Frontend**: Set `NEXT_PUBLIC_API_BASE_URL=http://localhost:4001` when using Docker, or `http://localhost:4002` when running the API locally. The legacy JavaScript backend is in `archive/backend/`; use `api/` for all new work and for deployment.

## Verification

After deployment:

1. Open `https://your-api.onrender.com/health` — expect 200 and `postgres: "connected"`, `neo4j: "connected"`.
2. Open your Vercel app and visit `/dashboard`, `/providers`, `/providers/[npi]`, `/events`, `/watchlists`, `/settings`. All should load without console errors or failed network requests.
3. Ensure no references to localhost in production (check Network tab and env).
