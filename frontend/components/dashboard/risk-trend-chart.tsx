"use client";

import * as React from "react";
import type { RiskTrend } from "@/types/api";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

export interface RiskTrendChartProps {
  data: RiskTrend[] | undefined;
  loading: boolean;
}

export function RiskTrendChart({ data, loading }: RiskTrendChartProps) {
  if (loading) {
    return <Skeleton className="h-[240px] w-full" />;
  }

  if (!data || data.length === 0) {
    return (
      <div className="h-[240px] flex items-center justify-center text-sm text-gray-500">
        No trend data
      </div>
    );
  }

  const chartData = data.map((d) => ({
    month: d.month,
    high_risk: d.high_risk_count,
    elevated: d.elevated_count,
    moderate: d.moderate_count,
  }));

  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="month" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip
            contentStyle={{ fontSize: 12 }}
            formatter={(value: number | undefined) => (value ?? 0).toLocaleString()}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line
            type="monotone"
            dataKey="high_risk"
            name="High risk"
            stroke="#DC2626"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="elevated"
            name="Elevated"
            stroke="#EA580C"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="moderate"
            name="Moderate"
            stroke="#D97706"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
