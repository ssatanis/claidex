"use client";

import { useCallback, useState } from "react";
import { toPng, toSvg } from "html-to-image";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Download,
  FileSpreadsheet,
  FileJson,
  Image,
  Network,
  FileText,
  Loader2,
} from "lucide-react";
import type { ProviderBrief, ProviderRisk } from "@/types/api";
import type { PaymentRecord, OwnershipChain } from "@/types/api";
import {
  downloadBlob,
  exportProviderCsv,
  exportProviderJson,
  exportGraphJson,
  exportGraphCsv,
  type GraphNode,
  type GraphEdge,
} from "@/lib/export-utils";

interface ProviderExportDropdownProps {
  npi: string;
  providerName: string;
  brief: ProviderBrief;
  payments?: PaymentRecord[];
  ownership?: OwnershipChain[];
  /** Graph nodes/edges for data export (JSON/CSV). */
  graphNodes?: GraphNode[];
  graphEdges?: GraphEdge[];
  /** Ref to the div wrapping the ReactFlow graph (for PNG/SVG). Must be visible for image export. */
  graphContainerRef: React.RefObject<HTMLDivElement | null>;
  /** Call before capturing graph image so the graph tab is visible. */
  onSwitchToOwnership?: () => void;
  /** Full risk detail for JSON export (optional). */
  risk?: ProviderRisk | null;
  variant?: "primary" | "secondary" | "accent" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}

export function ProviderExportDropdown({
  npi,
  providerName,
  brief,
  payments,
  ownership,
  risk,
  graphNodes = [],
  graphEdges = [],
  graphContainerRef,
  onSwitchToOwnership,
  variant = "secondary",
  size = "sm",
}: ProviderExportDropdownProps) {
  const [exporting, setExporting] = useState<string | null>(null);

  const safeName = (providerName || `NPI-${npi}`).replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").slice(0, 48);
  const baseName = `claidex-${safeName}-${npi}`;

  const doExport = useCallback(
    async (key: string, fn: () => void | Promise<void>) => {
      setExporting(key);
      try {
        await fn();
      } catch (e) {
        console.error("Export failed:", e);
      } finally {
        setExporting(null);
      }
    },
    []
  );

  const handleProviderCsv = useCallback(() => {
    doExport("provider-csv", () => {
      const csv = exportProviderCsv(brief, payments);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      downloadBlob(`${baseName}-profile.csv`, blob);
    });
  }, [brief, payments, baseName, doExport]);

  const handleProviderJson = useCallback(() => {
    doExport("provider-json", () => {
      const json = exportProviderJson(brief, payments, ownership, risk);
      const blob = new Blob([json], { type: "application/json" });
      downloadBlob(`${baseName}-report.json`, blob);
    });
  }, [brief, payments, ownership, risk, baseName, doExport]);

  const captureGraphImage = useCallback(
    async (format: "png" | "svg") => {
      onSwitchToOwnership?.();
      await new Promise((r) => setTimeout(r, 450));
      const el = graphContainerRef.current;
      if (!el || el.offsetWidth === 0 || el.offsetHeight === 0) {
        console.warn("Graph container not visible; open the Ownership tab and try again.");
        return;
      }
      const dataUrl =
        format === "png"
          ? await toPng(el, { pixelRatio: 2, backgroundColor: "#f9fafb" })
          : await toSvg(el, { backgroundColor: "#f9fafb" });
      const blob = await (await fetch(dataUrl)).blob();
      const mime = format === "png" ? "image/png" : "image/svg+xml";
      const ext = format === "png" ? "png" : "svg";
      downloadBlob(`${baseName}-ownership-graph.${ext}`, new Blob([blob], { type: mime }));
    },
    [graphContainerRef, onSwitchToOwnership, baseName]
  );

  const handleGraphPng = useCallback(() => {
    doExport("graph-png", () => captureGraphImage("png"));
  }, [doExport, captureGraphImage]);

  const handleGraphSvg = useCallback(() => {
    doExport("graph-svg", () => captureGraphImage("svg"));
  }, [doExport, captureGraphImage]);

  const handleGraphJson = useCallback(() => {
    doExport("graph-json", () => {
      const json = exportGraphJson(graphNodes, graphEdges);
      const blob = new Blob([json], { type: "application/json" });
      downloadBlob(`${baseName}-ownership-graph.json`, blob);
    });
  }, [graphNodes, graphEdges, baseName, doExport]);

  const handleGraphCsv = useCallback(() => {
    doExport("graph-csv", () => {
      const csv = exportGraphCsv(graphNodes, graphEdges);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      downloadBlob(`${baseName}-ownership-graph.csv`, blob);
    });
  }, [graphNodes, graphEdges, baseName, doExport]);

  const hasGraphData = graphNodes.length > 0 || graphEdges.length > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} disabled={!!exporting}>
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
          ) : (
            <Download className="h-4 w-4" strokeWidth={1.5} />
          )}
          <span>Export</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[280px] rounded-lg border border-gray-200 bg-white shadow-xl"
      >
        <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          Provider profile
        </DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            handleProviderCsv();
          }}
          className="flex cursor-pointer items-center gap-3 py-2.5 focus:bg-gray-100"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
            <FileSpreadsheet className="h-4 w-4" strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-black">Excel-ready CSV</p>
            <p className="text-xs text-gray-500">Open in Excel, pivot tables</p>
          </div>
          {exporting === "provider-csv" && (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gray-400" />
          )}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            handleProviderJson();
          }}
          className="flex cursor-pointer items-center gap-3 py-2.5 focus:bg-gray-100"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-700">
            <FileJson className="h-4 w-4" strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-black">Full report (JSON)</p>
            <p className="text-xs text-gray-500">Risk, payments, ownership</p>
          </div>
          {exporting === "provider-json" && (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gray-400" />
          )}
        </DropdownMenuItem>

        <DropdownMenuSeparator className="my-1 bg-gray-100" />

        <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          Ownership graph
        </DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            handleGraphPng();
          }}
          className="flex cursor-pointer items-center gap-3 py-2.5 focus:bg-gray-100"
          disabled={!hasGraphData}
          title={!hasGraphData ? "No graph data" : undefined}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-700">
            <Image className="h-4 w-4" strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-black">PNG image</p>
            <p className="text-xs text-gray-500">Screenshot of graph</p>
          </div>
          {exporting === "graph-png" && (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gray-400" />
          )}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            handleGraphSvg();
          }}
          className="flex cursor-pointer items-center gap-3 py-2.5 focus:bg-gray-100"
          disabled={!hasGraphData}
          title={!hasGraphData ? "No graph data" : undefined}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-violet-50 text-violet-700">
            <FileText className="h-4 w-4" strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-black">SVG image</p>
            <p className="text-xs text-gray-500">Vector, scalable</p>
          </div>
          {exporting === "graph-svg" && (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gray-400" />
          )}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            handleGraphJson();
          }}
          className="flex cursor-pointer items-center gap-3 py-2.5 focus:bg-gray-100"
          disabled={!hasGraphData}
          title={!hasGraphData ? "No graph data" : undefined}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-700">
            <Network className="h-4 w-4" strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-black">JSON (nodes & edges)</p>
            <p className="text-xs text-gray-500">For integration</p>
          </div>
          {exporting === "graph-json" && (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gray-400" />
          )}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            handleGraphCsv();
          }}
          className="flex cursor-pointer items-center gap-3 py-2.5 focus:bg-gray-100"
          disabled={!hasGraphData}
          title={!hasGraphData ? "No graph data" : undefined}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-teal-50 text-teal-700">
            <FileSpreadsheet className="h-4 w-4" strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-black">CSV (nodes & edges)</p>
            <p className="text-xs text-gray-500">Tables for analysis</p>
          </div>
          {exporting === "graph-csv" && (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gray-400" />
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
