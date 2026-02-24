/**
 * Client-side export utilities for provider data and ownership graph.
 * Formats chosen for compliance/analyst workflows: Excel-ready CSV, JSON, and graph image/data.
 */

import type { ProviderBrief, ProviderRisk } from "@/types/api";
import type { PaymentRecord, OwnershipChain } from "@/types/api";

// ——— Blob download ———

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ——— Provider export ———

/** Escape CSV field (quotes and commas). */
function escapeCsv(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Build Excel-friendly CSV from rows (array of string arrays). */
function rowsToCsv(rows: (string | number | null | undefined)[][]): string {
  const BOM = "\uFEFF";
  const lines = rows.map((row) => row.map(escapeCsv).join(","));
  return BOM + lines.join("\r\n");
}

/**
 * Export provider brief + payments as a single flat CSV (one row per payment, provider fields repeated).
 * Ideal for Excel pivot tables and compliance reports.
 */
export function exportProviderCsv(
  brief: ProviderBrief,
  payments: PaymentRecord[] | undefined
): string {
  const header = [
    "NPI",
    "Provider Name",
    "Entity Type",
    "Taxonomy",
    "City",
    "State",
    "ZIP",
    "Risk Score",
    "Risk Label",
    "Total Payments (All Programs)",
    "Years Active",
    "Top Program",
    "Recent Trend",
    "Year",
    "Program",
    "Payments",
    "Allowed",
    "Claims",
    "Beneficiaries",
  ];
  const name = brief.provider?.name ?? "";
  const entityType = brief.provider?.entity_type ?? "";
  const taxonomy = brief.provider?.taxonomy ?? "";
  const city = brief.provider?.city ?? "";
  const state = brief.provider?.state ?? "";
  const zip = brief.provider?.zip ?? "";
  const riskScore = brief.risk?.risk_score ?? "";
  const riskLabel = brief.risk?.risk_label ?? "";
  const totalAll = brief.payments_summary?.total_all_programs ?? "";
  const yearsActive = brief.payments_summary?.years_active ?? "";
  const topProgram = brief.payments_summary?.top_program ?? "";
  const recentTrend = brief.payments_summary?.recent_trend ?? "";

  const rows: (string | number | null | undefined)[][] = [header];

  if (!payments || payments.length === 0) {
    rows.push([
      brief.npi,
      name,
      entityType,
      taxonomy,
      city,
      state,
      zip,
      riskScore,
      riskLabel,
      totalAll,
      yearsActive,
      topProgram,
      recentTrend,
      "",
      "",
      "",
      "",
      "",
      "",
    ]);
  } else {
    for (const p of payments) {
      rows.push([
        brief.npi,
        name,
        entityType,
        taxonomy,
        city,
        state,
        zip,
        riskScore,
        riskLabel,
        totalAll,
        yearsActive,
        topProgram,
        recentTrend,
        p.year,
        p.program,
        p.payments,
        p.allowed,
        p.claims,
        p.beneficiaries,
      ]);
    }
  }

  return rowsToCsv(rows);
}

/**
 * Full provider report as JSON (brief + payments + ownership + risk) for APIs and archives.
 */
export function exportProviderJson(
  brief: ProviderBrief,
  payments: PaymentRecord[] | undefined,
  ownership: OwnershipChain[] | undefined,
  risk: ProviderRisk | null | undefined
): string {
  const payload = {
    exported_at: new Date().toISOString(),
    npi: brief.npi,
    provider: brief.provider,
    risk: brief.risk,
    payments_summary: brief.payments_summary,
    exclusions: brief.exclusions,
    financials_summary: brief.financials_summary,
    political_connections: brief.political_connections,
    meta: brief.meta,
    payments: payments ?? [],
    ownership_chain: ownership ?? [],
    risk_detail: risk ?? null,
  };
  return JSON.stringify(payload, null, 2);
}

// ——— Ownership graph export ———

export interface GraphNode {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
}

/** Export graph as JSON (nodes + edges). */
export function exportGraphJson(
  nodes: GraphNode[],
  edges: GraphEdge[]
): string {
  return JSON.stringify({ nodes, edges }, null, 2);
}

/** Export graph as CSV: two logical tables (nodes, edges) in one file with section headers. */
export function exportGraphCsv(
  nodes: GraphNode[],
  edges: GraphEdge[]
): string {
  const nodeHeader = ["node_id", "type", "label"];
  const nodeRows = nodes.map((n) => [
    n.id,
    n.type ?? "",
    (n.data?.label as string) ?? n.id,
  ]);
  const edgeHeader = ["edge_id", "source", "target"];
  const edgeRows = edges.map((e) => [e.id, e.source, e.target]);

  const lines: string[] = [
    "nodes",
    nodeHeader.map(escapeCsv).join(","),
    ...nodeRows.map((row) => row.map(escapeCsv).join(",")),
    "",
    "edges",
    edgeHeader.map(escapeCsv).join(","),
    ...edgeRows.map((row) => row.map(escapeCsv).join(",")),
  ];
  return "\uFEFF" + lines.join("\r\n");
}
