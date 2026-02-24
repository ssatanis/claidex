"use client";

import * as React from "react";
import type { PaymentAnomaly } from "@/types/api";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface PaymentHeatmapProps {
  data: PaymentAnomaly[] | undefined;
  loading: boolean;
}

export function PaymentHeatmap({ data, loading }: PaymentHeatmapProps) {
  if (loading) {
    return <Skeleton className="h-[200px] w-full" />;
  }

  if (!data || data.length === 0) {
    return (
      <div className="h-[200px] flex items-center justify-center text-sm text-gray-500">
        No anomaly data
      </div>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.anomaly_count), 1);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-7 sm:grid-cols-10 gap-1">
        {data.slice(-90).map((d, i) => (
          <div
            key={d.date ?? i}
            className={cn(
              "aspect-square rounded-sm border border-gray-200 transition-colors",
              d.anomaly_count === 0
                ? "bg-gray-100"
                : "bg-amber-500"
            )}
            style={{
              opacity: d.anomaly_count === 0 ? 0.5 : 0.3 + (d.anomaly_count / maxCount) * 0.7,
            }}
            title={d.date ? `${d.date}: ${d.anomaly_count} anomalies` : undefined}
          />
        ))}
      </div>
      <div className="flex items-center justify-between text-[10px] text-gray-500">
        <span>Less</span>
        <span className="flex gap-1">
          {[0, 0.33, 0.66, 1].map((pct) => (
            <span
              key={pct}
              className="w-3 h-3 rounded-sm bg-amber-500 border border-gray-200"
              style={{ opacity: 0.3 + pct * 0.7 }}
            />
          ))}
        </span>
        <span>More</span>
      </div>
    </div>
  );
}
