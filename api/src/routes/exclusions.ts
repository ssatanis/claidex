import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { runCypher, neo4jInt } from '../db/neo4j';
import { validate } from '../middleware/validate';
import {
  PaginatedResponse,
  PaginatedMeta,
  Exclusion,
  toStr,
  toBool,
  toNumber,
} from '../types/api';

export const exclusionsRouter = Router();

const exclusionsQuerySchema = z.object({
  state:        z.string().length(2).toUpperCase().optional(),
  start_date:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'start_date must be YYYY-MM-DD').optional(),
  end_date:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'end_date must be YYYY-MM-DD').optional(),
  has_payments: z
    .string()
    .optional()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : undefined)),
  limit:  z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

exclusionsRouter.get(
  '/',
  validate(exclusionsQuerySchema as z.ZodType, 'query'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const start = Date.now();
    const query = req.query as unknown as z.output<typeof exclusionsQuerySchema>;

    const {
      state,
      start_date,
      end_date,
      has_payments,
      limit,
      offset,
    } = query;

    try {
      let cypher: string;
      const params: Record<string, unknown> = {
        state:      state ?? null,
        startDate:  start_date ?? null,
        endDate:    end_date ?? null,
        limitVal:   neo4jInt(limit),
        offsetVal:  neo4jInt(offset),
      };

      if (has_payments === true) {
        // Only return exclusions where the excluded party also has payment records
        cypher = `
          MATCH (x:Exclusion)<-[:EXCLUDED_BY]-(p:Provider)-[:RECEIVED_PAYMENT]->(:PaymentSummary)
          WHERE ($state    IS NULL OR x.state    = $state)
            AND ($startDate IS NULL OR x.exclDate >= date($startDate))
            AND ($endDate   IS NULL OR x.exclDate <= date($endDate))
          RETURN DISTINCT x
          ORDER BY x.exclDate DESC
          SKIP $offsetVal LIMIT $limitVal
        `;
      } else {
        cypher = `
          MATCH (x:Exclusion)
          WHERE ($state    IS NULL OR x.state    = $state)
            AND ($startDate IS NULL OR x.exclDate >= date($startDate))
            AND ($endDate   IS NULL OR x.exclDate <= date($endDate))
          RETURN x
          ORDER BY x.exclDate DESC
          SKIP $offsetVal LIMIT $limitVal
        `;
      }

      const records = await runCypher(cypher, params);

      const exclusions: Exclusion[] = records.map((row) => {
        const r = row as { x: { properties: Record<string, unknown> } };
        const props = r.x.properties;
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

      // Get total count for the same filter (no pagination)
      const countCypher =
        has_payments === true
          ? `
            MATCH (x:Exclusion)<-[:EXCLUDED_BY]-(p:Provider)-[:RECEIVED_PAYMENT]->(:PaymentSummary)
            WHERE ($state    IS NULL OR x.state    = $state)
              AND ($startDate IS NULL OR x.exclDate >= date($startDate))
              AND ($endDate   IS NULL OR x.exclDate <= date($endDate))
            RETURN count(DISTINCT x) AS total
            `
          : `
            MATCH (x:Exclusion)
            WHERE ($state    IS NULL OR x.state    = $state)
              AND ($startDate IS NULL OR x.exclDate >= date($startDate))
              AND ($endDate   IS NULL OR x.exclDate <= date($endDate))
            RETURN count(x) AS total
            `;

      const countRows = await runCypher<{ total: unknown }>(countCypher, params);
      const total = toNumber(countRows[0]?.total) ?? 0;

      const meta: PaginatedMeta = {
        source:        'claidex-v1',
        query_time_ms: Date.now() - start,
        limit,
        offset,
        total,
      };

      const body: PaginatedResponse<Exclusion> = { data: exclusions, meta };
      res.json(body);
    } catch (err) {
      next(err);
    }
  }
);
