"use client";

import * as React from "react";
import type { RiskDistributionItem } from "@/types/api";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";

export interface RiskDonutChartProps {
  data: RiskDistributionItem[] | undefined;
  loading: boolean;
  onSegmentClick?: (label: string) => void;
}

const COLORS = ["#DC2626", "#EA580C", "#D97706", "#16A34A", "#6B7280"];

export function RiskDonutChart({
  data,
  loading,
  onSegmentClick,
}: RiskDonutChartProps) {
  if (loading) {
    return <Skeleton className="h-[240px] w-full" />;
  }

  if (!data || data.length === 0) {
    return (
      <div className="h-[240px] flex items-center justify-center text-sm text-gray-500">
        No distribution data
      </div>
    );
  }

  const chartData = data.map((d) => ({
    name: d.risk_label,
    value: d.count,
  }));

  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={90}
            paddingAngle={2}
            dataKey="value"
            nameKey="name"
            onClick={(entry) => onSegmentClick?.(entry.name)}
            cursor={onSegmentClick ? "pointer" : "default"}
          >
            {chartData.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-2 text-xs">
        {chartData.map((d, i) => (
          <span key={d.name} className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: COLORS[i % COLORS.length] }}
            />
            {d.name}: {d.value.toLocaleString()}
          </span>
        ))}
      </div>
    </div>
  );
}
