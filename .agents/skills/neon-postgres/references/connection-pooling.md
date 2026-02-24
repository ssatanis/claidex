# Connection pooling

Learn how connection pooling works in Neon.

Neon uses PgBouncer to provide connection pooling, enabling up to 10,000 concurrent connections. Use this when in serverless or high-concurrency environments and for safe, scalable Postgres connection management.

**Full doc:** https://neon.com/docs/connect/connection-pooling.md

## Key points

- **Pooled connection string:** Add `-pooler` to the endpoint hostname (e.g. `ep-cool-darkness-123456-pooler.us-east-2.aws.neon.tech`). Or in Neon Console: Connection details → enable **Connection pooling** and copy the URL.
- **When to use pooled:** Serverless functions, web apps, connection-per-request frameworks. Use **direct** (no `-pooler`) for schema migrations, long-running analytics, `pg_dump`/`pg_restore`, logical replication.
- **Transaction mode:** Neon's PgBouncer uses `pool_mode=transaction`. Session-level features like `SET`/`RESET`, `LISTEN`/`NOTIFY`, `PREPARE`/`DEALLOCATE` (SQL-level), and temporary tables with `PRESERVE` are not supported with pooled connections. Use direct connections when you need these.
- **Limits:** `max_client_conn` = 10,000 (client connections to PgBouncer); `default_pool_size` = 0.9 × `max_connections` per user per database; `max_connections` varies by compute size.

## Quick reference

| Connection type | URL host example |
| --------------- | ----------------- |
| Direct (no pooling) | `ep-xxx.us-east-2.aws.neon.tech` |
| Pooled | `ep-xxx-pooler.us-east-2.aws.neon.tech` |

Always append `?sslmode=require` (or `verify-full`) to the connection string.
