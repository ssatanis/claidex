# Legacy Backend (Deprecated)

This is the former JavaScript backend (Express + Apollo GraphQL). **It is not used in production or by any Claidex script.**

- The canonical backend is **api/** (TypeScript REST API at repo root).
- Docker and `scripts/up.sh` start **api** on port 4001, not this service.
- All functionality needed by the frontend (including `/v1/me` for profile, notifications, organization, API keys) has been migrated to **api/**.

Kept in `archive/backend/` for reference only. Do not use for new development.
