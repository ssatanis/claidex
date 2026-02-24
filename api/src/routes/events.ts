import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { queryPg } from '../db/postgres';
import { validate } from '../middleware/validate';

export const eventsRouter = Router();

const eventsQuerySchema = z.object({
  program: z.enum(['Medicare', 'Medicaid', 'All']).optional(),
  severity: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  event_type: z.enum(['Exclusion', 'Payment Spike', 'Ownership Change', 'Risk Score Change']).optional(),
  state: z.string().length(2).optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  npi: z.string().regex(/^\d{10}$/).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * GET /v1/events
 *
 * Real events feed from exclusions and high-risk provider_risk_scores only.
 * No fabricated records. Supports severity, event_type, state, date_from, date_to, npi.
 */
eventsRouter.get('/', validate(eventsQuerySchema, 'query'), async (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const { severity, event_type, state, date_from, date_to, npi, limit, offset } = req.query as unknown as z.infer<typeof eventsQuerySchema>;

  try {
    const params: unknown[] = [];
    let paramIdx = 0;

    let whereClause = ' WHERE 1=1 ';
    if (state) {
      paramIdx++;
      whereClause += ` AND state = $${paramIdx}`;
      params.push(state);
    }
    if (date_from) {
      paramIdx++;
      whereClause += ` AND event_date >= $${paramIdx}::date`;
      params.push(date_from);
    }
    if (date_to) {
      paramIdx++;
      whereClause += ` AND event_date <= $${paramIdx}::date`;
      params.push(date_to);
    }
    if (npi) {
      paramIdx++;
      whereClause += ` AND npi = $${paramIdx}`;
      params.push(npi);
    }
    if (severity) {
      paramIdx++;
      whereClause += ` AND severity = $${paramIdx}`;
      params.push(severity);
    }
    if (event_type) {
      paramIdx++;
      const dbEventType = event_type === 'Risk Score Change' ? 'High Risk Score' : event_type;
      whereClause += ` AND event_type = $${paramIdx}`;
      params.push(dbEventType);
    }

    paramIdx++;
    params.push(limit);
    paramIdx++;
    params.push(offset);

    const sql = `
      WITH events_raw AS (
        SELECT
          e.npi,
          COALESCE(p.display_name, e.display_name, e.business_name, 'NPI ' || COALESCE(e.npi, 'N/A')) AS entity_name,
          'Exclusion' AS event_type,
          'critical' AS severity,
          e.excldate AS event_date,
          COALESCE(e.excl_type_label, 'Excluded') AS description,
          COALESCE(p.state, e.state) AS state
        FROM exclusions e
        LEFT JOIN providers p ON e.npi = p.npi
        WHERE e.reinstated = FALSE

        UNION ALL

        SELECT
          prs.npi,
          COALESCE(p.display_name, 'NPI ' || prs.npi) AS entity_name,
          'High Risk Score' AS event_type,
          CASE WHEN prs.risk_label = 'High' THEN 'critical' ELSE 'high' END AS severity,
          prs.updated_at AS event_date,
          CONCAT('Risk score: ', ROUND(prs.risk_score::numeric, 1), ' — ', prs.risk_label) AS description,
          p.state
        FROM provider_risk_scores prs
        LEFT JOIN providers p ON prs.npi = p.npi
        WHERE prs.risk_label IN ('High', 'Elevated')
      )
      SELECT npi, entity_name, event_type, severity, event_date, description, state
      FROM events_raw
      ${whereClause}
      ORDER BY event_date DESC
      LIMIT $${paramIdx - 1} OFFSET $${paramIdx}
    `;

    const rows: any[] = await queryPg(sql, params);

    const events = rows.map((row: any, i: number) => ({
      id: `${row.event_type === 'Exclusion' ? 'excl' : 'risk'}-${row.npi}-${i}`,
      severity: row.severity as 'critical' | 'high' | 'medium' | 'low',
      event_type: row.event_type === 'High Risk Score' ? 'Risk Score Change' : row.event_type,
      provider_name: row.entity_name || 'Unknown',
      provider_npi: row.npi,
      entity_id: null,
      program: 'All' as const,
      state: row.state,
      timestamp: row.event_date instanceof Date ? row.event_date.toISOString() : (row.event_date ?? new Date().toISOString()),
      description: row.description || '',
    }));

    res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
    res.json({
      data: events,
      meta: {
        source: 'claidex-v1-neon',
        query_time_ms: Date.now() - startTime,
        total: events.length,
        limit,
        offset,
      },
    });
  } catch (error) {
    next(error);
  }
});
