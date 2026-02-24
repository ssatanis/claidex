/**
 * HCRIS financials service: facility-level financials for a provider NPI,
 * with peer (facility_type + state) medians and margin percentile.
 */

import { postgresPool } from '../db/postgres.js';

/**
 * Get HCRIS financials for a given NPI: all years, sorted descending,
 * with peer median operating_margin_pct, peer median revenue_per_patient_day,
 * and peer_margin_percentile (0–100) within same facility_type + state + year.
 *
 * @param {string} npi - 10-digit NPI
 * @returns {Promise<{ npi, financials: Array, meta: { data_source, link_type } } | null>}
 */
export async function getFinancialsByNpi(npi) {
  const normalizedNpi = String(npi).trim().padStart(10, '0');

  const query = `
    WITH peer_medians AS (
      SELECT facility_type, state, year,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY operating_margin_pct) AS median_margin,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY revenue_per_patient_day) AS median_rev
      FROM hcris_financials
      WHERE npi IS NOT NULL AND facility_type IS NOT NULL AND state IS NOT NULL
        AND (operating_margin_pct IS NOT NULL OR revenue_per_patient_day IS NOT NULL)
      GROUP BY facility_type, state, year
    ),
    with_rank AS (
      SELECT npi, ccn, year, facility_type, state,
        PERCENT_RANK() OVER (
          PARTITION BY facility_type, state, year
          ORDER BY operating_margin_pct NULLS LAST
        ) AS margin_pct_rank
      FROM hcris_financials
      WHERE npi IS NOT NULL AND facility_type IS NOT NULL AND state IS NOT NULL
    )
    SELECT
      w.npi,
      w.year,
      w.facility_name,
      w.state,
      w.facility_type,
      w.net_patient_revenue,
      w.total_operating_costs,
      w.operating_margin_pct,
      w.medicare_payer_mix_pct,
      w.medicaid_payer_mix_pct,
      w.total_beds,
      w.total_patient_days,
      w.revenue_per_patient_day,
      p.median_margin AS peer_median_operating_margin_pct,
      p.median_rev AS peer_median_revenue_per_patient_day,
      CASE WHEN wr.margin_pct_rank IS NOT NULL
        THEN LEAST(100, GREATEST(0, ROUND((wr.margin_pct_rank * 100)::numeric, 0)))
        ELSE NULL
      END AS peer_margin_percentile,
      w.link_type
    FROM hcris_financials w
    LEFT JOIN peer_medians p
      ON p.facility_type = w.facility_type AND p.state = w.state AND p.year = w.year
    LEFT JOIN with_rank wr
      ON wr.npi = w.npi AND wr.ccn = w.ccn AND wr.year = w.year
    WHERE w.npi = $1
    ORDER BY w.year DESC
  `;

  const { rows } = await postgresPool.query(query, [normalizedNpi]);
  if (!rows || rows.length === 0) return null;

  const linkType = rows[0]?.link_type ?? 'unknown';

  const financials = rows.map((r) => ({
    year: r.year,
    facility_name: r.facility_name ?? undefined,
    state: r.state ?? undefined,
    facility_type: r.facility_type ?? undefined,
    net_patient_revenue: r.net_patient_revenue != null ? Number(r.net_patient_revenue) : undefined,
    total_operating_costs: r.total_operating_costs != null ? Number(r.total_operating_costs) : undefined,
    operating_margin_pct: r.operating_margin_pct != null ? Number(r.operating_margin_pct) : undefined,
    medicare_payer_mix_pct: r.medicare_payer_mix_pct != null ? Number(r.medicare_payer_mix_pct) : undefined,
    medicaid_payer_mix_pct: r.medicaid_payer_mix_pct != null ? Number(r.medicaid_payer_mix_pct) : undefined,
    total_beds: r.total_beds != null ? Number(r.total_beds) : undefined,
    total_patient_days: r.total_patient_days != null ? Number(r.total_patient_days) : undefined,
    revenue_per_patient_day: r.revenue_per_patient_day != null ? Number(r.revenue_per_patient_day) : undefined,
    peer_median_operating_margin_pct: r.peer_median_operating_margin_pct != null ? Number(r.peer_median_operating_margin_pct) : undefined,
    peer_median_revenue_per_patient_day: r.peer_median_revenue_per_patient_day != null ? Number(r.peer_median_revenue_per_patient_day) : undefined,
    peer_margin_percentile: r.peer_margin_percentile != null ? Number(r.peer_margin_percentile) : undefined,
  }));

  return {
    npi: normalizedNpi,
    financials,
    meta: {
      data_source: 'HCRIS + POS',
      link_type: linkType,
    },
  };
}
