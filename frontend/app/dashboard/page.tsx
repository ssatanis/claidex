"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  AlertTriangle,
  DollarSign,
  Shield,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  Network,
  Clock,
  ChevronLeft,
  ChevronRight,
  Zap,
  BarChart2,
  PanelRightOpen,
  RefreshCw,
} from "lucide-react";
import {
  useDashboardMetrics,
  useEvents,
  useRiskByState,
  useTrends,
  useRiskDistribution,
  usePaymentAnomalies,
  useRiskComponentsAvg,
} from "@/hooks/use-api";
import { apiClient } from "@/lib/api-client";
import { abbreviateNumber, formatRelativeTime, cn } from "@/lib/utils";
import type { RiskEvent } from "@/types/api";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { RiskDonutChart } from "@/components/dashboard/risk-donut-chart";
import { RiskTrendChart } from "@/components/dashboard/risk-trend-chart";
import { RiskRadarChart } from "@/components/dashboard/risk-radar-chart";
import { PaymentHeatmap } from "@/components/dashboard/payment-heatmap";
import { RiskByStateTable } from "@/components/dashboard/risk-by-state-table";
import Link from "next/link";

type SeverityFilter = "all" | "critical" | "high" | "medium" | "low";
type ProgramFilter = "All" | "Medicare" | "Medicaid";

const ITEMS_PER_PAGE = 50;

const fadeIn = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35 },
};

export default function DashboardPage() {
  // Filters
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [programFilter, setProgramFilter] = useState<ProgramFilter>("All");
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("");
  const [page, setPage] = useState(0);

  // UI state
  const [selectedEvent, setSelectedEvent] = useState<RiskEvent | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const [newEventsCount, setNewEventsCount] = useState(0);
  const prevEventsRef = useRef<string[]>([]);

  // Top providers list for bar chart
  const [topProviders, setTopProviders] = useState<any[]>([]);
  const [topProvidersLoading, setTopProvidersLoading] = useState(true);

  // Data hooks
  const {
    data: metrics,
    isLoading: metricsLoading,
    error: metricsError,
    refetch: refetchMetrics,
  } = useDashboardMetrics();

  const {
    data: events,
    isLoading: eventsLoading,
    error: eventsError,
  } = useEvents({
    severity: severityFilter !== "all" ? severityFilter : undefined,
    program: programFilter !== "All" ? programFilter : undefined,
    event_type: eventTypeFilter !== "all" ? eventTypeFilter : undefined,
    state: stateFilter || undefined,
    limit: ITEMS_PER_PAGE,
    offset: page * ITEMS_PER_PAGE,
  });

  const { data: riskByState, isLoading: stateLoading } = useRiskByState();
  const { data: trends, isLoading: trendsLoading } = useTrends();
  const { data: riskDistribution, isLoading: distLoading } = useRiskDistribution();
  const { data: paymentAnomalies, isLoading: anomalyLoading } = usePaymentAnomalies(90);
  const { data: riskComponents, isLoading: componentsLoading } = useRiskComponentsAvg();

  // Detect new events and show notification badge
  useEffect(() => {
    if (!events || events.length === 0) return;
    const currentIds = events.map((e) => e.id);
    const prevIds = prevEventsRef.current;
    if (prevIds.length > 0) {
      const newCount = currentIds.filter((id) => !prevIds.includes(id)).length;
      if (newCount > 0) setNewEventsCount((n) => n + newCount);
    }
    prevEventsRef.current = currentIds;
  }, [events]);

  // Fetch top high-risk providers (by risk score desc; no label filter so we get top 10 by score)
  useEffect(() => {
    setTopProvidersLoading(true);
    apiClient
      .getProvidersList({ limit: 10, sort: "risk_score", order: "desc" })
      .then((data: any[]) => setTopProviders(data))
      .catch(() => setTopProviders([]))
      .finally(() => setTopProvidersLoading(false));
  }, []);

  // Reset page on filter changes
  useEffect(() => { setPage(0); }, [severityFilter, programFilter, eventTypeFilter, stateFilter]);

  const handleStateClick = useCallback((state: string) => {
    setStateFilter((prev) => (prev === state ? "" : state));
  }, []);

  const handleDistributionClick = useCallback((label: string) => {
    // Could filter events by risk label — for now it's informational
    console.log("Filter by risk label:", label);
  }, []);

  // Severity chip styles
  const getSeverityStyle = (severity: string, active: boolean) => {
    const base = "px-3 py-1 text-[11px] font-semibold tracking-wide border transition-all";
    if (active) {
      const colors: Record<string, string> = {
        all: "border-black bg-black text-white",
        critical: "border-red-600 bg-red-600 text-white",
        high: "border-orange-600 bg-orange-600 text-white",
        medium: "border-amber-600 bg-amber-600 text-white",
        low: "border-green-600 bg-green-600 text-white",
      };
      return `${base} ${colors[severity] ?? colors.all}`;
    }
    return `${base} border-gray-200 bg-white text-gray-600 hover:bg-gray-50`;
  };

  // Compute network integrity badge


  return (
    <AppShell>
      {/* Right-side activity feed */}
      <ActivityFeed open={activityOpen} onClose={() => setActivityOpen(false)} />


      <div className={cn("space-y-8 transition-all duration-300", activityOpen && "mr-80")}>

        {/* ── Page Header ── */}
        <motion.div {...fadeIn} className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-h1 text-black">Risk Intelligence Dashboard</h1>
            <p className="mt-1 text-body-sm text-gray-500">
              Healthcare provider compliance monitoring
              {stateFilter && (
                <span className="ml-2 inline-flex items-center gap-1">
                  — Filtered:
                  <button
                    onClick={() => setStateFilter("")}
                    className="font-semibold text-black hover:underline"
                  >
                    {stateFilter} ×
                  </button>
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => refetchMetrics()}
              className="p-1.5 hover:bg-gray-100 transition-colors"
              title="Refresh metrics"
            >
              <RefreshCw className="h-4 w-4 text-gray-400" />
            </button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setActivityOpen((o) => !o);
                setNewEventsCount(0);
              }}
              className="flex items-center gap-2 relative"
            >
              <PanelRightOpen className="h-4 w-4" />
              Live Feed
              {newEventsCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 h-4 w-4 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {Math.min(newEventsCount, 9)}
                </span>
              )}
            </Button>
          </div>
        </motion.div>

        {/* ── Section 1: KPI Grid (original 4 cards) ── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.05 }}
        >
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-4">
            <KpiCard
              title="Total Providers"
              value={metricsLoading ? null : abbreviateNumber(metrics?.total_providers ?? 0)}
              subtitle="Active NPIs in database"
              icon={<Users className="h-3.5 w-3.5" />}
              loading={metricsLoading}
              error={!!metricsError}
              onRetry={refetchMetrics}
            />
            <KpiCard
              title="High-Risk Providers"
              value={metricsLoading ? null : abbreviateNumber(metrics?.high_risk_providers ?? 0)}
              subtitle="Elevated or High risk label"
              icon={<AlertTriangle className="h-3.5 w-3.5" />}
              loading={metricsLoading}
              error={!!metricsError}
              onRetry={refetchMetrics}
            />
            <KpiCard
              title="Active Exclusions"
              value={metricsLoading ? null : abbreviateNumber(metrics?.active_exclusions ?? 0)}
              subtitle="Currently excluded from programs"
              icon={<Shield className="h-3.5 w-3.5" />}
              loading={metricsLoading}
              error={!!metricsError}
              onRetry={refetchMetrics}
            />
            <KpiCard
              title="Flagged Payments"
              value={metricsLoading ? null : abbreviateNumber(metrics?.flagged_payments ?? 0)}
              subtitle="Billing outlier flags detected"
              icon={<DollarSign className="h-3.5 w-3.5" />}
              loading={metricsLoading}
              error={!!metricsError}
              onRetry={refetchMetrics}
            />
          </div>
        </motion.div>

        {/* ── Section 2: Risk Events Feed ── */}
        <motion.div {...fadeIn} transition={{ delay: 0.15, duration: 0.35 }}>
          <Card>
            <CardHeader className="border-b border-gray-200 space-y-4">
              {/* Title row */}
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-semibold">Risk Events</CardTitle>
                {newEventsCount > 0 && (
                  <AnimatePresence>
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      className="text-[10px] font-bold bg-red-500 text-white px-2 py-0.5 rounded"
                    >
                      {newEventsCount} new
                    </motion.span>
                  </AnimatePresence>
                )}
              </div>

              {/* Filters: single horizontal row */}
              <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wider shrink-0">Severity</span>
                <div className="flex gap-1.5 shrink-0">
                  {(["all", "critical", "high", "medium", "low"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => { setSeverityFilter(s); setNewEventsCount(0); }}
                      className={getSeverityStyle(s, severityFilter === s)}
                    >
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
                <div className="hidden sm:block w-px h-6 bg-gray-200 shrink-0" aria-hidden />
                <div className="flex items-center gap-2 shrink-0">
                  <label htmlFor="event-type-filter" className="text-xs font-medium text-gray-500 whitespace-nowrap">Event type</label>
                  <div className="w-[180px]">
                    <Select
                      id="event-type-filter"
                      value={eventTypeFilter}
                      onChange={(e) => setEventTypeFilter(e.target.value)}
                      className="w-full text-xs h-9 border-gray-300"
                    >
                      <option value="all">All Event Types</option>
                      <option value="Exclusion">Exclusion</option>
                      <option value="Risk Score Change">Risk Score Change</option>
                      <option value="Payment Spike">Payment Spike</option>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <label htmlFor="program-filter" className="text-xs font-medium text-gray-500 whitespace-nowrap">Program</label>
                  <div className="w-[140px]">
                    <Select
                      id="program-filter"
                      value={programFilter}
                      onChange={(e) => setProgramFilter(e.target.value as ProgramFilter)}
                      className="w-full text-xs h-9 border-gray-300"
                    >
                      <option value="All">All Programs</option>
                      <option value="Medicare">Medicare</option>
                      <option value="Medicaid">Medicaid</option>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Active filters display */}
              {stateFilter && (
                <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                  <span className="text-xs text-gray-400">Active filters:</span>
                  <button
                    onClick={() => setStateFilter("")}
                    className="text-xs bg-black text-white px-2 py-0.5 hover:bg-gray-800 transition-colors rounded"
                  >
                    State: {stateFilter} ×
                  </button>
                </div>
              )}
            </CardHeader>

            <CardContent className="p-0">
              {eventsLoading ? (
                <div className="space-y-0 divide-y divide-gray-100">
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className="px-6 py-4">
                      <Skeleton className="h-8 w-full" />
                    </div>
                  ))}
                </div>
              ) : eventsError ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <AlertTriangle className="h-10 w-10 text-red-300" strokeWidth={1.5} />
                  <p className="text-sm text-red-500 font-medium">Failed to load events</p>
                  <p className="text-xs text-gray-400">Check API connection</p>
                </div>
              ) : !events || events.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2">
                  <AlertTriangle className="h-10 w-10 text-gray-200" strokeWidth={1.5} />
                  <p className="text-sm text-gray-500">No events match current filters</p>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-28">Severity</TableHead>
                        <TableHead className="w-44">Event Type</TableHead>
                        <TableHead>Provider</TableHead>
                        <TableHead className="w-24">State</TableHead>
                        <TableHead className="w-36 text-right">Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {events.map((event, i) => (
                        <motion.tr
                          key={event.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.02 }}
                          onClick={() => setSelectedEvent(event)}
                          className="cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-100"
                        >
                          <TableCell>
                            <Badge
                              variant={event.severity as any}
                              showDot
                              size="sm"
                              className="capitalize"
                            >
                              {event.severity}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm font-medium text-gray-700">
                            {event.event_type}
                          </TableCell>
                          <TableCell>
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-black truncate max-w-[240px]">
                                {event.provider_name}
                              </div>
                              {event.provider_npi && (
                                <div className="text-[11px] text-gray-400 font-mono">
                                  {event.provider_npi}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-gray-500">
                            {event.state ?? "—"}
                          </TableCell>
                          {/* Impact column removed, not in original event type */}
                          <TableCell className="text-right text-xs text-gray-400">
                            {formatRelativeTime(event.timestamp)}
                          </TableCell>
                        </motion.tr>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Pagination */}
                  <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4">
                    <p className="text-xs text-gray-400">
                      Showing {page * ITEMS_PER_PAGE + 1}–
                      {page * ITEMS_PER_PAGE + events.length} events
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setPage(Math.max(0, page - 1))}
                        disabled={page === 0}
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </Button>
                      <span className="flex items-center px-2 text-xs text-gray-500">
                        Page {page + 1}
                      </span>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setPage(page + 1)}
                        disabled={events.length < ITEMS_PER_PAGE}
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* ── Section 3: Charts 2×3 Grid ── */}
        <motion.div {...fadeIn} transition={{ delay: 0.2, duration: 0.35 }}>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">

            {/* 3.1 Risk by State */}
            <Card className="xl:col-span-1">
              <CardHeader className="border-b border-gray-100 pb-3">
                <CardTitle className="text-sm font-semibold">Risk by State</CardTitle>
                <p className="text-caption text-gray-400 mt-0.5">
                  High-risk provider concentration — click to filter
                </p>
              </CardHeader>
              <CardContent className="pt-4">
                <RiskByStateTable
                  data={riskByState}
                  loading={stateLoading}
                  onStateClick={handleStateClick}
                  activeState={stateFilter}
                />
              </CardContent>
            </Card>

            {/* 3.2 Risk Distribution Donut */}
            <Card>
              <CardHeader className="border-b border-gray-100 pb-3">
                <CardTitle className="text-sm font-semibold">Risk Distribution</CardTitle>
                <p className="text-caption text-gray-400 mt-0.5">
                  Providers by risk label — click segment to filter
                </p>
              </CardHeader>
              <CardContent className="pt-4">
                <RiskDonutChart
                  data={riskDistribution}
                  loading={distLoading}
                  onSegmentClick={handleDistributionClick}
                />
              </CardContent>
            </Card>

            {/* 3.3 Risk Trends */}
            <Card className="xl:col-span-1">
              <CardHeader className="border-b border-gray-100 pb-3">
                <CardTitle className="text-sm font-semibold">Risk Trends Over Time</CardTitle>
                <p className="text-caption text-gray-400 mt-0.5">Monthly counts by risk label</p>
              </CardHeader>
              <CardContent className="pt-4">
                <RiskTrendChart data={trends} loading={trendsLoading} />
              </CardContent>
            </Card>

            {/* 3.4 Top 10 High-Risk Providers — cards */}
            <Card>
              <CardHeader className="border-b border-gray-100 pb-3">
                <CardTitle className="text-sm font-semibold">Top High-Risk Providers</CardTitle>
                <p className="text-caption text-gray-400 mt-0.5">
                  By risk score (click to view profile)
                </p>
              </CardHeader>
              <CardContent className="pt-4">
                {topProvidersLoading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-14 w-full" />
                    ))}
                  </div>
                ) : !topProviders?.length ? (
                  <p className="text-sm text-gray-500 py-4">No providers to show</p>
                ) : (
                  <div className="space-y-2">
                    {topProviders.map((p: { npi?: string; name?: string; risk_score?: number | null; risk_label?: string }) => (
                      <Link
                        key={p.npi ?? p.name}
                        href={p.npi ? `/providers/${p.npi}` : "#"}
                        className="block rounded-lg border border-gray-100 bg-gray-50/50 px-3 py-2.5 hover:bg-gray-100 hover:border-gray-200 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-black truncate">{p.name ?? "—"}</span>
                          <Badge variant="category" className="text-[10px] shrink-0">
                            {p.risk_label ?? (p.risk_score != null ? String(p.risk_score) : "—")}
                          </Badge>
                        </div>
                        {p.npi && (
                          <p className="text-xs text-gray-500 mt-0.5">NPI {p.npi}</p>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 3.5 Payment Anomalies Heatmap */}
            <Card>
              <CardHeader className="border-b border-gray-100 pb-3">
                <CardTitle className="text-sm font-semibold">Payment Anomaly Heatmap</CardTitle>
                <p className="text-caption text-gray-400 mt-0.5">
                  Billing outlier frequency — last 90 days
                </p>
              </CardHeader>
              <CardContent className="pt-4">
                <PaymentHeatmap
                  data={paymentAnomalies}
                  loading={anomalyLoading}
                />
              </CardContent>
            </Card>

            {/* 3.6 Risk Components Radar */}
            <Card>
              <CardHeader className="border-b border-gray-100 pb-3">
                <CardTitle className="text-sm font-semibold">Risk Component Breakdown</CardTitle>
                <p className="text-caption text-gray-400 mt-0.5">
                  Portfolio-wide avg across High/Elevated providers
                </p>
              </CardHeader>
              <CardContent className="pt-4">
                <RiskRadarChart data={riskComponents} loading={componentsLoading} />
              </CardContent>
            </Card>
          </div>
        </motion.div>

      </div>
    </AppShell>
  );
}
