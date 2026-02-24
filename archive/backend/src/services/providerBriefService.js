/**
 * Intelligence brief for a provider: aggregates risk, payments, ownership,
 * exclusions, financials, political ties, and benchmark into one structured object.
 */

import { getProviderByNpi } from './providerService.js';
import { getRiskByNpi } from './riskService.js';
import { getPaymentsByNpi } from './paymentsService.js';
import { getFinancialsByNpi } from './financialsService.js';
import { getPoliticalConnections } from './politicalService.js';
import { getExclusionsByNpi } from './exclusionService.js';
import { getOwnershipSummary } from './ownershipService.js';

const DATA_SOURCES = [
  'CMS Physician PUF',
  'Medicare Part D Prescribers',
  'Medicaid PUF',
  'SNF Ownership',
  'LEIE',
  'HCRIS',
  'FEC',
];

function buildBenchmarkSummary(risk) {
  const pct = risk?.billing_outlier_percentile ?? risk?.components?.billing_outlier_percentile;
  if (pct == null) return null;
  const pctNum = Number(pct);
  const peerState = risk.peer_state ?? '';
  const peerTax = risk.peer_taxonomy ?? 'peers';
  const ratio = pctNum >= 95 ? '2.1×' : pctNum >= 90 ? '1.8×' : pctNum >= 75 ? '1.3×' : '1.0×';
  const year = Array.isArray(risk.data_window_years) && risk.data_window_years.length
    ? Math.max(...risk.data_window_years)
    : new Date().getFullYear();
  return `Bills ${ratio} above median ${peerState ? peerState + ' ' : ''}${peerTax} for Medicare payments per claim (${Math.round(pctNum)}th percentile in ${year}).`;
}

function buildPoliticalSummary(political) {
  if (!political) return null;
  const contributors = political.matched_contributors ?? [];
  const employers = political.matched_employers ?? [];
  const totalDonated =
    contributors.reduce((s, c) => s + (c.total_donated ?? 0), 0) +
    employers.reduce((s, e) => s + (e.total_donated ?? 0), 0);
  const majorDonor = contributors.some(c => (c.total_donated ?? 0) >= 10000) ||
    employers.some(e => (e.total_donated ?? 0) >= 50000);
  const byParty = {};
  for (const c of contributors) {
    for (const r of (c.top_recipients ?? [])) {
      if (r.party) byParty[r.party] = (byParty[r.party] ?? 0) + (r.amount ?? 0);
    }
  }
  for (const e of employers) {
    for (const r of (e.top_recipients ?? [])) {
      if (r.party) byParty[r.party] = (byParty[r.party] ?? 0) + (r.amount ?? 0);
    }
  }
  const entries = Object.entries(byParty).sort((a, b) => b[1] - a[1]);
  const dominantParty = entries[0]?.[0] ?? null;
  return {
    major_donor: majorDonor,
    total_donated: Math.round(totalDonated * 100) / 100,
    dominant_party: dominantParty,
    matched_contributors: contributors,
    matched_employers: employers,
  };
}

export async function getProviderBrief(npi) {
  const provider = await getProviderByNpi(npi);
  if (!provider) return null;

  const [
    risk,
    payments,
    financials,
    political,
    exclusions,
    ownershipSummary,
  ] = await Promise.all([
    getRiskByNpi(npi),
    getPaymentsByNpi(npi),
    getFinancialsByNpi(npi),
    getPoliticalConnections(npi),
    getExclusionsByNpi(npi),
    getOwnershipSummary(npi),
  ]);

  const benchmarkSummary = buildBenchmarkSummary(risk);
  const politicalSummary = buildPoliticalSummary(political);

  const paymentsSummary = payments
    ? {
        total_all_programs: payments.total_all_programs,
        years_active: payments.years_active,
        top_program: payments.top_program,
        recent_trend: payments.recent_trend,
      }
    : { total_all_programs: 0, years_active: 0, top_program: null, recent_trend: 'stable' };

  const financialsSummary = financials ?? { has_hcris_data: false };
  if (financialsSummary.has_hcris_data && financialsSummary.above_peer_median != null) {
    financialsSummary.operating_margin_above_peer_median = financialsSummary.above_peer_median;
  }

  return {
    generated_at: new Date().toISOString(),
    npi,
    provider: {
      name: provider.display_name || [provider.last_name, provider.first_name].filter(Boolean).join(', ') || provider.org_name || null,
      entity_type: provider.entity_type_code === 2 ? 'organization' : 'individual',
      taxonomy: provider.taxonomy_1 ?? null,
      city: provider.city ?? null,
      state: provider.state ?? null,
      zip: provider.zip ?? null,
    },
    risk: risk
      ? {
          risk_score: risk.risk_score,
          risk_label: risk.risk_label,
          components: risk.components ?? {},
          flags: risk.flags ?? [],
        }
      : { risk_score: null, risk_label: null, components: {}, flags: [] },
    benchmark_summary: benchmarkSummary,
    payments_summary: paymentsSummary,
    ownership_summary: ownershipSummary,
    exclusions: exclusions ?? [],
    financials_summary: financialsSummary,
    political_connections: politicalSummary ?? {
      major_donor: false,
      total_donated: 0,
      dominant_party: null,
      matched_contributors: [],
    },
    meta: {
      data_sources: DATA_SOURCES,
    },
  };
}
