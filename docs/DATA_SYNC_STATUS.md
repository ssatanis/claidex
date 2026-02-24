# Claidex Data Sync Status
**Last sync:** 2026-02-22

---

## 1. ETL stages (current)

| Stage | Source | Output | Status |
|-------|--------|--------|--------|
| NPPES | `data/raw/nppes/` | `providers_canonical.parquet` | ✓ Up to date |
| Providers transform | `providers_canonical` + LEIE + order_referring | `providers_final.parquet` | ✓ Up to date (9.37M rows, eligibility flags) |
| Medicaid PUF | `data/raw/medicaid-puf/` | `medicaid_by_npi_year.parquet` | ✓ Up to date |
| Medicare Physician | `data/raw/medicare-physician/` | `medicare_by_npi_year.parquet` | ✓ Up to date |
| Medicare Part D | `data/raw/medicare-part-d/` | `medicare_part_d_by_npi_year.parquet` | ✓ Ingested (5.1M rows, 2019–2022) |
| Medicare Inpatient | `data/raw/medicare-facility/inpatient/provider/` | `medicare_inpatient_by_facility.parquet` | ✓ Ingested (18.9K rows, 2018–2023, CCN-keyed) |
| Order & Referring | `data/raw/order-referring/` | `order_referring.parquet` | ✓ Ingested (2.0M NPIs) |
| Payments transform | Medicaid + Medicare + Part D | `payments_combined.parquet` | ✓ Up to date (11.74M rows, programs: Medicare, Medicaid, MedicarePartD) |
| Exclusions | LEIE | `exclusions_final.parquet` | ✓ Up to date |
| Ownership | SNF ownership | `ownership_edges.parquet`, etc. | ✓ Up to date |

---

## 2. Exports (Neo4j)

All 7 CSVs regenerated from current parquets:

- `data/exports/nodes_providers.csv` — 9,368,273 rows
- `data/exports/nodes_entities.csv` — 34,294
- `data/exports/nodes_persons.csv` — 54,212
- `data/exports/nodes_exclusions.csv` — 82,855
- `data/exports/edges_payments.csv` — 11,121,335
- `data/exports/edges_exclusions.csv` — 8,508
- `data/exports/edges_ownership.csv` — 256,644

Headers match `infra/neo4j_init.cypher` expectations.

---

## 3. Missing raw datasets

See **`data/raw/MISSING_DATA_STATUS.md`** for details. Summary:

| Family | Path | Status |
|--------|------|--------|
| Care Compare quality | `data/raw/care-compare/` | Empty dirs — manual CMS download |
| SAM.gov exclusions | `data/raw/sam/` | Empty — API key or manual download |
| PECOS ownership | `data/raw/medicare-enrollment/pecos/` | No PECOS subfolder |
| Form 990 filings | `data/raw/form990/filings/` | Index only; no filing XML/JSON |

---

## 4. Health snapshot (run when services are up)

### Neo4j

Start: `docker start claidex-neo4j-1` (or `docker compose -f infra/docker-compose.yml --env-file .env up -d neo4j`).

Then:

```bash
python etl/load/neo4j_loader.py load   # if graph needs reload from exports
python scripts/check_neo4j_basic.py   # node/edge counts, RECEIVED_PAYMENT by program, multi-program sample
```

Expected: Provider, CorporateEntity, Person, Exclusion, PaymentSummary counts; RECEIVED_PAYMENT by program (Medicare, Medicaid, MedicarePartD); sample providers with >2 programs.

### Postgres

Start: `docker start infra-postgres-1` or `claidex-postgres-1` (whichever exposes port 5432). Ensure `POSTGRES_PASSWORD` in `.env` matches the DB. The loader uses `127.0.0.1` and retries up to 5 times so Postgres can be ready after `docker start`.

Then:

```bash
python etl/load/postgres_loader.py
```

Tables: `providers`, `payments_medicaid`, `payments_medicare`, `exclusions`, `ownership_snf`, `medicare_inpatient`, `medicare_part_d`, `order_referring`. Loader dedupes by primary key (providers by npi, ownership_snf by enrollment_id+owner_associate_id, payments by npi+year) and renames Medicaid columns (total_paid → payments, etc.).

Sanity queries (after load):

- `SELECT program, count(*) FROM payments_medicare GROUP BY 1;` — expect Medicare (and if you load from combined, program types).
- Count of providers with Medicaid: from `payments_medicaid`.
- Providers in both Part B and Part D: join `payments_medicare` and `medicare_part_d` on `npi`.

### API

```bash
cd api && npm install && npm run build && npm start
```

Test with an NPI that has both Medicare and Medicaid in `payments_combined.parquet`:

- `GET /v1/providers/:npi` — taxonomy, isExcluded, payments, exclusions
- `GET /v1/payments/:npi` — multiple programs
- `GET /v1/ownership/:npi`
- `GET /v1/exclusions?has_payments=true&limit=5`
- `GET /v1/search?q=hospital&limit=5`

---

## 5. API routes tested

| Route | Status |
|-------|--------|
| `GET /v1/providers/:npi` | To be verified when API + Neo4j/Postgres are running |
| `GET /v1/payments/:npi` | To be verified |
| `GET /v1/ownership/:npi` | To be verified |
| `GET /v1/exclusions?has_payments=true&limit=5` | To be verified |
| `GET /v1/search?q=hospital&limit=5` | To be verified |

No API code changes were required; graph property names (e.g. `taxonomy`, `exclType`, `exclDate`) already match the API.

---

## 6. What to run to finish sync

1. **Start Postgres:** `docker start infra-postgres-1` or `docker start claidex-postgres-1` (use whichever container exposes 5432; check with `docker ps`).
2. **Load Postgres:** `python etl/load/postgres_loader.py`
3. **Start Neo4j:** `docker start claidex-neo4j-1` (or `docker compose -f infra/docker-compose.yml --env-file .env up -d neo4j`). Ensure `data/exports` is mounted at Neo4j’s import path.
4. **Reload Neo4j (if needed):** `python etl/load/neo4j_loader.py load`
5. **Neo4j health check:** `python scripts/check_neo4j_basic.py`
6. **API:** `cd api && npm run build && npm start`; then hit the routes above with a real NPI.

---

## 7. Files created or updated this sync

- `data/raw/MISSING_DATA_STATUS.md` — missing datasets documented
- `etl/ingest/medicare_inpatient_ingest.py` — new
- `etl/ingest/medicare_part_d_ingest.py` — new
- `etl/ingest/order_referring_ingest.py` — new
- `etl/transform/payments_transform.py` — MedicarePartD frame added
- `etl/transform/providers_transform.py` — order_referring eligibility join
- `etl/schemas/medicare_inpatient.sql` — new
- `etl/schemas/medicare_part_d.sql` — new
- `etl/schemas/order_referring.sql` — new
- `etl/schemas/providers.sql` — eligible_* columns added
- `etl/load/postgres_loader.py` — TABLE_CONFIG + credential fallback + drop-and-recreate for full reload
- `scripts/check_neo4j_basic.py` — MedicarePartD count, RECEIVED_PAYMENT by program, multi-program sample
