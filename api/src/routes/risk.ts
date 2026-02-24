/**
 * GET /v1/providers/:npi/risk
 *
 * Returns the precomputed Claidex Risk Score for a provider.
 *
 * The score is populated by the batch ETL job (etl/compute/risk_scores.py)
 * and served directly from the provider_risk_scores Postgres table.
 *
 * Response shape:
 *   {
 *     "npi": "1316250707",
 *     "risk_score": 74.2,
 *     "risk_label": "Elevated",
 *     "components": { ... },
 *     "peer_group": { "taxonomy": "207R00000X", "state": "TX", "peer_count": 1420 },
 *     "flags": [ ... ],
 *     "meta": { "computed_at": "…", "data_window_years": [2019, …, 2023] }
 *   }
 *
 * 404 is returned when the NPI is unknown or has no computed score.
 * 503 is returned when Postgres is unreachable.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { queryPg } from '../db/postgres';
import { validate } from '../middleware/validate';
import { AppError } from '../middleware/errorHandler';
import { ApiResponse, RiskScore, RiskScoreRow, toRiskResponse } from '../types/api';

export const riskRouter = Router();

const npiSchema = z.object({
  npi: z.string().regex(/^\d{10}$/, 'NPI must be exactly 10 digits'),
});

riskRouter.get(
  '/:npi/risk',
  validate(npiSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const start = Date.now();
    const { npi } = req.params as z.infer<typeof npiSchema>;

    try {
      const rows = await queryPg<RiskScoreRow>(
        `
        SELECT
          npi,
          risk_score,
          risk_label,
          r_raw,
          billing_outlier_score,
          billing_outlier_percentile,
          ownership_chain_risk,
          payment_trajectory_score,
          payment_trajectory_zscore,
          exclusion_proximity_score,
          program_concentration_score,
          peer_taxonomy,
          peer_state,
          peer_count,
          data_window_years,
          flags,
          components,
          updated_at
        FROM provider_risk_scores
        WHERE npi = $1
        `,
        [npi]
      );

      if (rows.length === 0) {
        return next(
          new AppError(
            'NOT_FOUND',
            `No risk score found for NPI ${npi}`,
            404,
            'Run the risk score batch job (etl/compute/risk_scores.py) to compute scores.'
          )
        );
      }

      const riskScore: RiskScore = toRiskResponse(rows[0]);

      const body: ApiResponse<RiskScore> = {
        data: riskScore,
        meta: { source: 'claidex-v1', query_time_ms: Date.now() - start },
      };

      res.json(body);
    } catch (err) {
      next(err);
    }
  }
);
