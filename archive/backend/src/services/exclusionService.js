import { postgresPool } from '../db/postgres.js';

export async function getExclusions({ search, page = 1, limit = 50 }) {
  const client = await postgresPool.connect();
  try {
    const offset = (page - 1) * limit;
    let where = '';
    const params = [limit, offset];
    if (search) {
      where = 'WHERE display_name ILIKE $3 OR business_name ILIKE $3 OR npi::text = $3';
      params.push(`%${search}%`);
    }
    const r = await client.query(
      `SELECT * FROM exclusions ${where} ORDER BY excldate DESC NULLS LAST LIMIT $1 OFFSET $2`,
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
      'SELECT * FROM exclusions WHERE npi = $1 OR display_name ILIKE $2 OR business_name ILIKE $2',
      [npi ?? null, name ? `%${name}%` : null]
    );
    return { excluded: r.rows.length > 0, matches: r.rows };
  } finally {
    client.release();
  }
}

/** Returns all exclusion records for a given NPI (active and reinstated). */
export async function getExclusionsByNpi(npi) {
  const client = await postgresPool.connect();
  try {
    const r = await client.query(
      'SELECT * FROM exclusions WHERE npi = $1 ORDER BY excldate DESC',
      [npi]
    );
    return r.rows;
  } finally {
    client.release();
  }
}
