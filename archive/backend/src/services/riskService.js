import { postgresPool } from '../db/postgres.js';

/**
 * Returns risk score and components for a provider from provider_risk_scores.
 * Returns null if no row exists.
 */
export async function getRiskByNpi(npi) {
  const client = await postgresPool.connect();
  try {
    const r = await client.query(
      `SELECT npi, risk_score, risk_label, r_raw,
              billing_outlier_score, billing_outlier_percentile,
              ownership_chain_risk, payment_trajectory_score, payment_trajectory_zscore,
              exclusion_proximity_score, program_concentration_score,
              peer_taxonomy, peer_state, peer_count, data_window_years,
              flags, components
       FROM provider_risk_scores WHERE npi = $1`,
      [npi]
    );
    const row = r.rows[0];
    if (!row) return null;
    return {
      risk_score: row.risk_score != null ? Number(row.risk_score) : null,
      risk_label: row.risk_label ?? null,
      billing_outlier_percentile: row.billing_outlier_percentile != null ? Number(row.billing_outlier_percentile) : null,
      components: row.components ?? {},
      flags: Array.isArray(row.flags) ? row.flags : (row.flags ? [row.flags] : []),
      peer_taxonomy: row.peer_taxonomy ?? null,
      peer_state: row.peer_state ?? null,
      peer_count: row.peer_count ?? null,
      data_window_years: row.data_window_years ?? null,
    };
  } finally {
    client.release();
  }
}
