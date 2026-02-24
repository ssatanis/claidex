import { Pool, PoolClient, QueryResultRow } from 'pg';
import { config } from '../config';

let pool: Pool | null = null;

/**
 * Postgres connection pool. For Neon: use a pooled connection string (host with `-pooler`,
 * or Connection pooling toggle in Neon Console). SSL is required; we verify the server cert.
 * @see https://neon.com/docs/connect/connection-pooling
 * @see https://neon.com/docs/connect/connect-securely
 */
export function getPool(): Pool {
  if (!pool) {
    const isNeon = config.pgUrl.includes('neon.tech');
    pool = new Pool({
      connectionString: config.pgUrl,
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ssl: isNeon ? { rejectUnauthorized: true } : undefined,
    });

    pool.on('error', (err) => {
      console.error('[postgres] Unexpected pool error:', err.message);
    });
  }
  return pool;
}

export async function verifyPostgresConnectivity(): Promise<boolean> {
  if (!config.pgUrl) return false;
  try {
    const client: PoolClient = await getPool().connect();
    try {
      await client.query('SELECT 1');
      return true;
    } finally {
      client.release();
    }
  } catch {
    return false;
  }
}

export async function closePostgres(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/** Execute a parameterized query and return rows. */
export async function queryPg<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const client = await getPool().connect();
  try {
    const result = await client.query<T>(sql, params);
    return result.rows;
  } finally {
    client.release();
  }
}
