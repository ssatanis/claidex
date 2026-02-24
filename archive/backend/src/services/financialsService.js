import { postgresPool } from '../db/postgres.js';

/**
 * Returns financials for a provider (e.g. HCRIS). If no HCRIS table exists or no row,
 * returns { has_hcris_data: false }. Otherwise can include operating margin vs peer median.
 */
export async function getFinancialsByNpi(npi) {
  const client = await postgresPool.connect();
  try {
    const hasHcris = await client.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'hcris'
       ) AS ok`
    );
    if (!hasHcris.rows[0]?.ok) {
      return { has_hcris_data: false };
    }
    const r = await client.query(
      'SELECT * FROM hcris WHERE npi = $1 LIMIT 1',
      [npi]
    );
    if (r.rows.length === 0) {
      return { has_hcris_data: false };
    }
    const row = r.rows[0];
    return {
      has_hcris_data: true,
      operating_margin: row.operating_margin != null ? Number(row.operating_margin) : null,
      above_peer_median: row.above_peer_median ?? null,
    };
  } finally {
    client.release();
  }
}
