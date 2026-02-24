import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { queryPg } from '../db/postgres';
import { validate } from '../middleware/validate';

export const searchRouter = Router();

const searchQuerySchema = z.object({
  q: z.string().min(2, 'Search query must be at least 2 characters'),
  type: z.enum(['provider', 'entity', 'person']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * GET /v1/search
 *
 * Full-text search over real providers (display_name, npi, city) with ts_rank.
 * Uses GIN index idx_providers_fts when available.
 */
searchRouter.get('/', validate(searchQuerySchema, 'query'), async (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const { q, type, limit } = req.query as unknown as z.infer<typeof searchQuerySchema>;

  try {
    const results: any[] = [];

    if (!type || type === 'provider') {
      const searchQuery = `
        SELECT
          p.npi,
          p.display_name AS name,
          p.entity_type_code,
          p.city,
          p.state,
          p.zip,
          p.taxonomy_1 AS taxonomy,
          p.is_excluded,
          prs.risk_label,
          prs.risk_score,
          ts_rank(
            to_tsvector('english', coalesce(p.display_name,'') || ' ' || coalesce(p.npi,'') || ' ' || coalesce(p.city,'')),
            plainto_tsquery('english', $1)
          ) AS rank
        FROM providers p
        LEFT JOIN provider_risk_scores prs ON p.npi = prs.npi
        WHERE to_tsvector('english', coalesce(p.display_name,'') || ' ' || coalesce(p.npi,'') || ' ' || coalesce(p.city,''))
              @@ plainto_tsquery('english', $1)
        ORDER BY rank DESC
        LIMIT $2
      `;

      const searchResult: any = await queryPg(searchQuery, [q.trim(), limit]);

      for (const row of searchResult) {
        results.push({
          type: 'Provider',
          data: {
            npi: row.npi,
            name: row.name ?? '',
            entityType: row.entity_type_code === 2 ? 'Organization' : row.entity_type_code === 1 ? 'Individual' : null,
            city: row.city ?? null,
            state: row.state ?? null,
            zip: row.zip ?? null,
            taxonomy: row.taxonomy ?? null,
            isExcluded: Boolean(row.is_excluded),
            risk_label: row.risk_label ?? null,
            risk_score: row.risk_score != null ? Number(row.risk_score) : null,
          },
        });
      }
    }

    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    res.json({
      data: results,
      meta: {
        source: 'claidex-v1-neon',
        query_time_ms: Date.now() - startTime,
        total: results.length,
      },
    });
  } catch (error) {
    next(error);
  }
});
