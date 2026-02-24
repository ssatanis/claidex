import { postgresPool } from '../db/postgres.js';
import { getNeo4jSession } from '../db/neo4j.js';

export async function getEntityById(id) {
  const client = await postgresPool.connect();
  try {
    const r = await client.query(
      'SELECT * FROM entities WHERE id = $1',
      [id]
    );
    return r.rows[0] ?? null;
  } finally {
    client.release();
  }
}

export async function searchEntities(query, limit = 20) {
  const client = await postgresPool.connect();
  try {
    const r = await client.query(
      `SELECT * FROM entities WHERE name ILIKE $1 OR id::text = $2 LIMIT $3`,
      [`%${query}%`, query, limit]
    );
    return r.rows;
  } finally {
    client.release();
  }
}
