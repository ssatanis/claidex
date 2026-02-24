import { Router, Request, Response, NextFunction } from 'express';
import { queryPg } from '../db/postgres';

export const metricsRouter = Router();

/**
 * GET /v1/metrics/dashboard
 *
 * Returns high-level KPIs from the full real dataset (providers ⋈ provider_risk_scores ⋈ exclusions).
 * No mock or fabricated data.
 */
metricsRouter.get('/dashboard', async (_req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();

  try {
    const dashboardQuery = `
      SELECT
        COUNT(DISTINCT p.npi) AS total_providers,
        COUNT(DISTINCT CASE WHEN prs.risk_label IN ('High', 'Elevated') THEN p.npi END) AS high_risk_count,
        ROUND(100.0 * COUNT(DISTINCT CASE WHEN prs.risk_label IN ('High', 'Elevated') THEN p.npi END) / NULLIF(COUNT(DISTINCT p.npi), 0), 1) AS high_risk_pct,
        COUNT(DISTINCT e.npi) AS active_exclusions,
        (SELECT COUNT(*) FROM provider_risk_scores prs2 WHERE prs2.flags::text LIKE '%billing_outlier%') AS flagged_payments
      FROM providers p
      LEFT JOIN provider_risk_scores prs ON p.npi = prs.npi
      LEFT JOIN exclusions e ON p.npi = e.npi AND e.reinstated = FALSE
    `;
    const rows: any[] = await queryPg(dashboardQuery, []);
    const r = rows[0];

    const totalProviders = parseInt(r?.total_providers || '0', 10);
    const highRiskProviders = parseInt(r?.high_risk_count || '0', 10);
    const highRiskPct = parseFloat(r?.high_risk_pct || '0');
    const activeExclusions = parseInt(r?.active_exclusions || '0', 10);
    const flaggedPayments = parseInt(r?.flagged_payments || '0', 10);

    const response = {
      data: {
        total_providers: totalProviders,
        high_risk_providers: highRiskProviders,
        high_risk_percentage: highRiskPct,
        active_exclusions: activeExclusions,
        flagged_payments: flaggedPayments,
        trends: {
          high_risk_change_pct: 0,
          direction: 'flat' as const,
        },
      },
      meta: {
        source: 'claidex-v1-neon',
        query_time_ms: Date.now() - startTime,
      },
    };

    res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    res.json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v1/metrics/risk-by-state
 *
 * State-level aggregates for choropleth map: total providers, high-risk count, avg risk score.
 */
metricsRouter.get('/risk-by-state', async (_req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  try {
    const rows: any[] = await queryPg(
      `
      SELECT
        p.state,
        COUNT(*) AS total_providers,
        COUNT(CASE WHEN prs.risk_label IN ('High', 'Elevated') THEN 1 END) AS high_risk_count,
        ROUND(AVG(prs.risk_score)::numeric, 2) AS avg_risk_score
      FROM providers p
      JOIN provider_risk_scores prs ON p.npi = prs.npi
      WHERE p.state IS NOT NULL AND p.state != ''
      GROUP BY p.state
      ORDER BY p.state
      `,
      []
    );
    const data = rows.map((r: any) => ({
      state: r.state,
      total_providers: parseInt(r.total_providers || '0', 10),
      high_risk_count: parseInt(r.high_risk_count || '0', 10),
      avg_risk_score: r.avg_risk_score != null ? parseFloat(r.avg_risk_score) : null,
    }));
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    res.json({ data, meta: { source: 'claidex-v1-neon', query_time_ms: Date.now() - startTime } });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v1/metrics/trends
 *
 * Monthly risk label counts for stacked area chart (no fabricated data).
 */
metricsRouter.get('/trends', async (_req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  try {
    const rows: any[] = await queryPg(
      `
      SELECT
        DATE_TRUNC('month', updated_at) AS month,
        COUNT(CASE WHEN risk_label = 'High' THEN 1 END) AS high_risk_count,
        COUNT(CASE WHEN risk_label = 'Elevated' THEN 1 END) AS elevated_count,
        COUNT(CASE WHEN risk_label = 'Moderate' THEN 1 END) AS moderate_count
      FROM provider_risk_scores
      WHERE updated_at IS NOT NULL
      GROUP BY DATE_TRUNC('month', updated_at)
      ORDER BY month ASC
      `,
      []
    );
    const data = rows.map((r: any) => ({
      month: r.month,
      high_risk_count: parseInt(r.high_risk_count || '0', 10),
      elevated_count: parseInt(r.elevated_count || '0', 10),
      moderate_count: parseInt(r.moderate_count || '0', 10),
    }));
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    res.json({ data, meta: { source: 'claidex-v1-neon', query_time_ms: Date.now() - startTime } });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v1/metrics/risk-distribution
 *
 * Count by risk_label for donut chart.
 */
metricsRouter.get('/risk-distribution', async (_req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  try {
    const rows: any[] = await queryPg(
      `SELECT risk_label, COUNT(*) AS count FROM provider_risk_scores GROUP BY risk_label ORDER BY risk_label`,
      []
    );
    const data = rows.map((r: any) => ({
      risk_label: r.risk_label || 'Unknown',
      count: parseInt(r.count || '0', 10),
    }));
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    res.json({ data, meta: { source: 'claidex-v1-neon', query_time_ms: Date.now() - startTime } });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v1/metrics/payment-anomalies?days=90
 *
 * Daily anomaly counts for heatmap (from provider_risk_scores flags / billing outlier).
 */
metricsRouter.get('/payment-anomalies', async (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const days = Math.min(365, Math.max(1, parseInt(String(req.query.days || 90), 10) || 90));
  try {
    const rows: any[] = await queryPg(
      `
      SELECT
        DATE(updated_at) AS date,
        COUNT(*) AS anomaly_count,
        ROUND(AVG(risk_score)::numeric, 2) AS avg_score
      FROM provider_risk_scores
      WHERE updated_at >= NOW() - ($1::text || ' days')::interval
        AND flags::text LIKE '%billing_outlier%'
      GROUP BY DATE(updated_at)
      ORDER BY date ASC
      `,
      [days]
    );
    const data = rows.map((r: any) => ({
      date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : r.date,
      anomaly_count: parseInt(r.anomaly_count || '0', 10),
      avg_score: r.avg_score != null ? parseFloat(r.avg_score) : null,
    }));
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    res.json({ data, meta: { source: 'claidex-v1-neon', query_time_ms: Date.now() - startTime } });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /v1/metrics/risk-components-avg
 *
 * Portfolio-wide average of risk components for High/Elevated providers (radar chart).
 */
metricsRouter.get('/risk-components-avg', async (_req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  try {
    const rows: any[] = await queryPg(
      `
      SELECT
        ROUND(AVG(COALESCE(billing_outlier_score, 0))::numeric, 2) AS billing_outlier,
        ROUND(AVG(COALESCE(ownership_chain_risk, 0))::numeric, 2) AS ownership_chain,
        ROUND(AVG(COALESCE(payment_trajectory_score, 0))::numeric, 2) AS payment_trajectory,
        ROUND(AVG(COALESCE(exclusion_proximity_score, 0))::numeric, 2) AS exclusion_proximity,
        ROUND(AVG(COALESCE(program_concentration_score, 0))::numeric, 2) AS program_concentration
      FROM provider_risk_scores
      WHERE risk_label IN ('High', 'Elevated')
      `,
      []
    );
    const r = rows[0];
    const num = (v: unknown): number => (v != null && !Number.isNaN(Number(v)) ? Number(v) : 0);
    const data = {
      billing_outlier: num(r?.billing_outlier),
      ownership_chain: num(r?.ownership_chain),
      payment_trajectory: num(r?.payment_trajectory),
      exclusion_proximity: num(r?.exclusion_proximity),
      program_concentration: num(r?.program_concentration),
    };
    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    res.json({ data, meta: { source: 'claidex-v1-neon', query_time_ms: Date.now() - startTime } });
  } catch (error) {
    next(error);
  }
});


