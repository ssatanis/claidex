"use client";

import * as React from "react";
import type { RiskByState } from "@/types/api";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface RiskByStateTableProps {
  data: RiskByState[] | undefined;
  loading: boolean;
  onStateClick: (state: string) => void;
  activeState: string;
}

export function RiskByStateTable({
  data,
  loading,
  onStateClick,
  activeState,
}: RiskByStateTableProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(8)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <p className="text-sm text-gray-500 py-4 text-center">
        No state-level data available
      </p>
    );
  }

  const sorted = [...data].sort(
    (a, b) => (b.high_risk_count ?? 0) - (a.high_risk_count ?? 0)
  );

  return (
    <div className="space-y-1 max-h-[280px] overflow-y-auto">
      {sorted.slice(0, 20).map((row) => (
        <button
          key={row.state}
          type="button"
          onClick={() => onStateClick(row.state)}
          className={cn(
            "w-full flex items-center justify-between gap-3 px-3 py-2 text-left rounded border transition-colors",
            activeState === row.state
              ? "border-black bg-black text-white"
              : "border-gray-200 bg-white hover:bg-gray-50 text-black"
          )}
        >
          <span className="text-sm font-medium truncate">{row.state}</span>
          <span className="text-xs shrink-0 tabular-nums">
            {row.high_risk_count.toLocaleString()} high-risk
          </span>
        </button>
      ))}
    </div>
  );
}
