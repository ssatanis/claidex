// Dashboard & Metrics
export interface DashboardMetrics {
  total_providers: number;
  high_risk_providers: number;
  high_risk_percentage: number;
  active_exclusions: number;
  flagged_payments: number;
  trends: {
    high_risk_change_pct: number;
    direction: "up" | "down" | "flat";
  };
}

// Risk Events
export interface RiskEvent {
  id: string;
  severity: "critical" | "high" | "medium" | "low";
  event_type:
    | "Exclusion"
    | "Payment Spike"
    | "Ownership Change"
    | "Risk Score Change"
    | "Sanction"
    | "Quality Issue"
    | "Investigation";
  provider_name: string;
  provider_npi?: string | null;
  entity_id?: string | null;
  program: "Medicare" | "Medicaid" | "Commercial" | "All";
  state?: string | null;
  timestamp: string;
  description: string;
}

/** Single day's payment anomaly summary for heatmap. */
export interface PaymentAnomaly {
  date: string | null;
  anomaly_count: number;
  avg_score: number | null;
}

/** Risk distribution (donut chart): count by risk_label. */
export interface RiskDistributionItem {
  risk_label: string;
  count: number;
}

/** Trend data for risk trend chart (high/elevated/moderate counts by month). */
export interface RiskTrend {
  month: string;
  high_risk_count: number;
  elevated_count: number;
  moderate_count: number;
}

/** State-level risk metrics for dashboard (risk-by-state). */
export interface RiskByState {
  state: string;
  total_providers: number;
  high_risk_count: number;
  avg_risk_score: number | null;
}

/** Average risk component scores (for radar chart). */
export interface RiskComponentsAvg {
  billing_outlier: number;
  ownership_chain: number;
  payment_trajectory: number;
  exclusion_proximity: number;
  program_concentration: number;
}

// Provider Types
export interface Provider {
  npi: string;
  name: string;
  entityType: "Individual" | "Organization" | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  taxonomy: string | null;
  isExcluded: boolean;
  payments?: PaymentRecord[];
  exclusions?: ExclusionRecord[];
}

export interface ProviderBrief {
  generated_at: string;
  npi: string;
  provider: {
    name: string;
    entity_type: "individual" | "organization";
    taxonomy: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  };
  risk: {
    risk_score: number | null;
    risk_label: string | null;
    components: Record<string, any>;
    flags: string[];
  };
  benchmark_summary: string | null;
  payments_summary: {
    total_all_programs: number;
    years_active: number;
    top_program: string | null;
    recent_trend: "increasing" | "stable" | "decreasing";
  };
  ownership_summary: any;
  exclusions: any[];
  financials_summary: {
    has_hcris_data: boolean;
    [key: string]: any;
  };
  political_connections: {
    major_donor: boolean;
    total_donated: number;
    dominant_party: string | null;
    matched_contributors: any[];
    matched_employers: any[];
  };
  meta: {
    data_sources: string[];
  };
}

export interface ProviderRisk {
  npi: string;
  risk_score: number;
  risk_label: "Critical" | "Elevated" | "Moderate" | "Low" | null;
  components: {
    billing_outlier_score?: number;
    ownership_chain_risk?: number;
    payment_trajectory_score?: number;
    exclusion_proximity_score?: number;
    program_concentration_score?: number;
    [key: string]: number | undefined;
  };
  flags: string[];
  peer_group: {
    taxonomy: string;
    state: string;
    peer_count: number;
  };
  data_window_years: number[];
  updated_at: string;
}

export interface ProviderBenchmark {
  npi: string;
  benchmark_entries: Array<{
    year: number;
    program: "Medicaid" | "Medicare";
    metrics: Array<{
      metric_name:
        | "payments_per_claim"
        | "claims_per_beneficiary"
        | "total_payments"
        | "allowed_per_claim";
      provider_value: number;
      peer_median: number;
      peer_p10: number;
      peer_p90: number;
      provider_percentile: number;
      robust_z_score: number;
      direction: "high" | "low" | "neutral";
      flag: "outlier" | "elevated" | "none";
      peer_level: 1 | 2 | 3;
      peer_count: number;
    }>;
  }>;
  summaries: {
    [metricName: string]: {
      weighted_percentile: number;
      trend_vs_peers: "rising" | "falling" | "stable";
      percentile_change: number;
    };
  };
}

export interface ProviderFinancials {
  npi: string;
  financials: Array<{
    year: number;
    facility_name: string;
    state: string;
    facility_type: string;
    net_patient_revenue: number;
    total_operating_costs: number;
    operating_margin_pct: number;
    medicare_payer_mix_pct: number;
    medicaid_payer_mix_pct: number;
    total_beds: number;
    total_patient_days: number;
    revenue_per_patient_day: number;
    peer_median_operating_margin_pct: number;
    peer_median_revenue_per_patient_day: number;
    peer_margin_percentile: number;
  }>;
  has_hcris_data: boolean;
  meta: {
    data_source: string;
    link_type: string;
  };
}

export interface ProviderPolitical {
  npi: string;
  cycle: number;
  matched_contributors: any[];
  matched_employers: any[];
  flags: string[];
  meta: {
    cycle: number;
    source: string;
  };
}

// Entity Types
export interface Entity {
  entity_id: string;
  name: string | null;
  dba: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  entityType: string | null;
  isCorporation: boolean | null;
  isLLC: boolean | null;
  isHoldingCompany: boolean | null;
  isInvestmentFirm: boolean | null;
  isPrivateEquity: boolean | null;
  isForProfit: boolean | null;
  isNonProfit: boolean | null;
  owned_entities: Array<{
    entity_id: string;
    name: string | null;
    entityType: string | null;
  }>;
  officers: Array<{
    associate_id: string;
    lastName: string | null;
    firstName: string | null;
    middleName: string | null;
    title: string | null;
    city: string | null;
    state: string | null;
  }>;
}

// Ownership Types
export interface OwnershipChain {
  entity_id: string;
  name: string | null;
  entityType: string | null;
  ownershipPct: number | null;
  roleCode: string | null;
  roleText: string | null;
  depth: number;
}

// Payment Types
export interface PaymentRecord {
  record_id: string;
  npi: string;
  year: number;
  program: string;
  payments: number | null;
  allowed: number | null;
  claims: number | null;
  beneficiaries: number | null;
}

// Exclusion Types
export interface ExclusionRecord {
  exclusion_id: string;
  source: string | null;
  name: string | null;
  exclType: string | null;
  exclLabel: string | null;
  exclDate: string | null;
  reinstated: boolean | null;
  state: string | null;
}

// Watchlist Types
export interface WatchlistItem {
  id: number;
  type: "provider" | "entity";
  entity_id: string;
  email: string;
  created_at: string;
  last_notified_at: string | null;
}

// Settings / Me types
export interface MeProfile {
  id: string;
  email: string;
  name: string | null;
  role: string | null;
  position: string | null;
  organization_id: string | null;
  timezone: string | null;
  locale: string | null;
  preferences: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  organization: MeOrganization | null;
  organization_role: string | null;
  notifications: MeNotificationPreferences | null;
}

export interface MeOrganization {
  id: string;
  name: string;
  slug: string | null;
  industry: string | null;
  logo_url: string | null;
  billing_email: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  created_at: string;
  updated_at: string;
}

export interface MeNotificationPreferences {
  email_alerts: boolean;
  email_digest_frequency: "none" | "daily" | "weekly";
  event_severity_min: "low" | "medium" | "high" | "critical";
  program_filter: string[];
  watchlist_only: boolean;
  updated_at?: string;
}

export interface MeOrganizationWithRole {
  organization: MeOrganization | null;
  role: string | null;
}

export interface MeMember {
  id: string;
  name: string | null;
  email: string;
  role: string | null;
  joined_at: string;
}

export interface MeSecurityLogEntry {
  id: string;
  action: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface MeApiKey {
  id: string;
  name: string;
  key_prefix: string;
  last_used_at: string | null;
  created_at: string;
}

export interface MeApiKeyCreated extends MeApiKey {
  key: string;
}

// Search Types
export interface SearchResult {
  type: "Provider" | "CorporateEntity" | "Person";
  data:
    | {
        npi: string;
        name: string;
        entityType: string | null;
        city: string | null;
        state: string | null;
        zip: string | null;
        taxonomy: string | null;
        isExcluded: boolean;
      }
    | {
        entity_id: string;
        name: string | null;
        dba: string | null;
        city: string | null;
        state: string | null;
        zip: string | null;
        entityType: string | null;
        isCorporation: boolean | null;
        isLLC: boolean | null;
        isPrivateEquity: boolean | null;
      }
    | {
        associate_id: string;
        lastName: string | null;
        firstName: string | null;
        middleName: string | null;
        title: string | null;
        city: string | null;
        state: string | null;
      };
}
