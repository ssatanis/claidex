import { postgresPool } from '../db/postgres.js';

/**
 * Dashboard metrics from Postgres: providers count, high-risk count,
 * active exclusions, flagged payments (heuristic from risk scores), and trends.
 * Compatible with Neon (single connection string via POSTGRES_URL).
 */
export async function getDashboardMetrics() {
  const client = await postgresPool.connect();
  try {
    const [providersRes, riskRes, exclusionsRes, flaggedRes] = await Promise.all([
      client.query('SELECT COUNT(*) AS n FROM providers').catch(() => ({ rows: [{ n: '0' }] })),
      client
        .query(
          `SELECT COUNT(*) AS n FROM provider_risk_scores WHERE risk_label IN ('High', 'Elevated')`
        )
        .catch(() => ({ rows: [{ n: '0' }] })),
      client
        .query('SELECT COUNT(*) AS n FROM exclusions WHERE reinstated = FALSE')
        .catch(() => ({ rows: [{ n: '0' }] })),
      client
        .query(
          `SELECT COUNT(*) AS n FROM provider_risk_scores
           WHERE payment_trajectory_zscore > 2 OR billing_outlier_percentile > 95`
        )
        .catch(() => ({ rows: [{ n: '0' }] })),
    ]);

    const total_providers = parseInt(providersRes.rows[0]?.n ?? '0', 10);
    const high_risk_providers = parseInt(riskRes.rows[0]?.n ?? '0', 10);
    const active_exclusions = parseInt(exclusionsRes.rows[0]?.n ?? '0', 10);
    const flagged_payments = parseInt(flaggedRes.rows[0]?.n ?? '0', 10);
    const high_risk_percentage =
      total_providers > 0
        ? (high_risk_providers / total_providers) * 100
        : 0;

    return {
      total_providers,
      high_risk_providers,
      high_risk_percentage,
      active_exclusions,
      flagged_payments,
      trends: {
        high_risk_change_pct: 0,
        direction: 'flat',
      },
    };
  } finally {
    client.release();
  }
}

/**
 * Risk aggregates by state (from provider_risk_scores joined to providers for state).
 */
export async function getRiskByState() {
  const client = await postgresPool.connect();
  try {
    const r = await client.query(
      `SELECT
         COALESCE(p.state, 'Unknown') AS state,
         COUNT(DISTINCT prs.npi) AS total_providers,
         COUNT(DISTINCT prs.npi) FILTER (WHERE prs.risk_label IN ('High', 'Elevated')) AS high_risk_count,
         ROUND(AVG(prs.risk_score)::NUMERIC, 2) AS avg_risk_score
       FROM provider_risk_scores prs
       LEFT JOIN providers p ON p.npi = prs.npi
       GROUP BY COALESCE(p.state, 'Unknown')
       ORDER BY high_risk_count DESC, total_providers DESC`
    );
    return r.rows.map((row) => ({
      state: row.state,
      total_providers: parseInt(row.total_providers, 10),
      high_risk_count: parseInt(row.high_risk_count, 10),
      avg_risk_score: row.avg_risk_score != null ? Number(row.avg_risk_score) : null,
    }));
  } catch (e) {
    if (e.code === '42P01') return []; // table missing
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Monthly risk trends (by risk_label). Uses provider_risk_scores.updated_at
 * binned by month when no history table exists.
 */
export async function getTrends() {
  const client = await postgresPool.connect();
  try {
    const r = await client.query(
      `SELECT
         date_trunc('month', updated_at)::date AS month,
         COUNT(*) FILTER (WHERE risk_label = 'High') AS high_risk_count,
         COUNT(*) FILTER (WHERE risk_label = 'Elevated') AS elevated_count,
         COUNT(*) FILTER (WHERE risk_label IN ('Moderate', 'Low')) AS moderate_count
       FROM provider_risk_scores
       WHERE updated_at IS NOT NULL
       GROUP BY date_trunc('month', updated_at)
       ORDER BY month ASC`
    );
    return r.rows.map((row) => ({
      month: row.month ? new Date(row.month).toISOString().slice(0, 7) : null,
      high_risk_count: parseInt(row.high_risk_count, 10),
      elevated_count: parseInt(row.elevated_count, 10),
      moderate_count: parseInt(row.moderate_count, 10),
    }));
  } catch (e) {
    if (e.code === '42P01') return [];
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Counts by risk_label for pie chart.
 */
export async function getRiskDistribution() {
  const client = await postgresPool.connect();
  try {
    const r = await client.query(
      `SELECT risk_label AS risk_label, COUNT(*) AS count
       FROM provider_risk_scores
       WHERE risk_label IS NOT NULL
       GROUP BY risk_label
       ORDER BY count DESC`
    );
    return r.rows.map((row) => ({
      risk_label: row.risk_label || 'Unknown',
      count: parseInt(row.count, 10),
    }));
  } catch (e) {
    if (e.code === '42P01') return [];
    throw e;
  } finally {
    client.release();
  }
}
