# Data directory structure

All of `data/` is **gitignored**. Local only. Run `scripts/setup-data-dirs.sh` to create the canonical layout on a new clone.

## Layout

```
data/
├── raw/                    # Original downloads — never modify
│   ├── nppes/
│   │   └── YYYY-MM/        # e.g. 2026-02 — npidata_pfile_*.csv, othername.csv
│   ├── medicaid-puf/
│   │   └── YYYY/           # 2024, 2023, ...
│   ├── medicare-physician/
│   │   └── YYYY/           # 2023, 2022, ... (by year)
│   ├── medicare-facility/
│   │   ├── inpatient/
│   │   ├── outpatient/
│   │   ├── snf/
│   │   ├── hha/            # home health (alias for home-health if present)
│   │   ├── hospice/
│   │   └── dme/
│   ├── snf-ownership/
│   │   └── YYYY-MM/        # 2026-02, ...
│   ├── leie/
│   │   ├── YYYY-MM/        # Full + supplement CSVs
│   │   └── monthly-supplements/
│   ├── sam/
│   ├── ppef/
│   ├── pos/
│   ├── hcris/
│   ├── open-payments/
│   ├── form990/            # IRS 990 index / bulk
│   ├── fec/
│   ├── pesp/
│   ├── openownership/      # BODS schema/examples (optional)
│   ├── medicare-enrollment/
│   ├── md-ppas/
│   └── nursing-home-affiliated/  # CMS affiliated-entity data
│
├── processed/              # Cleaned, deduplicated — Parquet
│   ├── providers/
│   │   ├── providers_canonical.parquet
│   │   └── providers_nppes_orgs.parquet
│   ├── payments/
│   │   ├── medicaid_by_npi_year.parquet
│   │   └── medicare_by_npi_year.parquet
│   ├── ownership/
│   │   ├── snf_owners.parquet
│   │   ├── snf_affiliated_entities.parquet
│   │   ├── corporate_entities.parquet
│   │   └── entity_officers.parquet
│   ├── exclusions/
│   │   ├── leie_current.parquet
│   │   └── sam_current.parquet
│   └── opencorporates/
│       └── queries_cache.parquet
│
└── exports/                # Neo4j import (mounted as /var/lib/neo4j/import)
    ├── nodes_providers.csv
    ├── nodes_entities.csv
    ├── nodes_persons.csv
    ├── nodes_exclusions.csv
    ├── edges_ownership.csv
    ├── edges_payments.csv
    └── edges_exclusions.csv
```

Docker also uses (do not remove):

- `data/neo4j/` — Neo4j volume
- `data/postgres/` — Postgres volume
