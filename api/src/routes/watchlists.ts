import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { queryPg } from '../db/postgres';
import { validate } from '../middleware/validate';
import { AppError } from '../middleware/errorHandler';

export const watchlistsRouter = Router();

// TODO: Replace with real auth middleware (req.user.id)
const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';

function getUserId(_req: Request): string {
  return TEST_USER_ID;
}

interface WatchlistRow {
  id: string;
  user_id: string;
  organization_id: string | null;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  shared: boolean;
  created_at: Date;
  updated_at: Date;
}

function assertCanAccessWatchlist(watchlist: WatchlistRow, userId: string): void {
  if (watchlist.user_id !== userId && !watchlist.shared) {
    throw AppError.forbidden('You do not have access to this watchlist');
  }
}

function assertOwnsWatchlist(watchlist: WatchlistRow, userId: string): void {
  if (watchlist.user_id !== userId) {
    throw AppError.forbidden('You do not own this watchlist');
  }
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const uuidParam = z.object({ id: z.string().uuid() });
const idAndNpiParam = z.object({
  id: z.string().uuid(),
  npi: z.string().regex(/^\d{10}$/, 'NPI must be 10 digits'),
});

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional();
const createWatchlistSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be at most 100 characters'),
  description: z.string().max(2000).optional(),
  color: hexColor,
  icon: z.enum(['folder', 'shield', 'alert-triangle', 'star', 'bookmark', 'flag']).optional(),
  shared: z.boolean().optional(),
});

const patchWatchlistSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(2000).optional().nullable(),
  color: hexColor,
  icon: z.enum(['folder', 'shield', 'alert-triangle', 'star', 'bookmark', 'flag']).optional(),
  shared: z.boolean().optional(),
});

const postItemsSchema = z.object({
  npis: z.array(z.string().regex(/^\d{10}$/, 'Each NPI must be 10 digits')).min(1).max(500),
});

const patchItemSchema = z.object({
  notes: z.string().max(2000).optional().nullable(),
});

const eventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// ---------------------------------------------------------------------------
// GET /v1/watchlists — List watchlists for user
// ---------------------------------------------------------------------------
watchlistsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const userId = getUserId(req);
  try {
    const rows = await queryPg<WatchlistRow & { item_count: string }>(
      `SELECT w.*, COUNT(wi.id)::text AS item_count
       FROM watchlists w
       LEFT JOIN watchlist_items wi ON w.id = wi.watchlist_id
       WHERE w.user_id = $1
       GROUP BY w.id
       ORDER BY w.updated_at DESC`,
      [userId]
    );
    const data = rows.map((r) => ({
      ...r,
      item_count: parseInt(r.item_count, 10) || 0,
    }));
    res.json({ data, meta: { query_time_ms: Date.now() - start, total: data.length } });
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------------------
// POST /v1/watchlists — Create watchlist
// ---------------------------------------------------------------------------
watchlistsRouter.post(
  '/',
  validate(createWatchlistSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    const userId = getUserId(req);
    const body = req.body as z.infer<typeof createWatchlistSchema>;
    try {
      const rows = await queryPg<WatchlistRow>(
        `INSERT INTO watchlists (user_id, name, description, color, icon, shared)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          userId,
          body.name,
          body.description ?? null,
          body.color ?? '#6ABF36',
          body.icon ?? 'folder',
          body.shared ?? false,
        ]
      );
      if (rows.length === 0) throw AppError.dbError('Insert did not return row');
      res.status(201).json({ data: rows[0], meta: { query_time_ms: Date.now() - start } });
    } catch (e) {
      next(e);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /v1/watchlists/:id — Get one watchlist
// ---------------------------------------------------------------------------
watchlistsRouter.get(
  '/:id',
  validate(uuidParam, 'params'),
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params as z.infer<typeof uuidParam>;
    const userId = getUserId(req);
    try {
      const rows = await queryPg<WatchlistRow>('SELECT * FROM watchlists WHERE id = $1', [id]);
      if (rows.length === 0) return next(AppError.notFound('Watchlist', id));
      const w = rows[0];
      assertCanAccessWatchlist(w, userId);
      res.json({ data: w, meta: {} });
    } catch (e) {
      next(e);
    }
  }
);

// ---------------------------------------------------------------------------
// PATCH /v1/watchlists/:id
// ---------------------------------------------------------------------------
watchlistsRouter.patch(
  '/:id',
  validate(uuidParam, 'params'),
  validate(patchWatchlistSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params as z.infer<typeof uuidParam>;
    const userId = getUserId(req);
    const body = req.body as z.infer<typeof patchWatchlistSchema>;
    try {
      const existing = await queryPg<WatchlistRow>('SELECT * FROM watchlists WHERE id = $1', [id]);
      if (existing.length === 0) return next(AppError.notFound('Watchlist', id));
      assertOwnsWatchlist(existing[0], userId);

      const updates: string[] = [];
      const params: unknown[] = [];
      let idx = 0;
      if (body.name !== undefined) {
        idx++;
        updates.push(`name = $${idx}`);
        params.push(body.name);
      }
      if (body.description !== undefined) {
        idx++;
        updates.push(`description = $${idx}`);
        params.push(body.description);
      }
      if (body.color !== undefined) {
        idx++;
        updates.push(`color = $${idx}`);
        params.push(body.color);
      }
      if (body.icon !== undefined) {
        idx++;
        updates.push(`icon = $${idx}`);
        params.push(body.icon);
      }
      if (body.shared !== undefined) {
        idx++;
        updates.push(`shared = $${idx}`);
        params.push(body.shared);
      }
      if (updates.length === 0) {
        return res.json({ data: existing[0], meta: {} });
      }
      idx++;
      updates.push(`updated_at = NOW()`);
      params.push(id);
      const sql = `UPDATE watchlists SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`;
      const rows = await queryPg<WatchlistRow>(sql, params);
      res.json({ data: rows[0], meta: {} });
    } catch (e) {
      next(e);
    }
  }
);

// ---------------------------------------------------------------------------
// DELETE /v1/watchlists/:id
// ---------------------------------------------------------------------------
watchlistsRouter.delete(
  '/:id',
  validate(uuidParam, 'params'),
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params as z.infer<typeof uuidParam>;
    const userId = getUserId(req);
    try {
      const existing = await queryPg<WatchlistRow>('SELECT * FROM watchlists WHERE id = $1', [id]);
      if (existing.length === 0) return next(AppError.notFound('Watchlist', id));
      assertOwnsWatchlist(existing[0], userId);
      await queryPg('DELETE FROM watchlists WHERE id = $1', [id]);
      res.json({ data: { deleted: true }, meta: {} });
    } catch (e) {
      next(e);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /v1/watchlists/:id/items
// ---------------------------------------------------------------------------
watchlistsRouter.get(
  '/:id/items',
  validate(uuidParam, 'params'),
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params as z.infer<typeof uuidParam>;
    const userId = getUserId(req);
    try {
      const wl = await queryPg<WatchlistRow>('SELECT * FROM watchlists WHERE id = $1', [id]);
      if (wl.length === 0) return next(AppError.notFound('Watchlist', id));
      assertCanAccessWatchlist(wl[0], userId);

      const rows = await queryPg(
        `SELECT
           wi.id, wi.watchlist_id, wi.npi, wi.entity_type, wi.notes, wi.added_at, wi.added_by_user_id,
           p.display_name AS provider_name,
           p.state,
           p.taxonomy_1 AS taxonomy_code,
           prs.risk_score,
           prs.risk_label,
           (e.npi IS NOT NULL) AS is_excluded
         FROM watchlist_items wi
         LEFT JOIN providers p ON wi.npi = p.npi
         LEFT JOIN provider_risk_scores prs ON wi.npi = prs.npi
         LEFT JOIN exclusions e ON wi.npi = e.npi AND e.reinstated = FALSE
         WHERE wi.watchlist_id = $1
         ORDER BY wi.added_at DESC`,
        [id]
      );
      res.json({ data: rows, meta: { total: rows.length } });
    } catch (e) {
      next(e);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /v1/watchlists/:id/items — Bulk add NPIs
// ---------------------------------------------------------------------------
watchlistsRouter.post(
  '/:id/items',
  validate(uuidParam, 'params'),
  validate(postItemsSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params as z.infer<typeof uuidParam>;
    const userId = getUserId(req);
    const { npis } = req.body as z.infer<typeof postItemsSchema>;
    try {
      const wl = await queryPg<WatchlistRow>('SELECT * FROM watchlists WHERE id = $1', [id]);
      if (wl.length === 0) return next(AppError.notFound('Watchlist', id));
      assertOwnsWatchlist(wl[0], userId);

      let added = 0;
      const addedBy = userId;
      for (const npi of npis) {
        const insert = await queryPg<{ id: string }>(
          `INSERT INTO watchlist_items (watchlist_id, npi, added_by_user_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (watchlist_id, npi) DO NOTHING
           RETURNING id`,
          [id, npi, addedBy]
        );
        if (insert.length > 0) added += 1;
      }
      res.status(201).json({ data: { added }, meta: {} });
    } catch (e) {
      next(e);
    }
  }
);

// ---------------------------------------------------------------------------
// DELETE /v1/watchlists/:id/items/:npi
// ---------------------------------------------------------------------------
watchlistsRouter.delete(
  '/:id/items/:npi',
  validate(idAndNpiParam, 'params'),
  async (req: Request, res: Response, next: NextFunction) => {
    const { id, npi } = req.params as z.infer<typeof idAndNpiParam>;
    const userId = getUserId(req);
    try {
      const wl = await queryPg<WatchlistRow>('SELECT * FROM watchlists WHERE id = $1', [id]);
      if (wl.length === 0) return next(AppError.notFound('Watchlist', id));
      assertOwnsWatchlist(wl[0], userId);
      const deleted = await queryPg(
        'DELETE FROM watchlist_items WHERE watchlist_id = $1 AND npi = $2 RETURNING id',
        [id, npi]
      );
      if (deleted.length === 0) return next(AppError.notFound('Watchlist item', npi));
      res.json({ data: { deleted: true }, meta: {} });
    } catch (e) {
      next(e);
    }
  }
);

// ---------------------------------------------------------------------------
// PATCH /v1/watchlists/:id/items/:npi — Update notes
// ---------------------------------------------------------------------------
watchlistsRouter.patch(
  '/:id/items/:npi',
  validate(idAndNpiParam, 'params'),
  validate(patchItemSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction) => {
    const { id, npi } = req.params as z.infer<typeof idAndNpiParam>;
    const userId = getUserId(req);
    const body = req.body as z.infer<typeof patchItemSchema>;
    try {
      const wl = await queryPg<WatchlistRow>('SELECT * FROM watchlists WHERE id = $1', [id]);
      if (wl.length === 0) return next(AppError.notFound('Watchlist', id));
      assertOwnsWatchlist(wl[0], userId);
      const rows = await queryPg(
        `UPDATE watchlist_items SET notes = $1 WHERE watchlist_id = $2 AND npi = $3 RETURNING *`,
        [body.notes ?? null, id, npi]
      );
      if (rows.length === 0) return next(AppError.notFound('Watchlist item', npi));
      res.json({ data: rows[0], meta: {} });
    } catch (e) {
      next(e);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /v1/watchlists/:id/metrics
// ---------------------------------------------------------------------------
watchlistsRouter.get(
  '/:id/metrics',
  validate(uuidParam, 'params'),
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params as z.infer<typeof uuidParam>;
    const userId = getUserId(req);
    try {
      const wl = await queryPg<WatchlistRow>('SELECT * FROM watchlists WHERE id = $1', [id]);
      if (wl.length === 0) return next(AppError.notFound('Watchlist', id));
      assertCanAccessWatchlist(wl[0], userId);

      const rows = await queryPg<{
        total_items: string;
        high_risk_count: string;
        high_risk_pct: string;
        excluded_count: string;
        avg_risk_score: string | null;
        last_risk_update: Date | null;
      }>(
        `SELECT
           COUNT(*)::text AS total_items,
           COUNT(CASE WHEN prs.risk_label IN ('High', 'Elevated') THEN 1 END)::text AS high_risk_count,
           ROUND(100.0 * COUNT(CASE WHEN prs.risk_label IN ('High', 'Elevated') THEN 1 END) / NULLIF(COUNT(*), 0), 1)::text AS high_risk_pct,
           COUNT(CASE WHEN e.npi IS NOT NULL THEN 1 END)::text AS excluded_count,
           ROUND(AVG(prs.risk_score)::numeric, 2)::text AS avg_risk_score,
           MAX(prs.updated_at) AS last_risk_update
         FROM watchlist_items wi
         LEFT JOIN provider_risk_scores prs ON wi.npi = prs.npi
         LEFT JOIN exclusions e ON wi.npi = e.npi AND e.reinstated = FALSE
         WHERE wi.watchlist_id = $1`,
        [id]
      );
      const r = rows[0];
      if (!r) {
        return res.json({
          data: {
            total_items: 0,
            high_risk_count: 0,
            high_risk_pct: 0,
            excluded_count: 0,
            avg_risk_score: null,
            last_risk_update: null,
          },
          meta: {},
        });
      }
      res.json({
        data: {
          total_items: parseInt(r.total_items, 10) || 0,
          high_risk_count: parseInt(r.high_risk_count, 10) || 0,
          high_risk_pct: parseFloat(r.high_risk_pct) || 0,
          excluded_count: parseInt(r.excluded_count, 10) || 0,
          avg_risk_score: r.avg_risk_score != null ? parseFloat(r.avg_risk_score) : null,
          last_risk_update: r.last_risk_update,
        },
        meta: {},
      });
    } catch (e) {
      next(e);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /v1/watchlists/:id/events — Events scoped to watchlist NPIs
// ---------------------------------------------------------------------------
watchlistsRouter.get(
  '/:id/events',
  validate(uuidParam, 'params'),
  validate(eventsQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params as z.infer<typeof uuidParam>;
    const { limit, offset } = (req.query ?? {}) as unknown as z.infer<typeof eventsQuerySchema>;
    const userId = getUserId(req);
    try {
      const wl = await queryPg<WatchlistRow>('SELECT * FROM watchlists WHERE id = $1', [id]);
      if (wl.length === 0) return next(AppError.notFound('Watchlist', id));
      assertCanAccessWatchlist(wl[0], userId);

      const params: unknown[] = [id, limit, offset];
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
          AND e.npi IN (SELECT npi FROM watchlist_items WHERE watchlist_id = $1)

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
          AND prs.npi IN (SELECT npi FROM watchlist_items WHERE watchlist_id = $1)
      )
      SELECT npi, entity_name, event_type, severity, event_date, description, state
      FROM events_raw
      ORDER BY event_date DESC
      LIMIT $2 OFFSET $3
      `;
      const rows = await queryPg(sql, params);
      const events = rows.map((row: Record<string, unknown>, i: number) => ({
        id: `${row.event_type === 'Exclusion' ? 'excl' : 'risk'}-${row.npi}-${i}`,
        severity: row.severity as 'critical' | 'high' | 'medium' | 'low',
        event_type: row.event_type === 'High Risk Score' ? 'Risk Score Change' : row.event_type,
        provider_name: (row.entity_name as string) || 'Unknown',
        provider_npi: row.npi,
        entity_id: null,
        program: 'All' as const,
        state: row.state,
        timestamp:
          row.event_date instanceof Date
            ? row.event_date.toISOString()
            : (row.event_date as string) ?? new Date().toISOString(),
        description: (row.description as string) || '',
      }));
      res.json({
        data: events,
        meta: { source: 'claidex-v1-neon', total: events.length, limit, offset },
      });
    } catch (e) {
      next(e);
    }
  }
);
