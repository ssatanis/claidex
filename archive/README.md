# Archive

This directory holds deprecated or superseded code that is no longer used in production but kept for reference or history.

## archive/backend/

The legacy JavaScript backend (Express + Apollo GraphQL). **Not used in production.**

- **Replacement:** The TypeScript REST API in **api/** is the single canonical backend.
- **Docker / scripts:** Only **api** is started by `infra/docker-compose.yml` and `scripts/up.sh`.
- All `/v1/*` routes previously implemented in backend (including `/v1/me` for profile, settings, API keys) have been migrated to **api/**.
- To run the archived backend locally for comparison: `cd archive/backend && npm install && npm run dev`. It is not wired into Docker or any script.

Do not add new features here; use **api/** and **frontend/** instead.
