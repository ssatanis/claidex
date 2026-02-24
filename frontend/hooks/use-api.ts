import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type {
  DashboardMetrics,
  RiskEvent,
  RiskComponentsAvg,
  PaymentAnomaly,
  ProviderBrief,
  ProviderRisk,
  ProviderBenchmark,
  ProviderFinancials,
  ProviderPolitical,
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

// Dashboard & Metrics hooks — polling for near-real-time updates
export function useDashboardMetrics() {
  return useQuery<DashboardMetrics>({
    queryKey: ["dashboard-metrics"],
    queryFn: () => apiClient.getDashboardMetrics(),
    staleTime: 30 * 1000, // 30s
    refetchInterval: 60 * 1000, // refresh every 60s
  });
}

export function useRiskByState() {
  return useQuery({
    queryKey: ["metrics", "risk-by-state"],
    queryFn: () => apiClient.getRiskByState(),
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });
}

export function useTrends() {
  return useQuery({
    queryKey: ["metrics", "trends"],
    queryFn: () => apiClient.getTrends(),
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });
}

export function useRiskDistribution() {
  return useQuery({
    queryKey: ["metrics", "risk-distribution"],
    queryFn: () => apiClient.getRiskDistribution(),
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });
}

export function usePaymentAnomalies(days = 90) {
  return useQuery({
    queryKey: ["metrics", "payment-anomalies", days],
    queryFn: () => apiClient.getPaymentAnomalies(days),
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });
}

export function useRiskComponentsAvg() {
  return useQuery({
    queryKey: ["metrics", "risk-components-avg"],
    queryFn: () => apiClient.getRiskComponentsAvg(),
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });
}

// Events hooks — poll every 15s for near real-time updates
export function useEvents(params?: {
  program?: string;
  severity?: string;
  event_type?: string;
  state?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery<RiskEvent[]>({
    queryKey: ["events", params],
    queryFn: () => apiClient.getEvents(params),
    staleTime: 10 * 1000,
    refetchInterval: 15 * 1000,
  });
}

// Provider hooks
export function useProvider(npi: string) {
  return useQuery({
    queryKey: ["provider", npi],
    queryFn: () => apiClient.getProvider(npi),
    enabled: !!npi && npi.length === 10,
  });
}

export function useProviderBrief(npi: string) {
  return useQuery<ProviderBrief>({
    queryKey: ["provider-brief", npi],
    queryFn: () => apiClient.getProviderBrief(npi),
    enabled: !!npi && npi.length === 10,
  });
}

export function useProviderRisk(npi: string) {
  return useQuery<ProviderRisk>({
    queryKey: ["provider-risk", npi],
    queryFn: () => apiClient.getProviderRisk(npi),
    enabled: !!npi && npi.length === 10,
    staleTime: 5 * 60 * 1000, // 5 min
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useProviderBenchmark(npi: string) {
  return useQuery<ProviderBenchmark>({
    queryKey: ["provider-benchmark", npi],
    queryFn: () => apiClient.getProviderBenchmark(npi),
    enabled: !!npi && npi.length === 10,
  });
}

export function useProviderFinancials(npi: string) {
  return useQuery<ProviderFinancials>({
    queryKey: ["provider-financials", npi],
    queryFn: () => apiClient.getProviderFinancials(npi),
    enabled: !!npi && npi.length === 10,
  });
}

export function useProviderPolitical(npi: string, cycle?: number) {
  return useQuery<ProviderPolitical>({
    queryKey: ["provider-political", npi, cycle],
    queryFn: () => apiClient.getProviderPolitical(npi, cycle),
    enabled: !!npi && npi.length === 10,
  });
}

// Entity hooks
export function useEntity(entityId: string) {
  return useQuery<Entity>({
    queryKey: ["entity", entityId],
    queryFn: () => apiClient.getEntity(entityId),
    enabled: !!entityId,
  });
}

// Ownership hooks
export function useOwnership(npi: string) {
  return useQuery<OwnershipChain[]>({
    queryKey: ["ownership", npi],
    queryFn: () => apiClient.getOwnership(npi),
    enabled: !!npi && npi.length === 10,
  });
}

export function useOwnershipGraph(npi: string) {
  return useQuery({
    queryKey: ["ownership-graph", npi],
    queryFn: () => apiClient.getOwnershipGraph(npi),
    enabled: !!npi && npi.length === 10,
  });
}

// Payments hooks
export function usePayments(npi: string) {
  return useQuery<PaymentRecord[]>({
    queryKey: ["payments", npi],
    queryFn: () => apiClient.getPayments(npi),
    enabled: !!npi && npi.length === 10,
  });
}

// Exclusions hooks
export function useExclusions(params?: {
  state?: string;
  start_date?: string;
  end_date?: string;
  has_payments?: boolean;
  limit?: number;
  offset?: number;
}) {
  return useQuery<ExclusionRecord[]>({
    queryKey: ["exclusions", params],
    queryFn: () => apiClient.getExclusions(params),
  });
}

// Search hooks
export function useSearch(q: string, type?: string, limit?: number) {
  return useQuery<SearchResult[]>({
    queryKey: ["search", q, type, limit],
    queryFn: () => apiClient.search(q, type, limit),
    enabled: !!q && q.length >= 2,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Me / Settings hooks
const ME_QUERY_KEY = ["me"] as const;

export function useMe() {
  return useQuery<MeProfile>({
    queryKey: ME_QUERY_KEY,
    queryFn: () => apiClient.getMe(),
    staleTime: 60 * 1000,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiClient.updateProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
    },
  });
}

export function useSecurityLog() {
  return useQuery<MeSecurityLogEntry[]>({
    queryKey: [...ME_QUERY_KEY, "security-log"],
    queryFn: () => apiClient.getSecurityLog(),
  });
}

export function useRevokeSessions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiClient.revokeSessions,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...ME_QUERY_KEY, "security-log"] });
    },
  });
}

export function useNotifications() {
  return useQuery<MeNotificationPreferences>({
    queryKey: [...ME_QUERY_KEY, "notifications"],
    queryFn: () => apiClient.getNotifications(),
  });
}

export function useUpdateNotifications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiClient.updateNotifications,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: [...ME_QUERY_KEY, "notifications"] });
    },
  });
}

export function useOrganization() {
  return useQuery<MeOrganizationWithRole>({
    queryKey: [...ME_QUERY_KEY, "organization"],
    queryFn: () => apiClient.getOrganization(),
  });
}

export function useUpdateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiClient.updateOrganization,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: [...ME_QUERY_KEY, "organization"] });
      queryClient.invalidateQueries({ queryKey: [...ME_QUERY_KEY, "organization-members"] });
    },
  });
}

export function useOrganizationMembers() {
  return useQuery<MeMember[]>({
    queryKey: [...ME_QUERY_KEY, "organization-members"],
    queryFn: () => apiClient.getOrganizationMembers(),
  });
}

export function useUpdateMemberRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: "viewer" | "analyst" | "admin" }) =>
      apiClient.updateMemberRole(memberId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...ME_QUERY_KEY, "organization-members"] });
    },
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiClient.removeMember,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...ME_QUERY_KEY, "organization-members"] });
    },
  });
}

export function useApiKeys() {
  return useQuery<MeApiKey[]>({
    queryKey: [...ME_QUERY_KEY, "api-keys"],
    queryFn: () => apiClient.getApiKeys(),
  });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiClient.createApiKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...ME_QUERY_KEY, "api-keys"] });
    },
  });
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: apiClient.revokeApiKey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...ME_QUERY_KEY, "api-keys"] });
    },
  });
}
