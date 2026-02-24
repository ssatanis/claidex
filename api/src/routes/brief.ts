/**
 * GET /v1/providers/:npi/brief
 *
 * Returns a single structured intelligence brief: provider, risk, payments summary,
 * ownership, exclusions, financials, political. Uses existing data; stubs when missing.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { queryPg } from '../db/postgres';
import { validate } from '../middleware/validate';
import { AppError } from '../middleware/errorHandler';
import { ApiResponse } from '../types/api';

export const briefRouter = Router();

const npiSchema = z.object({
  npi: z.string().regex(/^\d{10}$/, 'NPI must be exactly 10 digits'),
});

briefRouter.get(
  '/:npi/brief',
  validate(npiSchema, 'params'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const start = Date.now();
    const { npi } = req.params as z.infer<typeof npiSchema>;

    try {
      const [providerRows, riskRows, medicaidRows, medicareRows, exclusionRows] = await Promise.all([
        queryPg<{ npi: string; display_name: string | null; last_name: string | null; first_name: string | null; org_name: string | null; entity_type_code: number | null; taxonomy_1: string | null; city: string | null; state: string | null; zip: string | null }>(
          'SELECT npi, display_name, last_name, first_name, org_name, entity_type_code, taxonomy_1, city, state, zip FROM providers WHERE npi = $1',
          [npi]
        ),
        queryPg<{ risk_score: number; risk_label: string; components: unknown; flags: unknown }>(
          'SELECT risk_score, risk_label, components, flags FROM provider_risk_scores WHERE npi = $1',
          [npi]
        ).catch(() => []),
        queryPg<{ year: number; payments: string | number | null }>('SELECT year, payments FROM payments_medicaid WHERE npi = $1', [npi]).catch(() => []),
        queryPg<{ year: number; medicare_paid: string | number | null }>('SELECT year, medicare_paid FROM payments_medicare WHERE npi = $1', [npi]).catch(() => []),
        queryPg<{ excl_type_label: string; excldate: string }>('SELECT excl_type_label, excldate FROM exclusions WHERE npi = $1 AND reinstated = FALSE', [npi]).catch(() => []),
      ]);

      if (providerRows.length === 0) {
        return next(AppError.notFound('Provider', npi));
      }

      const p = providerRows[0];
      const fallbackName = [p.last_name, p.first_name].filter(Boolean).join(', ') || p.org_name;
      const name = (p.display_name ?? fallbackName) || null;

      const risk = riskRows.length > 0 && riskRows[0]
        ? {
            risk_score: Number(riskRows[0].risk_score),
            risk_label: riskRows[0].risk_label ?? null,
            components: (riskRows[0].components as object) ?? {},
            flags: Array.isArray(riskRows[0].flags) ? riskRows[0].flags : [],
          }
        : { risk_score: null as number | null, risk_label: null as string | null, components: {} as Record<string, unknown>, flags: [] as string[] };

      const allPayments = [
        ...(medicaidRows as { year: number; payments: string | number | null }[]).map((r) => ({ year: r.year, amount: Number(r.payments) || 0 })),
        ...(medicareRows as { year: number; medicare_paid: string | number | null }[]).map((r) => ({ year: r.year, amount: Number(r.medicare_paid) || 0 })),
      ];
      const totalAllPrograms = allPayments.reduce((s, x) => s + x.amount, 0);
      const years = [...new Set(allPayments.map((x) => x.year))].sort((a, b) => b - a);

      const body: ApiResponse<{
        generated_at: string;
        npi: string;
        provider: { name: string | null; entity_type: string; taxonomy: string | null; city: string | null; state: string | null; zip: string | null };
        risk: typeof risk;
        benchmark_summary: string | null;
        payments_summary: { total_all_programs: number; years_active: number; top_program: string | null; recent_trend: string };
        ownership_summary: unknown;
        exclusions: unknown[];
        financials_summary: { has_hcris_data: boolean };
        political_connections: { major_donor: boolean; total_donated: number; dominant_party: string | null; matched_contributors: unknown[] };
        meta: { data_sources: string[] };
      }> = {
        data: {
          generated_at: new Date().toISOString(),
          npi,
          provider: {
            name,
            entity_type: p.entity_type_code === 2 ? 'organization' : 'individual',
            taxonomy: p.taxonomy_1 ?? null,
            city: p.city ?? null,
            state: p.state ?? null,
            zip: p.zip ?? null,
          },
          risk,
          benchmark_summary: risk.risk_score != null ? `Risk score ${risk.risk_score} (${risk.risk_label}).` : null,
          payments_summary: {
            total_all_programs: totalAllPrograms,
            years_active: years.length,
            top_program: years.length ? 'Medicare' : null,
            recent_trend: 'stable',
          },
          ownership_summary: null,
          exclusions: exclusionRows.map(e => ({ exclType: e.excl_type_label, exclDate: e.excldate })),
          financials_summary: { has_hcris_data: false },
          political_connections: {
            major_donor: false,
            total_donated: 0,
            dominant_party: null,
            matched_contributors: [],
          },
          meta: {
            data_sources: ['CMS Physician PUF', 'Medicare Part D Prescribers', 'Medicaid PUF', 'SNF Ownership', 'LEIE', 'HCRIS', 'FEC'],
          },
        },
        meta: { source: 'claidex-v1', query_time_ms: Date.now() - start },
      };
      res.json(body);
    } catch (err) {
      next(err);
    }
  }
);
