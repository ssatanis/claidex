/**
 * GET /v1/providers/:npi/political
 *
 * Returns FEC political contribution linkages for the given NPI.
 * Stub: returns valid shape with empty arrays when no FEC data or matching is done.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { queryPg } from '../db/postgres';
import { validate } from '../middleware/validate';
import { AppError } from '../middleware/errorHandler';
import { ApiResponse } from '../types/api';

export const politicalRouter = Router();

const npiSchema = z.object({
  npi: z.string().regex(/^\d{10}$/, 'NPI must be exactly 10 digits'),
});

const cycleSchema = z.object({
  cycle: z.coerce.number().min(2000).max(2100).optional(),
});

politicalRouter.get(
  '/:npi/political',
  validate(npiSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const start = Date.now();
    const { npi } = req.params as z.infer<typeof npiSchema>;
    const cycle = cycleSchema.safeParse(req.query).success
      ? (req.query.cycle as string) ? parseInt(req.query.cycle as string, 10) : 2024
      : 2024;

    try {
      const rows = await queryPg<{ npi: string }>(
        'SELECT npi FROM providers WHERE npi = $1',
        [npi]
      );
      if (rows.length === 0) {
        return next(AppError.notFound('Provider', npi));
      }

      const body: ApiResponse<{
        npi: string;
        cycle: number;
        matched_contributors: unknown[];
        matched_employers: unknown[];
        flags: string[];
        meta: { cycle: number; source: string };
      }> = {
        data: {
          npi,
          cycle,
          matched_contributors: [],
          matched_employers: [],
          flags: [],
          meta: { cycle, source: 'FEC' },
        },
        meta: { source: 'claidex-v1', query_time_ms: Date.now() - start },
      };
      res.json(body);
    } catch (err) {
      next(err);
    }
  }
);
