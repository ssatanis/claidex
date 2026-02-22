# SQL schemas

Run these against Postgres to create tables before ETL load:

- `providers.sql` — NPI provider table
- `entities.sql` — Corporate entities
- `exclusions.sql` — LEIE exclusions

Example: `psql -h localhost -U claidex -d claidex -f schemas/providers.sql`
