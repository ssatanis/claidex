"use client";

import { use, useRef, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  MapPin,
  Building2,
  AlertTriangle,
  DollarSign,
  TrendingUp,
  Shield,
} from "lucide-react";
import {
  useProviderBrief,
  useProviderRisk,
  usePayments,
  useOwnership,
  useOwnershipGraph,
} from "@/hooks/use-api";
import { AddToWatchlistDropdown } from "@/components/watchlists/AddToWatchlistDropdown";
import { ProviderExportDropdown } from "@/components/ProviderExportDropdown";
import dynamic from "next/dynamic";

const ReactFlowWrapper = dynamic(
  () => import("@/components/ownership-graph").then((m) => m.OwnershipGraph),
  { ssr: false }
);
import { formatCurrency, abbreviateNumber, getRiskLevel } from "@/lib/utils";

interface PageProps {
  params: Promise<{ npi: string }>;
}

export default function ProviderDetailPage({ params }: PageProps) {
  const { npi } = use(params);
  const [activeTab, setActiveTab] = useState("overview");
  const graphContainerRef = useRef<HTMLDivElement | null>(null);

  // Fetch all provider data
  const { data: brief, isLoading: briefLoading, error: briefError } = useProviderBrief(npi);
  const { data: risk, isLoading: riskLoading } = useProviderRisk(npi);
  const { data: payments, isLoading: paymentsLoading } = usePayments(npi);
  const { data: ownership, isLoading: ownershipLoading } = useOwnership(npi);
  const { data: ownershipGraph, isLoading: graphLoading } = useOwnershipGraph(npi);

  if (briefLoading) {
    return (
      <AppShell>
        <div className="space-y-6">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </AppShell>
    );
  }

  if (briefError || !brief) {
    return (
      <AppShell>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 px-6 max-w-md mx-auto text-center">
            <AlertTriangle className="h-14 w-14 text-amber-500 mb-4" strokeWidth={1.5} aria-hidden />
            <h1 className="text-h3 text-black mb-2">Provider not in database</h1>
            <p className="text-body-sm text-gray-600 mb-6">
              NPI <span className="font-mono font-medium text-black">{npi}</span> is not in our provider registry yet. It may appear in risk events or exclusions before being fully loaded.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button variant="primary" size="sm" asChild>
                <a href="/">Search providers</a>
              </Button>
              <Button variant="secondary" size="sm" asChild>
                <a href="/events">View risk events</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const riskLevel = getRiskLevel(brief.risk.risk_score);

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h1 className="text-h1 text-black mb-2">{brief.provider.name}</h1>
                <div className="flex flex-wrap items-center gap-4 text-body-sm text-gray-600">
                  <div className="flex items-center gap-1.5">
                    <Building2 className="h-4 w-4" strokeWidth={1.5} />
                    <span>NPI: {brief.npi}</span>
                  </div>
                  {brief.provider.taxonomy && (
                    <div className="flex items-center gap-1.5">
                      <span>{brief.provider.taxonomy}</span>
                    </div>
                  )}
                  {brief.provider.city && brief.provider.state && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-4 w-4" strokeWidth={1.5} />
                      <span>
                        {brief.provider.city}, {brief.provider.state}
                      </span>
                    </div>
                  )}
                </div>

                {/* Entity Type Badge */}
                <div className="mt-3">
                  <Badge variant="category" size="md">
                    {brief.provider.entity_type === "individual"
                      ? "Individual Provider"
                      : "Organization"}
                  </Badge>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <AddToWatchlistDropdown
                  npi={npi}
                  providerName={brief.provider.name}
                  variant="secondary"
                  size="sm"
                />
                <ProviderExportDropdown
                  npi={npi}
                  providerName={brief.provider.name}
                  brief={brief}
                  payments={payments}
                  ownership={ownership}
                  risk={risk ?? null}
                  graphNodes={ownershipGraph?.nodes ?? []}
                  graphEdges={ownershipGraph?.edges ?? []}
                  graphContainerRef={graphContainerRef}
                  onSwitchToOwnership={() => setActiveTab("ownership")}
                  variant="secondary"
                  size="sm"
                />
              </div>
            </div>

            {/* Risk Score Banner */}
            {brief.risk.risk_score !== null && (
              <div className="mt-6 border-t border-gray-200 pt-6">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-caption text-gray-600 mb-1">RISK SCORE</p>
                    <div className="flex items-baseline gap-3">
                      <span className={`text-display ${riskLevel.color}`}>
                        {brief.risk.risk_score}
                      </span>
                      <Badge
                        variant={riskLevel.variant}
                        size="md"
                        showDot
                        className="capitalize"
                      >
                        {riskLevel.label}
                      </Badge>
                    </div>
                  </div>
                  {brief.risk.flags.length > 0 && (
                    <div className="flex-1 border-l border-gray-200 pl-4">
                      <p className="text-caption text-gray-600 mb-2">RISK FLAGS</p>
                      <div className="flex flex-wrap gap-2">
                        {brief.risk.flags.slice(0, 3).map((flag, i) => (
                          <Badge key={i} variant="status" size="sm">
                            {flag}
                          </Badge>
                        ))}
                        {brief.risk.flags.length > 3 && (
                          <Badge variant="status" size="sm">
                            +{brief.risk.flags.length - 3} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Main Content: Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="ownership">Ownership</TabsTrigger>
            <TabsTrigger value="risk">Risk Analysis</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Payments Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5" strokeWidth={1.5} />
                    Payments Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-caption text-gray-600">Total All Programs</p>
                    <p className="text-h3 text-black">
                      {formatCurrency(brief.payments_summary.total_all_programs)}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-3 border-t border-gray-200">
                    <div>
                      <p className="text-caption text-gray-600">Years Active</p>
                      <p className="text-body font-semibold text-black">
                        {brief.payments_summary.years_active}
                      </p>
                    </div>
                    <div>
                      <p className="text-caption text-gray-600">Top Program</p>
                      <p className="text-body font-semibold text-black">
                        {brief.payments_summary.top_program || "N/A"}
                      </p>
                    </div>
                  </div>
                  <div className="pt-2">
                    <Badge variant="category" size="sm">
                      Trend: {brief.payments_summary.recent_trend}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Exclusions */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" strokeWidth={1.5} />
                    Exclusions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {brief.exclusions.length === 0 ? (
                    <p className="text-body text-gray-600">No active exclusions</p>
                  ) : (
                    <div className="space-y-3">
                      {brief.exclusions.slice(0, 3).map((excl: any, i: number) => (
                        <div key={i} className="border-l-2 border-red-600 pl-3">
                          <p className="text-body-sm font-medium text-black">
                            {excl.exclType || "Exclusion"}
                          </p>
                          <p className="text-caption text-gray-600">
                            {excl.exclDate || "Unknown date"}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Financials Summary */}
              {brief.financials_summary.has_hcris_data && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5" strokeWidth={1.5} />
                      Financials
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-body text-gray-600">
                      HCRIS financial data available
                    </p>
                    <Badge variant="low" size="sm" className="mt-2">
                      Hospital / SNF Data
                    </Badge>
                  </CardContent>
                </Card>
              )}

              {/* Political Connections */}
              {brief.political_connections.major_donor && (
                <Card>
                  <CardHeader>
                    <CardTitle>Political Connections</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div>
                      <p className="text-caption text-gray-600">Total Donated</p>
                      <p className="text-body font-semibold text-black">
                        {formatCurrency(brief.political_connections.total_donated)}
                      </p>
                    </div>
                    {brief.political_connections.dominant_party && (
                      <Badge variant="category" size="sm">
                        {brief.political_connections.dominant_party}
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Location */}
              {(brief.provider.city || brief.provider.state || brief.provider.zip) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="h-5 w-5" strokeWidth={1.5} />
                      Location
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-body text-black">
                      {[brief.provider.city, brief.provider.state, brief.provider.zip].filter(Boolean).join(", ")}
                    </p>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([brief.provider.city, brief.provider.state, brief.provider.zip].filter(Boolean).join(", "))}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-[#6ABF36] hover:underline"
                    >
                      View on map →
                    </a>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Payments Tab */}
          <TabsContent value="payments" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Payment Records</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {paymentsLoading ? (
                  <div className="space-y-2 p-6">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : !payments || payments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <p className="text-body text-gray-600">No payment records found</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Year</TableHead>
                        <TableHead>Program</TableHead>
                        <TableHead>Payments</TableHead>
                        <TableHead>Claims</TableHead>
                        <TableHead>Beneficiaries</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((payment) => (
                        <TableRow key={payment.record_id}>
                          <TableCell className="font-medium">{payment.year}</TableCell>
                          <TableCell>
                            <Badge variant="category" size="sm">
                              {payment.program}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-semibold">
                            {payment.payments ? formatCurrency(payment.payments) : "—"}
                          </TableCell>
                          <TableCell>
                            {payment.claims ? abbreviateNumber(payment.claims) : "—"}
                          </TableCell>
                          <TableCell>
                            {payment.beneficiaries
                              ? abbreviateNumber(payment.beneficiaries)
                              : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Ownership Tab */}
          <TabsContent value="ownership" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Ownership Graph</CardTitle>
              </CardHeader>
              <CardContent>
                {graphLoading ? (
                  <Skeleton className="h-[400px] w-full" />
                ) : ownershipGraph?.nodes?.length ? (
                  <div
                    ref={graphContainerRef}
                    className="h-[400px] w-full rounded border border-gray-200 bg-gray-50"
                  >
                    <ReactFlowWrapper
                      nodes={ownershipGraph.nodes}
                      edges={ownershipGraph.edges}
                    />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16">
                    <Building2 className="h-16 w-16 text-gray-300 mb-4" strokeWidth={1.5} />
                    <p className="text-body text-gray-600">No ownership data available for this provider</p>
                  </div>
                )}
              </CardContent>
            </Card>
            {ownership && ownership.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Ownership Chain (list)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {ownership.map((owner) => (
                      <div
                        key={owner.entity_id}
                        className="border-l-2 border-[#6ABF36] pl-4 py-2"
                        style={{ marginLeft: `${owner.depth * 24}px` }}
                      >
                        <p className="text-body font-semibold text-black">
                          {owner.name || "Unknown Entity"}
                        </p>
                        <p className="text-caption text-gray-600">
                          {owner.roleText || owner.roleCode || "Owner"} • Depth {owner.depth}
                        </p>
                        {owner.ownershipPct != null && (
                          <Badge variant="low" size="sm" className="mt-1">
                            {owner.ownershipPct}% ownership
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Risk Analysis Tab */}
          <TabsContent value="risk" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Risk Components</CardTitle>
              </CardHeader>
              <CardContent>
                {riskLoading ? (
                  <Skeleton className="h-64 w-full" />
                ) : risk ? (
                  <div className="space-y-4">
                    {Object.entries(risk.components).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between py-2 border-b border-gray-200">
                        <span className="text-body text-gray-700 capitalize">
                          {key.replace(/_/g, " ")}
                        </span>
                        <span className="text-body font-semibold text-black">
                          {typeof value === "number" ? value.toFixed(2) : value}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-body text-gray-600">No risk analysis available</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
