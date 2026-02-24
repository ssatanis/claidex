import type {
  DashboardMetrics,
  RiskEvent,
  RiskComponentsAvg,
  PaymentAnomaly,
  Provider,
  ProviderBrief,
  ProviderFinancials,
  ProviderPolitical,
  ProviderRisk,
  ProviderBenchmark,
  Entity,
  OwnershipChain,
  PaymentRecord,
  ExclusionRecord,
  SearchResult,
  MeProfile,
  MeNotificationPreferences,
  MeOrganizationWithRole,
  MeMember,
  MeSecurityLogEntry,
  MeApiKey,
  MeApiKeyCreated,
} from "@/types/api";

/** Headers for /v1/me requests (dev: set NEXT_PUBLIC_DEV_USER_ID to seed user UUID) */
function getMeHeaders(): Record<string, string> {
  const id =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_DEV_USER_ID : undefined;
  if (id) return { "X-User-Id": id };
  return {};
}

/** Prefer NEXT_PUBLIC_API_BASE_URL; fall back to NEXT_PUBLIC_API_URL. In production, never use localhost. */
function getApiBaseUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    (typeof window !== "undefined" ? "" : "http://localhost:4001");
  // Development: allow empty (same-origin) or localhost
  if (process.env.NODE_ENV !== "production") {
    return base || "http://localhost:4001";
  }
  // Production: require explicit URL; never send requests to localhost
  if (!base || base.includes("localhost")) {
    return "";
  }
  return base;
}

/** Call from layout/provider to detect production misconfiguration (missing env). */
export function isApiBaseUrlConfigured(): boolean {
  const url = getApiBaseUrl();
  return Boolean(url && !url.includes("localhost"));
}

export async function checkApiHealth(): Promise<{ ok: boolean; status?: number }> {
  const base = getApiBaseUrl();
  if (!base) return { ok: false };
  try {
    const res = await fetch(`${base}/health`, { cache: "no-store" });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false };
  }
}

export class APIError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = "APIError";
  }
}

export async function fetchAPI<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const base = getApiBaseUrl();
  if (!base) {
    throw new APIError(0, "API is not configured. Set NEXT_PUBLIC_API_BASE_URL in production.");
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string>),
  };
  if (endpoint.startsWith("/v1/me")) {
    Object.assign(headers, getMeHeaders());
  }
  try {
    const res = await fetch(`${base}${endpoint}`, {
      ...options,
      headers: { ...headers, ...(options?.headers as Record<string, string>) },
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: "Unknown error" }));
      throw new APIError(
        res.status,
        error.error || error.message || `API error: ${res.status}`,
        error.code
      );
    }

    if (res.status === 204) return undefined as T;

    const json = await res.json();
    // API responses are wrapped in { data, meta }, extract data
    return json.data !== undefined ? json.data : json;
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    // Network or other errors
    throw new APIError(0, error instanceof Error ? error.message : "Network error");
  }
}

export const apiClient = {
  // Metrics & Dashboard
  getDashboardMetrics: () =>
    fetchAPI<DashboardMetrics>(`/v1/metrics/dashboard`),

  getRiskByState: () =>
    fetchAPI<{ state: string; total_providers: number; high_risk_count: number; avg_risk_score: number | null }[]>(`/v1/metrics/risk-by-state`),

  getTrends: () =>
    fetchAPI<{ month: string; high_risk_count: number; elevated_count: number; moderate_count: number }[]>(`/v1/metrics/trends`),

  getRiskDistribution: () =>
    fetchAPI<{ risk_label: string; count: number }[]>(`/v1/metrics/risk-distribution`),

  getPaymentAnomalies: (days?: number) => {
    const d = days ?? 90;
    return fetchAPI<PaymentAnomaly[]>(`/v1/metrics/payment-anomalies?days=${d}`);
  },

  getRiskComponentsAvg: () =>
    fetchAPI<RiskComponentsAvg>(`/v1/metrics/risk-components-avg`),

  // Events
  getEvents: (params?: {
    program?: string;
    severity?: string;
    event_type?: string;
    state?: string;
    limit?: number;
    offset?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.program) query.append("program", params.program);
    if (params?.severity) query.append("severity", params.severity);
    if (params?.event_type) query.append("event_type", params.event_type);
    if (params?.state) query.append("state", params.state);
    if (params?.limit) query.append("limit", params.limit.toString());
    if (params?.offset) query.append("offset", params.offset.toString());
    return fetchAPI<RiskEvent[]>(`/v1/events?${query.toString()}`);
  },

  // Providers
  getProvider: (npi: string) =>
    fetchAPI<Provider>(`/v1/providers/${npi}`),

  getProviderBrief: (npi: string) =>
    fetchAPI<ProviderBrief>(`/v1/providers/${npi}/brief`),

  getProviderRisk: (npi: string) =>
    fetchAPI<ProviderRisk>(`/v1/providers/${npi}/risk`),

  getProviderBenchmark: (npi: string) =>
    fetchAPI<ProviderBenchmark>(`/v1/providers/${npi}/benchmark`),

  getProviderFinancials: (npi: string) =>
    fetchAPI<ProviderFinancials>(`/v1/providers/${npi}/financials`),

  getProviderPolitical: (npi: string, cycle?: number) => {
    const query = cycle ? `?cycle=${cycle}` : "";
    return fetchAPI<ProviderPolitical>(`/v1/providers/${npi}/political${query}`);
  },

  // Entities
  getEntity: (id: string) =>
    fetchAPI<Entity>(`/v1/entities/${id}`),

  // Ownership
  getOwnership: (npi: string) =>
    fetchAPI<OwnershipChain[]>(`/v1/ownership/${npi}`),

  getOwnershipGraph: (npi: string) =>
    fetchAPI<{ nodes: Array<{ id: string; type: string; data: Record<string, unknown> }>; edges: Array<{ id: string; source: string; target: string }> }>(`/v1/ownership/${npi}/graph`),

  getProvidersList: (params?: { limit?: number; offset?: number; q?: string; state?: string; risk_label?: string; taxonomy?: string; sort?: string; order?: string }) => {
    const query = new URLSearchParams();
    if (params?.limit != null) query.append("limit", params.limit.toString());
    if (params?.offset != null) query.append("offset", params.offset.toString());
    if (params?.q) query.append("q", params.q);
    if (params?.state) query.append("state", params.state);
    if (params?.risk_label) query.append("risk_label", params.risk_label);
    if (params?.taxonomy) query.append("taxonomy", params.taxonomy);
    if (params?.sort) query.append("sort", params.sort);
    if (params?.order) query.append("order", params.order);
    return fetchAPI<Provider[]>(`/v1/providers?${query.toString()}`);
  },

  // Payments
  getPayments: (npi: string) =>
    fetchAPI<PaymentRecord[]>(`/v1/payments/${npi}`),

  // Exclusions
  getExclusions: (params?: {
    state?: string;
    start_date?: string;
    end_date?: string;
    has_payments?: boolean;
    limit?: number;
    offset?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.state) query.append("state", params.state);
    if (params?.start_date) query.append("start_date", params.start_date);
    if (params?.end_date) query.append("end_date", params.end_date);
    if (params?.has_payments !== undefined)
      query.append("has_payments", params.has_payments.toString());
    if (params?.limit) query.append("limit", params.limit.toString());
    if (params?.offset) query.append("offset", params.offset.toString());
    return fetchAPI<ExclusionRecord[]>(`/v1/exclusions?${query.toString()}`);
  },

  // Search
  search: (q: string, type?: string, limit?: number) => {
    const query = new URLSearchParams({ q });
    if (type) query.append("type", type);
    if (limit) query.append("limit", limit.toString());
    return fetchAPI<SearchResult[]>(`/v1/search?${query.toString()}`);
  },

  // Me / Settings
  getMe: () => fetchAPI<MeProfile>("/v1/me"),
  updateProfile: (body: {
    name?: string;
    position?: string;
    timezone?: string;
    locale?: string;
    preferences?: Record<string, unknown>;
  }) =>
    fetchAPI<MeProfile>("/v1/me/profile", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  getSecurityLog: () =>
    fetchAPI<MeSecurityLogEntry[]>("/v1/me/security/log"),
  revokeSessions: () =>
    fetchAPI<{ revoked: boolean }>("/v1/me/security/sessions/revoke", {
      method: "PATCH",
    }),
  getNotifications: () =>
    fetchAPI<MeNotificationPreferences>("/v1/me/notifications"),
  updateNotifications: (body: Partial<MeNotificationPreferences>) =>
    fetchAPI<MeNotificationPreferences>("/v1/me/notifications", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  getOrganization: () =>
    fetchAPI<MeOrganizationWithRole>("/v1/me/organization"),
  updateOrganization: (body: {
    name?: string;
    slug?: string;
    industry?: string;
    billing_email?: string;
    address_line1?: string;
    city?: string;
    state?: string;
    country?: string;
  }) =>
    fetchAPI<MeOrganizationWithRole>("/v1/me/organization", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  getOrganizationMembers: () =>
    fetchAPI<MeMember[]>("/v1/me/organization/members"),
  updateMemberRole: (memberId: string, role: "viewer" | "analyst" | "admin") =>
    fetchAPI<MeMember[]>("/v1/me/organization/members/" + memberId, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),
  removeMember: (memberId: string) =>
    fetchAPI<void>("/v1/me/organization/members/" + memberId, {
      method: "DELETE",
    }),
  getApiKeys: () => fetchAPI<MeApiKey[]>("/v1/me/api-keys"),
  createApiKey: (name: string) =>
    fetchAPI<MeApiKeyCreated>("/v1/me/api-keys", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  revokeApiKey: (id: string) =>
    fetchAPI<void>("/v1/me/api-keys/" + id, { method: "DELETE" }),
  exportMe: () =>
    fetch(`${getApiBaseUrl()}/v1/me/export`, {
      headers: getMeHeaders(),
    }).then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new APIError(res.status, err.error || "Export failed");
      }
      return res.blob();
    }),
};
