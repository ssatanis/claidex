/**
 * GET /v1/providers/:npi/benchmark
 *
 * Returns a multi-metric, multi-year benchmarking profile for a provider
 * versus a carefully defined peer group using robust statistics.
 *
 * Peer group levels (most → least specific, per year/program):
 *   L1: same taxonomy + state + entity_type, min 100 claims  (≥50 peers required)
 *   L2: same taxonomy + Census division                       (≥50 peers required)
 *   L3: same taxonomy nationally
 *
 * Metrics: payments_per_claim, claims_per_beneficiary, total_payments,
 *          allowed_per_claim (Medicare only)
 *
 * Statistics: PERCENT_RANK percentile, robust z-score (MAD-based on log scale),
 *             flag classification, direction.
 *
 * Summaries: exponential-decay weighted percentile and OLS trend vs. peers,
 *            computed in the application layer from query results.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { queryPg } from '../db/postgres';
import { validate } from '../middleware/validate';
import { AppError } from '../middleware/errorHandler';
import {
  ApiResponse,
  BenchmarkResponse,
  BenchmarkRow,
  BenchmarkEntry,
  BenchmarkPeerDefinition,
  MetricSummary,
  BenchmarkSummaries,
  TrendVsPeers,
  SummaryFlag,
} from '../types/api';

export const benchmarkRouter = Router();

const npiSchema = z.object({
  npi: z.string().regex(/^\d{10}$/, 'NPI must be exactly 10 digits'),
});

// ---------------------------------------------------------------------------
// Census division mapping — hard-coded CASE expression fragment
// ---------------------------------------------------------------------------

const CENSUS_DIVISION_CASE = `
  CASE s
    WHEN 'CT' THEN 'NewEngland'  WHEN 'ME' THEN 'NewEngland'
    WHEN 'MA' THEN 'NewEngland'  WHEN 'NH' THEN 'NewEngland'
    WHEN 'RI' THEN 'NewEngland'  WHEN 'VT' THEN 'NewEngland'
    WHEN 'NJ' THEN 'MidAtlantic' WHEN 'NY' THEN 'MidAtlantic'
    WHEN 'PA' THEN 'MidAtlantic'
    WHEN 'IL' THEN 'EastNorthCentral' WHEN 'IN' THEN 'EastNorthCentral'
    WHEN 'MI' THEN 'EastNorthCentral' WHEN 'OH' THEN 'EastNorthCentral'
    WHEN 'WI' THEN 'EastNorthCentral'
    WHEN 'IA' THEN 'WestNorthCentral' WHEN 'KS' THEN 'WestNorthCentral'
    WHEN 'MN' THEN 'WestNorthCentral' WHEN 'MO' THEN 'WestNorthCentral'
    WHEN 'NE' THEN 'WestNorthCentral' WHEN 'ND' THEN 'WestNorthCentral'
    WHEN 'SD' THEN 'WestNorthCentral'
    WHEN 'DE' THEN 'SouthAtlantic'    WHEN 'FL' THEN 'SouthAtlantic'
    WHEN 'GA' THEN 'SouthAtlantic'    WHEN 'MD' THEN 'SouthAtlantic'
    WHEN 'NC' THEN 'SouthAtlantic'    WHEN 'SC' THEN 'SouthAtlantic'
    WHEN 'VA' THEN 'SouthAtlantic'    WHEN 'DC' THEN 'SouthAtlantic'
    WHEN 'WV' THEN 'SouthAtlantic'
    WHEN 'AL' THEN 'EastSouthCentral' WHEN 'KY' THEN 'EastSouthCentral'
    WHEN 'MS' THEN 'EastSouthCentral' WHEN 'TN' THEN 'EastSouthCentral'
    WHEN 'AR' THEN 'WestSouthCentral' WHEN 'LA' THEN 'WestSouthCentral'
    WHEN 'OK' THEN 'WestSouthCentral' WHEN 'TX' THEN 'WestSouthCentral'
    WHEN 'AZ' THEN 'Mountain'         WHEN 'CO' THEN 'Mountain'
    WHEN 'ID' THEN 'Mountain'         WHEN 'MT' THEN 'Mountain'
    WHEN 'NV' THEN 'Mountain'         WHEN 'NM' THEN 'Mountain'
    WHEN 'UT' THEN 'Mountain'         WHEN 'WY' THEN 'Mountain'
    WHEN 'AK' THEN 'Pacific'          WHEN 'CA' THEN 'Pacific'
    WHEN 'HI' THEN 'Pacific'          WHEN 'OR' THEN 'Pacific'
    WHEN 'WA' THEN 'Pacific'
    ELSE 'Other'
  END
`.trim();

// Reusable CASE keyed on a column alias
const censusDivisionExpr = (col: string) =>
  CENSUS_DIVISION_CASE.replace(/\bs\b/g, col);

// ---------------------------------------------------------------------------
// Main benchmark SQL
// ---------------------------------------------------------------------------

function buildBenchmarkSql(): string {
  return `
WITH
-- ── 1. Target provider's taxonomy / state / entity_type ──────────────────────
provider_info AS (
  SELECT
    taxonomy_1                  AS taxonomy,
    state,
    entity_type_code::TEXT      AS entity_type,
    ${censusDivisionExpr('state')} AS census_division
  FROM providers
  WHERE npi = $1
),

-- ── 2. Unified payments enriched with entity_type + census_division ──────────
payments_enriched AS (
  SELECT
    pc.npi,
    pc.year,
    pc.program,
    pc.payments,
    pc.allowed,
    pc.claims,
    pc.beneficiaries,
    pc.taxonomy,
    pc.state,
    pr.entity_type_code::TEXT                     AS entity_type,
    ${censusDivisionExpr('pc.state')} AS census_division
  FROM payments_combined_v pc
  JOIN providers pr ON pr.npi = pc.npi
),

-- ── 3. Four metrics per NPI/year/program ─────────────────────────────────────
metrics AS (
  SELECT
    npi, year, program, taxonomy, state, entity_type, census_division, claims,
    pe.payments / GREATEST(pe.claims, 1)          AS payments_per_claim,
    pe.claims   / GREATEST(pe.beneficiaries, 1)   AS claims_per_beneficiary,
    pe.payments                                   AS total_payments,
    CASE WHEN pe.allowed IS NOT NULL
         THEN pe.allowed / GREATEST(pe.claims, 1) END AS allowed_per_claim
  FROM payments_enriched pe
),

-- ── 4. Peer counts at three fallback levels ───────────────────────────────────
peer_counts AS (
  SELECT
    m.year,
    m.program,
    COUNT(DISTINCT CASE
      WHEN m.taxonomy     = pi.taxonomy
       AND m.state        = pi.state
       AND m.entity_type  = pi.entity_type
       AND m.claims       >= 100
      THEN m.npi END)                             AS cnt_l1,
    COUNT(DISTINCT CASE
      WHEN m.taxonomy         = pi.taxonomy
       AND m.census_division  = pi.census_division
      THEN m.npi END)                             AS cnt_l2,
    COUNT(DISTINCT CASE
      WHEN m.taxonomy = pi.taxonomy
      THEN m.npi END)                             AS cnt_l3
  FROM metrics m
  CROSS JOIN provider_info pi
  GROUP BY m.year, m.program
),

-- ── 5. Choose the most specific level yielding ≥50 peers ─────────────────────
peer_level AS (
  SELECT
    year,
    program,
    CASE
      WHEN cnt_l1 >= 50 THEN 1
      WHEN cnt_l2 >= 50 THEN 2
      ELSE                   3
    END AS level,
    CASE
      WHEN cnt_l1 >= 50 THEN cnt_l1
      WHEN cnt_l2 >= 50 THEN cnt_l2
      ELSE                   cnt_l3
    END AS peer_count
  FROM peer_counts
),

-- ── 6. Filter metrics to the chosen peer group ───────────────────────────────
peer_metrics AS (
  SELECT m.*, pl.level, pl.peer_count
  FROM metrics m
  JOIN peer_level pl ON pl.year = m.year AND pl.program = m.program
  CROSS JOIN provider_info pi
  WHERE (
    pl.level = 1
    AND m.taxonomy    = pi.taxonomy
    AND m.state       = pi.state
    AND m.entity_type = pi.entity_type
    AND m.claims      >= 100
  ) OR (
    pl.level = 2
    AND m.taxonomy        = pi.taxonomy
    AND m.census_division = pi.census_division
  ) OR (
    pl.level = 3
    AND m.taxonomy = pi.taxonomy
  )
),

-- ── 7. PERCENT_RANK window functions over peer group ─────────────────────────
ranked_peers AS (
  SELECT
    pm.*,
    PERCENT_RANK() OVER (
      PARTITION BY pm.year, pm.program ORDER BY pm.payments_per_claim
    )                                             AS ppc_rank,
    PERCENT_RANK() OVER (
      PARTITION BY pm.year, pm.program ORDER BY pm.claims_per_beneficiary
    )                                             AS cpb_rank,
    PERCENT_RANK() OVER (
      PARTITION BY pm.year, pm.program ORDER BY pm.total_payments
    )                                             AS tp_rank,
    PERCENT_RANK() OVER (
      PARTITION BY pm.year, pm.program ORDER BY pm.allowed_per_claim NULLS FIRST
    )                                             AS apc_rank
  FROM peer_metrics pm
),

-- ── 8. Aggregate stats: median / p10 / p90 ───────────────────────────────────
group_stats AS (
  SELECT
    year, program,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY payments_per_claim)   AS ppc_median,
    PERCENTILE_CONT(0.1) WITHIN GROUP (ORDER BY payments_per_claim)   AS ppc_p10,
    PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY payments_per_claim)   AS ppc_p90,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY claims_per_beneficiary) AS cpb_median,
    PERCENTILE_CONT(0.1) WITHIN GROUP (ORDER BY claims_per_beneficiary) AS cpb_p10,
    PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY claims_per_beneficiary) AS cpb_p90,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_payments)       AS tp_median,
    PERCENTILE_CONT(0.1) WITHIN GROUP (ORDER BY total_payments)       AS tp_p10,
    PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY total_payments)       AS tp_p90,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY allowed_per_claim)    AS apc_median,
    PERCENTILE_CONT(0.1) WITHIN GROUP (ORDER BY allowed_per_claim)    AS apc_p10,
    PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY allowed_per_claim)    AS apc_p90
  FROM ranked_peers
  GROUP BY year, program
),

-- ── 9. Log-scale medians (for robust z-score denominator) ────────────────────
log_medians AS (
  SELECT
    year, program,
    PERCENTILE_CONT(0.5) WITHIN GROUP (
      ORDER BY LN(payments_per_claim + 1)
    )                                             AS ppc_log_med,
    PERCENTILE_CONT(0.5) WITHIN GROUP (
      ORDER BY LN(claims_per_beneficiary + 1)
    )                                             AS cpb_log_med,
    PERCENTILE_CONT(0.5) WITHIN GROUP (
      ORDER BY LN(total_payments + 1)
    )                                             AS tp_log_med,
    PERCENTILE_CONT(0.5) WITHIN GROUP (
      ORDER BY LN(COALESCE(allowed_per_claim, 0) + 1)
    )                                             AS apc_log_med
  FROM ranked_peers
  GROUP BY year, program
),

-- ── 10. MAD on log scale ─────────────────────────────────────────────────────
mad_raw AS (
  SELECT
    rp.year,
    rp.program,
    PERCENTILE_CONT(0.5) WITHIN GROUP (
      ORDER BY ABS(LN(rp.payments_per_claim + 1) - lm.ppc_log_med)
    )                                             AS ppc_mad,
    PERCENTILE_CONT(0.5) WITHIN GROUP (
      ORDER BY ABS(LN(rp.claims_per_beneficiary + 1) - lm.cpb_log_med)
    )                                             AS cpb_mad,
    PERCENTILE_CONT(0.5) WITHIN GROUP (
      ORDER BY ABS(LN(rp.total_payments + 1) - lm.tp_log_med)
    )                                             AS tp_mad,
    PERCENTILE_CONT(0.5) WITHIN GROUP (
      ORDER BY ABS(LN(COALESCE(rp.allowed_per_claim, 0) + 1) - lm.apc_log_med)
    )                                             AS apc_mad
  FROM ranked_peers rp
  JOIN log_medians lm ON lm.year = rp.year AND lm.program = rp.program
  GROUP BY rp.year, rp.program
),

-- ── 11. Target provider's row with ranks and log medians ─────────────────────
target_data AS (
  SELECT rp.*, lm.ppc_log_med, lm.cpb_log_med, lm.tp_log_med, lm.apc_log_med
  FROM ranked_peers rp
  JOIN log_medians lm ON lm.year = rp.year AND lm.program = rp.program
  WHERE rp.npi = $1
),

-- ── 12. Pivot: one row per metric via UNION ALL ───────────────────────────────
pivoted AS (
  -- payments_per_claim
  SELECT
    td.year, td.program, 'payments_per_claim'::TEXT AS metric,
    td.level::INT AS peer_level, td.peer_count::INT,
    td.payments_per_claim                            AS provider_value,
    gs.ppc_median AS peer_median, gs.ppc_p10 AS peer_p10, gs.ppc_p90 AS peer_p90,
    ROUND((td.ppc_rank * 100)::NUMERIC, 0)::INT      AS provider_percentile,
    td.ppc_log_med                                   AS log_med,
    COALESCE(mr.ppc_mad, 0)                          AS mad
  FROM target_data td
  JOIN group_stats gs ON gs.year = td.year AND gs.program = td.program
  JOIN mad_raw     mr ON mr.year = td.year AND mr.program = td.program

  UNION ALL

  -- claims_per_beneficiary
  SELECT
    td.year, td.program, 'claims_per_beneficiary'::TEXT,
    td.level::INT, td.peer_count::INT,
    td.claims_per_beneficiary,
    gs.cpb_median, gs.cpb_p10, gs.cpb_p90,
    ROUND((td.cpb_rank * 100)::NUMERIC, 0)::INT,
    td.cpb_log_med,
    COALESCE(mr.cpb_mad, 0)
  FROM target_data td
  JOIN group_stats gs ON gs.year = td.year AND gs.program = td.program
  JOIN mad_raw     mr ON mr.year = td.year AND mr.program = td.program

  UNION ALL

  -- total_payments
  SELECT
    td.year, td.program, 'total_payments'::TEXT,
    td.level::INT, td.peer_count::INT,
    td.total_payments,
    gs.tp_median, gs.tp_p10, gs.tp_p90,
    ROUND((td.tp_rank * 100)::NUMERIC, 0)::INT,
    td.tp_log_med,
    COALESCE(mr.tp_mad, 0)
  FROM target_data td
  JOIN group_stats gs ON gs.year = td.year AND gs.program = td.program
  JOIN mad_raw     mr ON mr.year = td.year AND mr.program = td.program

  UNION ALL

  -- allowed_per_claim (Medicare only — skip rows where provider has no allowed value)
  SELECT
    td.year, td.program, 'allowed_per_claim'::TEXT,
    td.level::INT, td.peer_count::INT,
    td.allowed_per_claim,
    gs.apc_median, gs.apc_p10, gs.apc_p90,
    ROUND((td.apc_rank * 100)::NUMERIC, 0)::INT,
    td.apc_log_med,
    COALESCE(mr.apc_mad, 0)
  FROM target_data td
  JOIN group_stats gs ON gs.year = td.year AND gs.program = td.program
  JOIN mad_raw     mr ON mr.year = td.year AND mr.program = td.program
  WHERE td.allowed_per_claim IS NOT NULL
)

-- ── 13. Final SELECT: derive z-score, direction, flag ────────────────────────
SELECT
  p.year,
  p.program,
  p.metric,
  p.peer_level,
  p.peer_count,
  ROUND((p.provider_value)::NUMERIC, 4)           AS provider_value,
  ROUND((p.peer_median)::NUMERIC,    4)          AS peer_median,
  ROUND((p.peer_p10)::NUMERIC,       4)          AS peer_p10,
  ROUND((p.peer_p90)::NUMERIC,       4)          AS peer_p90,
  p.provider_percentile,
  -- Robust z-score on log scale: z = (ln(x+1) − log_median) / (1.4826·MAD + δ)
  ROUND(
    ((LN(p.provider_value + 1) - p.log_med)
    / (1.4826 * p.mad + 0.001))::NUMERIC
  , 2)                                            AS z_score,
  -- Direction: compare provider log value to median ± 1 MAD
  CASE
    WHEN (LN(p.provider_value + 1) - p.log_med) >  (1.4826 * p.mad) THEN 'High'
    WHEN (LN(p.provider_value + 1) - p.log_med) < -(1.4826 * p.mad) THEN 'Low'
    ELSE 'Typical'
  END                                            AS direction,
  -- Outlier flag based on percentile OR z-score (whichever is more extreme)
  CASE
    WHEN p.provider_percentile >= 99
      OR ABS(
           (LN(p.provider_value + 1) - p.log_med) / (1.4826 * p.mad + 0.001)
         ) >= 3.5
    THEN 'ExtremeOutlier'
    WHEN p.provider_percentile >= 95
      OR ABS(
           (LN(p.provider_value + 1) - p.log_med) / (1.4826 * p.mad + 0.001)
         ) >= 2.5
    THEN 'Outlier'
    WHEN p.provider_percentile >= 80
      OR ABS(
           (LN(p.provider_value + 1) - p.log_med) / (1.4826 * p.mad + 0.001)
         ) >= 1.5
    THEN 'High'
    ELSE 'Typical'
  END                                            AS flag
FROM pivoted p
ORDER BY p.year DESC, p.program, p.metric
  `.trim();
}

// ---------------------------------------------------------------------------
// Provider-info SQL (taxonomy, state, entity_type for top-level response)
// ---------------------------------------------------------------------------

interface ProviderInfoRow {
  taxonomy: string | null;
  state: string | null;
  entity_type: string | null;
}

// ---------------------------------------------------------------------------
// Summaries: computed in TypeScript from benchmark rows
// ---------------------------------------------------------------------------

function olsSlope(pairs: [number, number][]): number {
  if (pairs.length < 2) return 0;
  const n = pairs.length;
  const sumX  = pairs.reduce((a, [x]) => a + x, 0);
  const sumY  = pairs.reduce((a, [, y]) => a + y, 0);
  const sumXY = pairs.reduce((a, [x, y]) => a + x * y, 0);
  const sumX2 = pairs.reduce((a, [x]) => a + x * x, 0);
  const denom = n * sumX2 - sumX * sumX;
  return denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
}

function computeWeightedPercentile(
  rows: BenchmarkRow[],
  metric: string,
  program: string,
  alpha = 0.7
): number {
  const subset = rows.filter((r) => r.metric === metric && r.program === program);
  if (subset.length === 0) return 0;
  const maxYear = Math.max(...subset.map((r) => r.year));
  let weightedSum = 0;
  let weightSum = 0;
  for (const r of subset) {
    const w = Math.pow(alpha, maxYear - r.year);
    weightedSum += w * r.provider_percentile;
    weightSum += w;
  }
  return weightSum === 0 ? 0 : Math.round(weightedSum / weightSum);
}

function computeTrend(
  rows: BenchmarkRow[],
  metric: string,
  program: string
): TrendVsPeers {
  const subset = rows
    .filter((r) => r.metric === metric && r.program === program)
    .sort((a, b) => a.year - b.year);
  if (subset.length < 2) return 'stable';

  const providerSlope = olsSlope(
    subset.map((r) => [r.year, toNum(r.provider_value)])
  );
  const peerSlope = olsSlope(
    subset.map((r) => [r.year, toNum(r.peer_median)])
  );
  const diff = providerSlope - peerSlope;

  // Threshold: 5% of the average peer median as "meaningful" difference
  const avgPeerMedian =
    subset.reduce((a, r) => a + toNum(r.peer_median), 0) / subset.length;
  const threshold = avgPeerMedian * 0.05;

  if (diff > threshold)  return 'growing_faster';
  if (diff < -threshold) return 'growing_slower';

  // Both declining vs. both flat
  if (providerSlope < -threshold) return 'declining';
  return 'stable';
}

function computeSummaryFlag(
  weightedPercentile: number,
  trend: TrendVsPeers
): SummaryFlag {
  if (weightedPercentile >= 80) {
    if (trend === 'growing_faster') return 'persistent_high';
    if (trend === 'declining' || trend === 'growing_slower') return 'improving';
    return 'persistent_high';
  }
  if (trend === 'growing_faster') return 'worsening';
  if (trend === 'declining')      return 'improving';
  return 'persistent_typical';
}

function toNum(v: string | number, fallback = 0): number {
  if (v === null || v === undefined) return fallback;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return isNaN(n) ? fallback : n;
}

function buildSummaries(rows: BenchmarkRow[]): BenchmarkSummaries {
  const maxYear = Math.max(...rows.map((r) => r.year));
  const minYear = maxYear - 4; // last 5 years inclusive
  const recentRows = rows.filter((r) => r.year >= minYear);
  const recentYears = [...new Set(recentRows.map((r) => r.year))].sort();

  // Unique metric+program combinations
  const combos = [
    ...new Map(
      recentRows.map((r) => [`${r.metric}::${r.program}`, { metric: r.metric, program: r.program }])
    ).values(),
  ];

  const metrics: MetricSummary[] = combos.map(({ metric, program }) => {
    const weighted_percentile = computeWeightedPercentile(recentRows, metric, program);
    const trend_vs_peers       = computeTrend(recentRows, metric, program);
    const summary_flag         = computeSummaryFlag(weighted_percentile, trend_vs_peers);
    return { metric, program, weighted_percentile, trend_vs_peers, summary_flag };
  });

  return { recent_years: recentYears, metrics };
}

// ---------------------------------------------------------------------------
// Build peer_definition from rows (use the most recent year's assignment)
// ---------------------------------------------------------------------------

function buildPeerDefinition(
  rows: BenchmarkRow[],
  providerInfo: ProviderInfoRow
): BenchmarkPeerDefinition {
  // Use most recent year, primary programs order
  const sorted = [...rows].sort((a, b) => b.year - a.year);
  const representative = sorted[0];
  if (!representative) {
    return { level: 3, taxonomy: providerInfo.taxonomy ?? 'Unknown' };
  }

  const level = representative.peer_level as 1 | 2 | 3;
  const base: BenchmarkPeerDefinition = {
    level,
    taxonomy: providerInfo.taxonomy ?? 'Unknown',
  };

  if (level === 1) {
    return {
      ...base,
      state:       providerInfo.state       ?? undefined,
      entity_type: providerInfo.entity_type ?? undefined,
      min_claims:  100,
    };
  }
  if (level === 2) {
    // Re-derive census division from state
    const stateMap: Record<string, string> = {
      CT:'NewEngland', ME:'NewEngland', MA:'NewEngland', NH:'NewEngland',
      RI:'NewEngland', VT:'NewEngland',
      NJ:'MidAtlantic', NY:'MidAtlantic', PA:'MidAtlantic',
      IL:'EastNorthCentral', IN:'EastNorthCentral', MI:'EastNorthCentral',
      OH:'EastNorthCentral', WI:'EastNorthCentral',
      IA:'WestNorthCentral', KS:'WestNorthCentral', MN:'WestNorthCentral',
      MO:'WestNorthCentral', NE:'WestNorthCentral', ND:'WestNorthCentral',
      SD:'WestNorthCentral',
      DE:'SouthAtlantic', FL:'SouthAtlantic', GA:'SouthAtlantic',
      MD:'SouthAtlantic', NC:'SouthAtlantic', SC:'SouthAtlantic',
      VA:'SouthAtlantic', DC:'SouthAtlantic', WV:'SouthAtlantic',
      AL:'EastSouthCentral', KY:'EastSouthCentral', MS:'EastSouthCentral',
      TN:'EastSouthCentral',
      AR:'WestSouthCentral', LA:'WestSouthCentral', OK:'WestSouthCentral',
      TX:'WestSouthCentral',
      AZ:'Mountain', CO:'Mountain', ID:'Mountain', MT:'Mountain',
      NV:'Mountain', NM:'Mountain', UT:'Mountain', WY:'Mountain',
      AK:'Pacific', CA:'Pacific', HI:'Pacific', OR:'Pacific', WA:'Pacific',
    };
    return {
      ...base,
      census_division: stateMap[providerInfo.state ?? ''] ?? 'Other',
    };
  }
  return base;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

benchmarkRouter.get(
  '/:npi/benchmark',
  validate(npiSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const start = Date.now();
    const { npi } = req.params as z.infer<typeof npiSchema>;

    try {
      // Fetch provider metadata
      const infoRows = await queryPg<ProviderInfoRow>(
        `SELECT taxonomy_1 AS taxonomy, state, entity_type_code::TEXT AS entity_type
         FROM providers WHERE npi = $1`,
        [npi]
      );

      if (infoRows.length === 0) {
        return next(AppError.notFound('Provider', npi));
      }
      const providerInfo = infoRows[0];

      // Run main benchmark CTE
      const rows = await queryPg<BenchmarkRow>(buildBenchmarkSql(), [npi]);

      if (rows.length === 0) {
        return next(
          new AppError(
            'NOT_FOUND',
            `No payment data found for NPI ${npi}`,
            404,
            'Provider exists but has no payment records to benchmark against.'
          )
        );
      }

      // Build benchmarks array
      const benchmarks: BenchmarkEntry[] = rows.map((r) => ({
        year:                r.year,
        program:             r.program,
        metric:              r.metric,
        provider_value:      toNum(r.provider_value),
        peer_median:         toNum(r.peer_median),
        peer_p10:            toNum(r.peer_p10),
        peer_p90:            toNum(r.peer_p90),
        provider_percentile: r.provider_percentile,
        z_score:             toNum(r.z_score),
        direction:           r.direction as BenchmarkEntry['direction'],
        flag:                r.flag      as BenchmarkEntry['flag'],
      }));

      const peerDef    = buildPeerDefinition(rows, providerInfo);
      const peerCount  = rows[0].peer_count;
      const summaries: BenchmarkSummaries = buildSummaries(rows);

      const response: BenchmarkResponse = {
        npi,
        taxonomy:        providerInfo.taxonomy ?? 'Unknown',
        state:           providerInfo.state    ?? 'Unknown',
        peer_definition: peerDef,
        peer_count:      peerCount,
        benchmarks,
        summaries,
      };

      const body: ApiResponse<BenchmarkResponse> = {
        data: response,
        meta: { source: 'claidex-v1', query_time_ms: Date.now() - start },
      };

      res.json(body);
    } catch (err) {
      next(err);
    }
  }
);
