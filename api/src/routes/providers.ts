import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { runCypher } from '../db/neo4j';
import { queryPg } from '../db/postgres';
import { validate } from '../middleware/validate';
import { AppError } from '../middleware/errorHandler';
import {
  ApiResponse,
  ProviderDetail,
  PaymentSummary,
  Exclusion,
  toNumber,
  toStr,
  toBool,
} from '../types/api';

const LOG_PREFIX = '[providers]';

// Sanity checks (from repo root):
//   ./scripts/docker-up.sh postgres neo4j
//   python scripts/check_neo4j_basic.py   # confirm >0 Provider nodes
//   cd api && npm run build && npm start
//   curl "http://localhost:4001/v1/providers/1316250707"
//   curl "http://localhost:4001/v1/providers/1942248901"
// Expect: HTTP 200, data.provider + data.payments; meta.graph_partial may be true if Neo4j failed.

export const providersRouter = Router();

const npiSchema = z.object({
  npi: z
    .string()
    .regex(/^\d{10}$/, 'NPI must be exactly 10 digits'),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  q: z.string().optional(),
  state: z.string().length(2).optional(),
  risk_label: z.string().optional(),
  taxonomy: z.string().optional(),
  program: z.enum(['Medicare', 'Medicaid', 'All']).optional(),
  sort: z.enum(['risk_score', 'name', 'updated_at']).optional(),
  order: z.enum(['asc', 'desc']).default('asc'),
});

/** Map Postgres entity_type_code (1=Individual, 2=Organization) to API entityType. */
function entityTypeFromCode(code: number | null): string | null {
  if (code === null || code === undefined) return null;
  return code === 2 ? 'Organization' : code === 1 ? 'Individual' : String(code);
}

/**
 * Fetch exclusions from Neo4j. Never throws: on any error returns empty exclusions
 * and graph_error so the endpoint can return 200 with graph_partial: true.
 */
async function fetchExclusionsFromNeo4j(npi: string): Promise<{
  exclusions: Exclusion[];
  graphError?: string;
  graphPartial: boolean;
}> {
  const empty = { exclusions: [] as Exclusion[], graphPartial: false as boolean };
  try {
    // OPTIONAL MATCH so missing EXCLUDED_BY relationships do not cause errors
    const cypher = `
      OPTIONAL MATCH (p:Provider {npi: $npi})
      OPTIONAL MATCH (p)-[:EXCLUDED_BY]->(x:Exclusion)
      RETURN collect(DISTINCT x) AS exclusions
    `;
    const neo4jRecords = await runCypher<{ exclusions: Array<{ properties: Record<string, unknown> } | null> }>(
      cypher,
      { npi }
    );
    if (neo4jRecords.length === 0 || !neo4jRecords[0]) {
      return { ...empty, exclusions: [] };
    }
    const raw = neo4jRecords[0].exclusions ?? [];
    const exclusions: Exclusion[] = (raw as Array<{ properties: Record<string, unknown> } | null>)
      .filter((x): x is { properties: Record<string, unknown> } => x != null && typeof x.properties === 'object')
      .map((x) => {
        const props = x.properties;
        return {
          exclusion_id: toStr(props['exclusion_id']) ?? '',
          source:       toStr(props['source']),
          name:         toStr(props['name']),
          exclType:     toStr(props['exclType']),
          exclLabel:    toStr(props['exclLabel']),
          exclDate:     toStr(props['exclDate']),
          reinstated:   toBool(props['reinstated']),
          state:        toStr(props['state']),
        };
      });
    return { exclusions, graphPartial: false };
  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.warn(`${LOG_PREFIX} Neo4j exclusions failed (returning partial data):`, err.message);
    if (err.stack && process.env.NODE_ENV === 'development') {
      console.warn(`${LOG_PREFIX} Neo4j stack:`, err.stack);
    }
    return {
      exclusions: [],
      graphError: 'neo4j_unavailable',
      graphPartial: true,
    };
  }
}

/** GET /v1/providers — List with pagination, full-text search, filters (state, risk_label, taxonomy). */
providersRouter.get(
  '/',
  validate(listQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const start = Date.now();
    const { limit, offset, q, state, risk_label, taxonomy, sort, order } = req.query as unknown as z.infer<typeof listQuerySchema>;
    try {
      const params: unknown[] = [];
      let paramIdx = 0;
      let where = ' WHERE 1=1 ';
      if (state) {
        paramIdx++;
        where += ` AND p.state = $${paramIdx}`;
        params.push(state);
      }
      if (risk_label) {
        paramIdx++;
        where += ` AND prs.risk_label = $${paramIdx}`;
        params.push(risk_label);
      }
      if (taxonomy) {
        paramIdx++;
        where += ` AND p.taxonomy_1 = $${paramIdx}`;
        params.push(taxonomy);
      }
      if (q && q.trim().length >= 2) {
        paramIdx++;
        where += ` AND to_tsvector('english', coalesce(p.display_name,'') || ' ' || coalesce(p.npi,'') || ' ' || coalesce(p.city,'')) @@ plainto_tsquery('english', $${paramIdx})`;
        params.push(q.trim());
      }
      paramIdx++;
      params.push(limit);
      paramIdx++;
      params.push(offset);

      // Build ORDER BY clause dynamically
      let orderBy = 'ORDER BY ';
      if (sort === 'risk_score') {
        orderBy += `prs.risk_score ${order === 'desc' ? 'DESC' : 'ASC'} NULLS LAST, p.display_name`;
      } else if (sort === 'name') {
        orderBy += `p.display_name ${order === 'desc' ? 'DESC' : 'ASC'}`;
      } else if (sort === 'updated_at') {
        orderBy += `prs.updated_at ${order === 'desc' ? 'DESC' : 'ASC'} NULLS LAST, p.display_name`;
      } else {
        // Default: sort by risk_score desc
        orderBy += 'prs.risk_score DESC NULLS LAST, p.display_name';
      }

      const sql = `
        SELECT
          p.npi,
          p.display_name AS name,
          p.entity_type_code,
          p.city,
          p.state,
          p.zip,
          p.taxonomy_1 AS taxonomy,
          p.is_excluded,
          prs.risk_score,
          prs.risk_label
        FROM providers p
        LEFT JOIN provider_risk_scores prs ON p.npi = prs.npi
        LEFT JOIN exclusions e ON p.npi = e.npi AND e.reinstated = FALSE
        ${where}
        ${orderBy}
        LIMIT $${paramIdx - 1} OFFSET $${paramIdx}
      `;
      const rows: any[] = await queryPg(sql, params);
      const data = rows.map((r: any) => ({
        npi: String(r.npi),
        name: r.name ?? '',
        entityType: entityTypeFromCode(r.entity_type_code),
        city: r.city ?? null,
        state: r.state ?? null,
        zip: r.zip ?? null,
        taxonomy: r.taxonomy ?? null,
        isExcluded: Boolean(r.is_excluded),
        risk_score: r.risk_score != null ? Number(r.risk_score) : null,
        risk_label: r.risk_label ?? null,
      }));
      res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
      res.json({
        data,
        meta: { source: 'claidex-v1-neon', query_time_ms: Date.now() - start, limit, offset },
      });
    } catch (err) {
      next(err);
    }
  }
);

/** GET /v1/providers/:npi — Provider + payments from Postgres; exclusions from Neo4j when available. */
providersRouter.get(
  '/:npi',
  validate(npiSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const start = Date.now();
    const { npi } = req.params as z.infer<typeof npiSchema>;

    try {
      // --- 1. Provider from Postgres (source of truth); npi as TEXT ---
      const providerRows = await queryPg<{
        npi: string;
        entity_type_code: number | null;
        display_name: string | null;
        city: string | null;
        state: string | null;
        zip: string | null;
        taxonomy_1: string | null;
        is_excluded: boolean | null;
      }>(
        `SELECT npi, entity_type_code, display_name, city, state, zip, taxonomy_1, is_excluded
         FROM providers WHERE npi = $1`,
        [npi]
      );

      if (!providerRows.length) {
        return next(AppError.notFound('Provider', npi));
      }

      const row = providerRows[0];
      const providerFromPg = {
        npi: String(row.npi),
        name: row.display_name ?? '',
        entityType: entityTypeFromCode(row.entity_type_code),
        city: row.city ?? null,
        state: row.state ?? null,
        zip: row.zip ?? null,
        taxonomy: row.taxonomy_1 ?? null,
        isExcluded: Boolean(row.is_excluded),
      };

      // --- 2. Payments from Postgres (medicaid + medicare) ---
      const [medicaidRows, medicareRows] = await Promise.all([
        queryPg<{
          npi: string;
          year: number | null;
          payments: string | number | null;
          claims: string | number | null;
          beneficiaries: string | number | null;
        }>(
          `SELECT npi, year, payments, claims, beneficiaries FROM payments_medicaid WHERE npi = $1`,
          [npi]
        ),
        queryPg<{
          npi: string;
          year: number | null;
          medicare_paid: string | number | null;
          medicare_allowed: string | number | null;
          total_services: string | number | null;
          total_beneficiaries: string | number | null;
        }>(
          `SELECT npi, year, medicare_paid, medicare_allowed, total_services, total_beneficiaries FROM payments_medicare WHERE npi = $1`,
          [npi]
        ),
      ]);

      const payments: PaymentSummary[] = [
        ...medicaidRows.map((r) => ({
          record_id: `${r.npi}:${r.year ?? ''}:Medicaid`,
          npi: String(r.npi),
          year: Number(r.year) ?? 0,
          program: 'Medicaid' as const,
          payments: toNumber(r.payments),
          allowed: null as number | null,
          claims: toNumber(r.claims),
          beneficiaries: toNumber(r.beneficiaries),
        })),
        ...medicareRows.map((r) => ({
          record_id: `${r.npi}:${r.year ?? ''}:Medicare`,
          npi: String(r.npi),
          year: Number(r.year) ?? 0,
          program: 'Medicare' as const,
          payments: toNumber(r.medicare_paid),
          allowed: toNumber(r.medicare_allowed),
          claims: toNumber(r.total_services),
          beneficiaries: toNumber(r.total_beneficiaries),
        })),
      ].sort((a, b) => b.year - a.year);

      // --- 3. Exclusions from Neo4j (never throws) ---
      const { exclusions, graphError, graphPartial } = await fetchExclusionsFromNeo4j(npi);
      const provider: ProviderDetail = {
        ...providerFromPg,
        payments,
        exclusions,
      };

      const meta: ApiResponse<ProviderDetail>['meta'] = {
        source: 'claidex-v1',
        query_time_ms: Date.now() - start,
      };
      if (graphPartial) {
        meta.graph_partial = true;
        meta.graph_error = graphError ?? 'neo4j_unavailable';
      }

      const body: ApiResponse<ProviderDetail> = { data: provider, meta };
      res.json(body);
    } catch (err) {
      // Postgres or other unexpected failure → 500, do not leak internals
      console.error(`${LOG_PREFIX} Database error:`, err instanceof Error ? err.message : String(err));
      return next(new AppError('INTERNAL_ERROR', 'An unexpected error occurred', 500, 'Database error'));
    }
  }
);
