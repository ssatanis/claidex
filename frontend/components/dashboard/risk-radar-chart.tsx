"use client";

import * as React from "react";
import type { RiskComponentsAvg } from "@/types/api";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

export interface RiskRadarChartProps {
  data: RiskComponentsAvg | undefined;
  loading: boolean;
}

const LABELS: Record<keyof RiskComponentsAvg, string> = {
  billing_outlier: "Billing outlier",
  ownership_chain: "Ownership chain",
  payment_trajectory: "Payment trajectory",
  exclusion_proximity: "Exclusion proximity",
  program_concentration: "Program concentration",
};

export function RiskRadarChart({ data, loading }: RiskRadarChartProps) {
  if (loading) {
    return <Skeleton className="h-[260px] w-full" />;
  }

  if (!data) {
    return (
      <div className="h-[260px] flex items-center justify-center text-sm text-gray-500">
        No component data
      </div>
    );
  }

  const chartData = (
    [
      "billing_outlier",
      "ownership_chain",
      "payment_trajectory",
      "exclusion_proximity",
      "program_concentration",
    ] as const
  ).map((key) => ({
    subject: LABELS[key],
    value: data[key] ?? 0,
    fullMark: 100,
  }));

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={chartData}>
          <PolarGrid stroke="#e5e7eb" />
          <PolarAngleAxis
            dataKey="subject"
            tick={{ fontSize: 10 }}
            tickLine={false}
          />
          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10 }} />
          <Radar
            name="Avg score"
            dataKey="value"
            stroke="#1f2937"
            fill="#1f2937"
            fillOpacity={0.3}
            strokeWidth={2}
          />
          <Tooltip formatter={(value: number) => [value.toFixed(1), "Score"]} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
