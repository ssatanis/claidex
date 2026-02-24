import { Integer } from 'neo4j-driver';

// ---------------------------------------------------------------------------
// Generic response envelope
// ---------------------------------------------------------------------------

export interface Meta {
  source: 'claidex-v1';
  query_time_ms: number;
  last_updated?: string;
  /** True when Neo4j was unavailable or failed; provider/payments still from Postgres. */
  graph_partial?: boolean;
  /** Set when graph_partial is true (e.g. 'neo4j_unavailable'). */
  graph_error?: string;
}

export interface ApiResponse<T> {
  data: T;
  meta: Meta;
}

export interface PaginatedMeta extends Meta {
  limit: number;
  offset: number;
  total?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginatedMeta;
}

// ---------------------------------------------------------------------------
// Domain types (mirror Neo4j node properties)
// ---------------------------------------------------------------------------

export interface Provider {
  npi: string;
  name: string;
  entityType: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  taxonomy: string | null;
  isExcluded: boolean;
}

export interface PaymentSummary {
  record_id: string;
  npi: string;
  year: number;
  program: string;
  payments: number | null;
  allowed: number | null;
  claims: number | null;
  beneficiaries: number | null;
}

export interface Exclusion {
  exclusion_id: string;
  source: string | null;
  name: string | null;
  exclType: string | null;
  exclLabel: string | null;
  exclDate: string | null;
  reinstated: boolean;
  state: string | null;
}

export interface CorporateEntity {
  entity_id: string;
  name: string | null;
  dba: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  entityType: string | null;
  isCorporation: boolean;
  isLLC: boolean;
  isHoldingCompany: boolean;
  isInvestmentFirm: boolean;
  isPrivateEquity: boolean;
  isForProfit: boolean;
  isNonProfit: boolean;
}

export interface Person {
  associate_id: string;
  lastName: string | null;
  firstName: string | null;
  middleName: string | null;
  title: string | null;
  city: string | null;
  state: string | null;
}

export interface OwnershipEdge {
  ownershipPct: number | null;
  roleCode: string | null;
  roleText: string | null;
  associationDate: string | null;
}

export interface OwnershipLevel {
  entity_id: string;
  name: string | null;
  entityType: string | null;
  ownershipPct: number | null;
  roleCode: string | null;
  roleText: string | null;
  depth: number;
}

// ---------------------------------------------------------------------------
// Route-specific payloads
// ---------------------------------------------------------------------------

export interface ProviderDetail extends Provider {
  payments: PaymentSummary[];
  exclusions: Exclusion[];
}

export interface EntityDetail extends CorporateEntity {
  owned_entities: Pick<CorporateEntity, 'entity_id' | 'name' | 'entityType'>[];
  officers: Person[];
}

export interface SearchResult {
  type: 'Provider' | 'CorporateEntity' | 'Person';
  data: Provider | CorporateEntity | Person;
}

// ---------------------------------------------------------------------------
// Risk Score types
// ---------------------------------------------------------------------------

export interface RiskComponents {
  billing_outlier_score: number;
  billing_outlier_percentile: number;
  ownership_chain_risk: number;
  payment_trajectory_score: number;
  payment_trajectory_zscore: number;
  exclusion_proximity_score: number;
  program_concentration_score: number;
}

export interface RiskPeerGroup {
  taxonomy: string | null;
  state: string | null;
  peer_count: number;
}

export interface RiskMeta {
  computed_at: string;
  data_window_years: number[];
}

export interface RiskScore {
  npi: string;
  risk_score: number;
  risk_label: 'Low' | 'Moderate' | 'Elevated' | 'High';
  components: RiskComponents;
  peer_group: RiskPeerGroup;
  flags: string[];
  meta: RiskMeta;
}

/** Raw row returned from the provider_risk_scores Postgres table. */
export interface RiskScoreRow {
  npi: string;
  risk_score: string | number;
  risk_label: string;
  r_raw: string | number | null;
  billing_outlier_score: string | number | null;
  billing_outlier_percentile: string | number | null;
  ownership_chain_risk: string | number | null;
  payment_trajectory_score: string | number | null;
  payment_trajectory_zscore: string | number | null;
  exclusion_proximity_score: string | number | null;
  program_concentration_score: string | number | null;
  peer_taxonomy: string | null;
  peer_state: string | null;
  peer_count: number | null;
  data_window_years: number[] | null;
  flags: unknown;            // JSONB arrives as parsed object from pg driver
  components: unknown;       // JSONB
  updated_at: Date | string | null;
}

/** Map a RiskScoreRow (Postgres) to the API response shape. */
export function toRiskResponse(row: RiskScoreRow): RiskScore {
  const parseNum = (v: unknown, fallback = 0): number => {
    if (v === null || v === undefined) return fallback;
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return isNaN(n) ? fallback : n;
  };

  const flags: string[] = Array.isArray(row.flags)
    ? (row.flags as string[])
    : typeof row.flags === 'string'
    ? (JSON.parse(row.flags) as string[])
    : [];

  const compRaw: Record<string, number> =
    row.components && typeof row.components === 'object' && !Array.isArray(row.components)
      ? (row.components as Record<string, number>)
      : typeof row.components === 'string'
      ? (JSON.parse(row.components as string) as Record<string, number>)
      : {};

  const components: RiskComponents = {
    billing_outlier_score:       parseNum(compRaw['billing_outlier_score'] ?? row.billing_outlier_score),
    billing_outlier_percentile:  parseNum(compRaw['billing_outlier_percentile'] ?? row.billing_outlier_percentile),
    ownership_chain_risk:        parseNum(compRaw['ownership_chain_risk'] ?? row.ownership_chain_risk),
    payment_trajectory_score:    parseNum(compRaw['payment_trajectory_score'] ?? row.payment_trajectory_score),
    payment_trajectory_zscore:   parseNum(compRaw['payment_trajectory_zscore'] ?? row.payment_trajectory_zscore),
    exclusion_proximity_score:   parseNum(compRaw['exclusion_proximity_score'] ?? row.exclusion_proximity_score),
    program_concentration_score: parseNum(compRaw['program_concentration_score'] ?? row.program_concentration_score),
  };

  const years = Array.isArray(row.data_window_years)
    ? row.data_window_years.map(Number)
    : [];

  const computedAt = row.updated_at
    ? (row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at))
    : new Date().toISOString();

  const label = row.risk_label as RiskScore['risk_label'];

  return {
    npi: row.npi,
    risk_score: parseNum(row.risk_score),
    risk_label: (['Low', 'Moderate', 'Elevated', 'High'] as const).includes(label)
      ? label
      : 'Low',
    components,
    peer_group: {
      taxonomy: row.peer_taxonomy ?? null,
      state:    row.peer_state    ?? null,
      peer_count: row.peer_count  ?? 0,
    },
    flags,
    meta: {
      computed_at: computedAt,
      data_window_years: years,
    },
  };
}

// ---------------------------------------------------------------------------
// Benchmark types
// ---------------------------------------------------------------------------

export type BenchmarkFlag = 'ExtremeOutlier' | 'Outlier' | 'High' | 'Typical';
export type BenchmarkDirection = 'High' | 'Low' | 'Typical';
export type TrendVsPeers = 'growing_faster' | 'growing_slower' | 'stable' | 'declining';
export type SummaryFlag = 'persistent_high' | 'persistent_typical' | 'improving' | 'worsening';

export interface BenchmarkPeerDefinition {
  level: 1 | 2 | 3;
  taxonomy: string;
  state?: string;
  census_division?: string;
  entity_type?: string;
  min_claims?: number;
}

export interface BenchmarkEntry {
  year: number;
  program: string;
  metric: string;
  provider_value: number;
  peer_median: number;
  peer_p10: number;
  peer_p90: number;
  provider_percentile: number;
  z_score: number;
  direction: BenchmarkDirection;
  flag: BenchmarkFlag;
}

export interface MetricSummary {
  metric: string;
  program: string;
  weighted_percentile: number;
  trend_vs_peers: TrendVsPeers;
  summary_flag: SummaryFlag;
}

export interface BenchmarkSummaries {
  recent_years: number[];
  metrics: MetricSummary[];
}

export interface BenchmarkResponse {
  npi: string;
  taxonomy: string;
  state: string;
  peer_definition: BenchmarkPeerDefinition;
  peer_count: number;
  benchmarks: BenchmarkEntry[];
  summaries: BenchmarkSummaries;
}

/** Raw row returned from the benchmark CTE query. */
export interface BenchmarkRow {
  year: number;
  program: string;
  metric: string;
  peer_level: number;
  peer_count: number;
  provider_value: string | number;
  peer_median: string | number;
  peer_p10: string | number;
  peer_p90: string | number;
  provider_percentile: number;
  z_score: string | number;
  direction: string;
  flag: string;
}

// ---------------------------------------------------------------------------
// Utility: convert Neo4j Integer to JS number safely
// ---------------------------------------------------------------------------

export function toNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return val;
  if (Integer.isInteger(val as Integer)) return (val as Integer).toNumber();
  const n = Number(val);
  return isNaN(n) ? null : n;
}

export function toStr(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  return String(val);
}

export function toBool(val: unknown): boolean {
  if (val === null || val === undefined) return false;
  if (typeof val === 'boolean') return val;
  return String(val).toLowerCase() === 'true';
}
