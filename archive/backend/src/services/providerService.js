import { postgresPool } from '../db/postgres.js';
import { getNeo4jSession } from '../db/neo4j.js';

export async function getProviderByNpi(npi) {
  const client = await postgresPool.connect();
  try {
    const r = await client.query(
      'SELECT * FROM providers WHERE npi = $1',
      [npi]
    );
    return r.rows[0] ?? null;
  } finally {
    client.release();
  }
}

export async function searchProviders(query, limit = 20) {
  const client = await postgresPool.connect();
  try {
    const r = await client.query(
      `SELECT * FROM providers WHERE npi::text LIKE $1 OR full_name ILIKE $2 LIMIT $3`,
      [`%${query}%`, `%${query}%`, limit]
    );
    return r.rows;
  } finally {
    client.release();
  }
}
