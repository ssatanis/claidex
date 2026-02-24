import { postgresPool } from '../db/postgres.js';

/**
 * Returns payment summary for a provider across Medicaid, Medicare, and Medicare Part D.
 * Used for brief payments_summary and recent_trend.
 */
export async function getPaymentsByNpi(npi) {
  const client = await postgresPool.connect();
  try {
    const [medicaid, medicare, partD] = await Promise.all([
      client.query(
        'SELECT year, payments, claims FROM payments_medicaid WHERE npi = $1 ORDER BY year',
        [npi]
      ),
      client.query(
        'SELECT year, medicare_paid AS payments, total_services AS claims FROM payments_medicare WHERE npi = $1 ORDER BY year',
        [npi]
      ),
      client.query(
        'SELECT year, total_drug_cost AS payments, total_claims AS claims FROM medicare_part_d WHERE npi = $1 ORDER BY year',
        [npi]
      ),
    ]);

    const byProgram = {
      Medicaid: { total: 0, years: [] },
      Medicare: { total: 0, years: [] },
      MedicarePartD: { total: 0, years: [] },
    };

    for (const row of medicaid.rows) {
      const amt = Number(row.payments ?? 0);
      byProgram.Medicaid.total += amt;
      byProgram.Medicaid.years.push(row.year);
    }
    for (const row of medicare.rows) {
      const amt = Number(row.payments ?? 0);
      byProgram.Medicare.total += amt;
      byProgram.Medicare.years.push(row.year);
    }
    for (const row of partD.rows) {
      const amt = Number(row.payments ?? 0);
      byProgram.MedicarePartD.total += amt;
      byProgram.MedicarePartD.years.push(row.year);
    }

    const allYears = [
      ...new Set([
        ...byProgram.Medicaid.years,
        ...byProgram.Medicare.years,
        ...byProgram.MedicarePartD.years,
      ]),
    ].sort((a, b) => a - b);

    const totalAllPrograms = Object.values(byProgram).reduce((s, p) => s + p.total, 0);
    const topProgram = Object.entries(byProgram)
      .sort((a, b) => b[1].total - a[1].total)[0];
    const topProgramName = topProgram ? topProgram[0] : null;

    const totalsByYear = {};
    for (const row of medicaid.rows) {
      const y = row.year;
      totalsByYear[y] = (totalsByYear[y] ?? 0) + Number(row.payments ?? 0);
    }
    for (const row of medicare.rows) {
      const y = row.year;
      totalsByYear[y] = (totalsByYear[y] ?? 0) + Number(row.payments ?? 0);
    }
    for (const row of partD.rows) {
      const y = row.year;
      totalsByYear[y] = (totalsByYear[y] ?? 0) + Number(row.payments ?? 0);
    }
    let recentTrend = 'stable';
    if (allYears.length >= 2) {
      const [y0, y1] = allYears.slice(-2);
      const t0 = totalsByYear[y0] ?? 0;
      const t1 = totalsByYear[y1] ?? 0;
      if (t1 > t0 * 1.05) recentTrend = 'growing';
      else if (t1 < t0 * 0.95) recentTrend = 'declining';
    }

    return {
      total_all_programs: Math.round(totalAllPrograms),
      years_active: allYears.length,
      top_program: topProgramName,
      recent_trend: recentTrend,
      by_program: {
        Medicaid: Math.round(byProgram.Medicaid.total),
        Medicare: Math.round(byProgram.Medicare.total),
        MedicarePartD: Math.round(byProgram.MedicarePartD.total),
      },
      years: allYears,
    };
  } finally {
    client.release();
  }
}
