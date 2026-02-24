import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { runCypher } from '../db/neo4j';
import { queryPg } from '../db/postgres';
import { validate } from '../middleware/validate';
import { AppError } from '../middleware/errorHandler';
import {
  ApiResponse,
  PaymentSummary,
  toNumber,
  toStr,
} from '../types/api';

export const paymentsRouter = Router();

const npiSchema = z.object({
  npi: z.string().regex(/^\d{10}$/, 'NPI must be exactly 10 digits'),
});

/** Fetch payment records from Postgres (payments_medicaid, payments_medicare, medicare_part_d). */
async function getPaymentsFromPostgres(npi: string): Promise<PaymentSummary[]> {
  const [medicaid, medicare, partD] = await Promise.all([
    queryPg<{ year: number; payments: string; claims: string; beneficiaries: string }>(
      'SELECT year, payments, claims, beneficiaries FROM payments_medicaid WHERE npi = $1 ORDER BY year DESC',
      [npi]
    ).catch(() => []),
    queryPg<{ year: number; medicare_paid: string; medicare_allowed: string; total_services: string; total_beneficiaries: string }>(
      'SELECT year, medicare_paid, medicare_allowed, total_services, total_beneficiaries FROM payments_medicare WHERE npi = $1 ORDER BY year DESC',
      [npi]
    ).catch(() => []),
    queryPg<{ year: number; total_drug_cost: string; total_claims: string; total_benes: string }>(
      'SELECT year, total_drug_cost, total_claims, total_benes FROM medicare_part_d WHERE npi = $1 ORDER BY year DESC',
      [npi]
    ).catch(() => []),
  ]);

  const byKey = new Map<string, PaymentSummary>();
  medicaid.forEach((r, i) => {
    byKey.set(`medicaid-${r.year}-${i}`, {
      record_id: `medicaid-${npi}-${r.year}`,
      npi,
      year: r.year,
      program: 'Medicaid',
      payments: parseFloat(r.payments || '0') || null,
      allowed: null,
      claims: parseFloat(r.claims || '0') || null,
      beneficiaries: parseFloat(r.beneficiaries || '0') || null,
    });
  });
  medicare.forEach((r, i) => {
    byKey.set(`medicare-${r.year}-${i}`, {
      record_id: `medicare-${npi}-${r.year}`,
      npi,
      year: r.year,
      program: 'Medicare',
      payments: parseFloat(r.medicare_paid || '0') || null,
      allowed: parseFloat(r.medicare_allowed || '0') || null,
      claims: parseFloat(r.total_services || '0') || null,
      beneficiaries: parseFloat(r.total_beneficiaries || '0') || null,
    });
  });
  partD.forEach((r, i) => {
    byKey.set(`partd-${r.year}-${i}`, {
      record_id: `partd-${npi}-${r.year}`,
      npi,
      year: r.year,
      program: 'MedicarePartD',
      payments: parseFloat(r.total_drug_cost || '0') || null,
      allowed: null,
      claims: parseFloat(r.total_claims || '0') || null,
      beneficiaries: parseFloat(r.total_benes || '0') || null,
    });
  });

  return [...byKey.values()].sort((a, b) => b.year - a.year || (a.program || '').localeCompare(b.program || ''));
}

paymentsRouter.get(
  '/:npi',
  validate(npiSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const start = Date.now();
    const { npi } = req.params as z.infer<typeof npiSchema>;

    try {
      // 1) Try Neo4j for payments
      let payments: PaymentSummary[] = [];

      try {
        const providerExists = await runCypher<{ exists: boolean }>(
          `MATCH (p:Provider {npi: $npi}) RETURN true AS exists LIMIT 1`,
          { npi }
        );
        if (providerExists.length > 0) {
          const records = await runCypher(
            `MATCH (p:Provider {npi: $npi})-[:RECEIVED_PAYMENT]->(ps:PaymentSummary) RETURN ps ORDER BY ps.year DESC, ps.program ASC`,
            { npi }
          );
          payments = records.map((row) => {
            const r = row as { ps: { properties: Record<string, unknown> } };
            const props = r.ps.properties;
            return {
              record_id:     toStr(props['record_id']) ?? '',
              npi:           toStr(props['npi']) ?? npi,
              year:          toNumber(props['year']) ?? 0,
              program:       toStr(props['program']) ?? '',
              payments:      toNumber(props['payments']),
              allowed:       toNumber(props['allowed']),
              claims:        toNumber(props['claims']),
              beneficiaries: toNumber(props['beneficiaries']),
            };
          });
        }
      } catch {
        // Neo4j unavailable or error; fall back to Postgres
      }

      // 2) If no Neo4j payments, try Postgres (provider may exist in Postgres only)
      if (payments.length === 0) {
        const pgProvider = await queryPg<{ npi: string }>('SELECT npi FROM providers WHERE npi = $1 LIMIT 1', [npi]);
        if (pgProvider.length > 0) {
          payments = await getPaymentsFromPostgres(npi);
        }
      }

      // 3) If still no provider found anywhere, 404
      if (payments.length === 0) {
        const pgExists = await queryPg<{ npi: string }>('SELECT npi FROM providers WHERE npi = $1 LIMIT 1', [npi]);
        if (pgExists.length === 0) {
          return next(AppError.notFound('Provider', npi));
        }
      }

      const body: ApiResponse<PaymentSummary[]> = {
        data: payments,
        meta: { source: 'claidex-v1', query_time_ms: Date.now() - start },
      };
      res.json(body);
    } catch (err) {
      next(err);
    }
  }
);
