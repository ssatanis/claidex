# Syncing all four Neon Postgres databases

The repo can use four Neon projects: **providers**, **payments**, **entities**, **exclusions**. The API uses only **NEON_PROVIDERS_URL**; the other three are kept in sync for consistency or future use.

## One-time setup (schemas only)

To create all tables in every Neon project (including ones that show "0 tables"):

```bash
./scripts/sync-neon-databases.sh schemas-only
```

This applies schemas in dependency order so views and foreign keys resolve. No data is loaded.

## Full sync (schemas + data + risk scores)

```bash
./scripts/sync-neon-databases.sh
```

This will:

1. Apply schemas to each of the four Neon DBs (if you haven’t run `schemas-only` already).
2. Run the Postgres loader for each DB. It reads from `data/processed/` (and fallbacks). Tables are skipped if the corresponding parquet file is missing.
3. If `results/final.parquet` exists, upsert **provider_risk_scores** into all four DBs.

## Neon free tier storage limit (512 MB)

Neon’s free tier has a **512 MB** project size limit. Loading the full **providers** table (~9M+ rows) can exceed this and you’ll see:

```text
could not extend file because project size limit (512 MB) has been exceeded
HINT: This limit is defined by neon.max_cluster_size GUC
```

When that happens:

- The loader skips the rest of that table and continues with the next table (exclusions, risk_scores, etc.).
- **provider_risk_scores** (from `results/final.parquet`) is much smaller and usually fits; it will still be loaded.
- For full provider/exclusion data on Neon free tier you can either:
  - Load a **subset** (e.g. one state or first N rows) by changing the ETL or loader, or
  - Use a **paid Neon plan** with a higher storage limit, or
  - Use a **single** Neon project (e.g. only NEON_PROVIDERS_URL) and point the API there; leave the other three for smaller or later use.

## Data sources

| Data            | Source                    | When it’s loaded                         |
|-----------------|---------------------------|------------------------------------------|
| Schemas         | `etl/schemas/*.sql`       | `sync-neon-databases.sh` (any mode)      |
| providers, etc. | `data/processed/*.parquet` | ETL ingest/transform, then full sync   |
| provider_risk_scores | `results/final.parquet` | After Modal merge or local upsert; full sync loads into all four |

## Applying to a single Neon URL

- **Schemas only:**  
  `./scripts/init-postgres-schemas.sh "$NEON_EXCLUSIONS_URL"`

- **Load data into one DB:**  
  `TARGET_POSTGRES_URL="$NEON_EXCLUSIONS_URL" python -m etl.load.postgres_loader`

- **Risk scores into one DB:**  
  `TARGET_POSTGRES_URL="$NEON_EXCLUSIONS_URL" python scripts/upsert_risk_scores_from_parquet.py results/final.parquet`

## Verification

- In Neon Console → each project → **Tables**: confirm tables exist and row counts where you expect data.
- API health: the app uses **NEON_PROVIDERS_URL** only; ensure that project has at least `providers`, `provider_risk_scores`, and `exclusions` (and seed data if you need dashboard/events).
