import { postgresPool } from '../db/postgres.js';

export async function getExclusions({ search, page = 1, limit = 50 }) {
  const client = await postgresPool.connect();
  try {
    const offset = (page - 1) * limit;
    let where = '';
    const params = [limit, offset];
    if (search) {
      where = 'WHERE name ILIKE $3 OR npi::text = $3';
      params.push(`%${search}%`);
    }
    const r = await client.query(
      `SELECT * FROM exclusions ${where} ORDER BY excluded_at DESC LIMIT $1 OFFSET $2`,
      params
    );
    const countResult = await client.query(
      'SELECT COUNT(*) AS count FROM exclusions ' + where,
      search ? [params[2]] : []
    );
    const total = parseInt(countResult.rows[0].count, 10);
    return {
      items: r.rows,
      total,
      page,
      limit,
    };
  } finally {
    client.release();
  }
}

export async function checkExclusion({ npi, name }) {
  const client = await postgresPool.connect();
  try {
    const r = await client.query(
      'SELECT * FROM exclusions WHERE npi = $1 OR name ILIKE $2',
      [npi ?? null, name ? `%${name}%` : null]
    );
    return { excluded: r.rows.length > 0, matches: r.rows };
  } finally {
    client.release();
  }
}
