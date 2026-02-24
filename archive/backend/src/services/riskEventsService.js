import { postgresPool } from '../db/postgres.js';

const LABEL_TO_SEVERITY = {
  High: 'critical',
  Elevated: 'high',
  Moderate: 'medium',
  Low: 'low',
};

/**
 * Build risk events from exclusions (Exclusion) and from provider_risk_scores
 * (Risk Score Change using updated_at). Supports program, severity, limit, offset.
 * Compatible with Neon Postgres.
 */
export async function getRiskEvents({
  program,
  severity,
  event_type,
  state,
  limit = 50,
  offset = 0,
} = {}) {
  const client = await postgresPool.connect();
  try {
    const events = [];
    const fetchLimit = Math.min(500, (limit + offset) * 2);

    // 1) Exclusion events: active exclusions
    if (!event_type || event_type === 'all' || event_type === 'Exclusion') {
      let exclWhere = 'e.reinstated = FALSE';
      const exclParams = [fetchLimit];
      if (state) {
        exclWhere += ' AND e.state = $2';
        exclParams.push(state);
      }
      const exclQuery = `
        SELECT e.exclusion_id, e.npi, e.display_name, e.excldate, e.state
        FROM exclusions e
        WHERE ${exclWhere}
        ORDER BY e.excldate DESC NULLS LAST
        LIMIT $1`;
      const exclRes = await client.query(exclQuery, exclParams);
      for (const row of exclRes.rows) {
        const sev = 'critical';
        if (severity && severity !== 'all' && sev !== severity) continue;
        events.push({
          id: `excl-${row.exclusion_id}`,
          severity: sev,
          event_type: 'Exclusion',
          provider_name: row.display_name || `NPI ${row.npi || 'N/A'}`,
          provider_npi: row.npi || null,
          program: 'All',
          state: row.state || null,
          timestamp: row.excldate
            ? new Date(row.excldate).toISOString()
            : new Date().toISOString(),
          description: `Provider excluded from federal healthcare programs.`,
        });
      }
    }

    // 2) Risk Score Change events: high/elevated risk providers by updated_at
    if (!event_type || event_type === 'all' || event_type === 'Risk Score Change') {
      let riskWhere =
        "prs.risk_label IN ('High', 'Elevated') AND prs.updated_at IS NOT NULL";
      const riskParams = [fetchLimit];
      let paramIdx = 2;
      if (severity && severity !== 'all') {
        const label =
          severity === 'critical' ? 'High' : severity === 'high' ? 'Elevated' : null;
        if (label) {
          riskWhere += ` AND prs.risk_label = $${paramIdx++}`;
          riskParams.push(label);
        }
      }
      if (state) {
        riskWhere += ` AND p.state = $${paramIdx++}`;
        riskParams.push(state);
      }
      riskParams[0] = fetchLimit;
      const riskQuery = `
        SELECT prs.npi, prs.risk_label, prs.updated_at, p.display_name, p.state
        FROM provider_risk_scores prs
        LEFT JOIN providers p ON p.npi = prs.npi
        WHERE ${riskWhere}
        ORDER BY prs.updated_at DESC
        LIMIT $1`;
      const riskRes = await client.query(riskQuery, riskParams);
      for (const row of riskRes.rows) {
        const sev = LABEL_TO_SEVERITY[row.risk_label] || 'medium';
        if (severity && severity !== 'all' && sev !== severity) continue;
        events.push({
          id: `risk-${row.npi}-${row.updated_at?.getTime?.() ?? row.updated_at}`,
          severity: sev,
          event_type: 'Risk Score Change',
          provider_name: row.display_name || `NPI ${row.npi}`,
          provider_npi: row.npi,
          program: 'All',
          state: row.state || null,
          timestamp:
            row.updated_at instanceof Date
              ? row.updated_at.toISOString()
              : new Date(row.updated_at).toISOString(),
          description: `Risk score updated; current label: ${row.risk_label}.`,
        });
      }
    }

    events.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    const sliced = events.slice(offset, offset + limit);
    return sliced;
  } catch (e) {
    if (e.code === '42P01') return [];
    throw e;
  } finally {
    client.release();
  }
}
