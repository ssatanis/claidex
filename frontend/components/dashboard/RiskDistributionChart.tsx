"use client"

import * as React from "react"
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, Cell } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card"

const data = [
  { name: "Primary Care", low: 400, medium: 240, high: 120 },
  { name: "Cardiology", low: 300, medium: 139, high: 220 },
  { name: "Radiology", low: 200, medium: 580, high: 100 },
  { name: "Orthopedics", low: 278, medium: 390, high: 150 },
  { name: "Dermatology", low: 189, medium: 480, high: 80 },
]

export function RiskDistributionChart() {
  return (
    <Card className="col-span-4">
      <CardHeader>
        <CardTitle>Risk Distribution by Provider Type</CardTitle>
        <CardDescription>Risk tiers across top specialties.</CardDescription>
      </CardHeader>
      <CardContent className="pl-2">
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={data}>
            <XAxis
              dataKey="name"
              stroke="#888888"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#888888"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${value}`}
            />
            <Tooltip
                cursor={{ fill: 'transparent' }}
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
            />
            <Legend />
            <Bar dataKey="low" name="Low Risk" stackId="a" fill="#10b981" radius={[0, 0, 4, 4]} />
            <Bar dataKey="medium" name="Medium Risk" stackId="a" fill="#f59e0b" />
            <Bar dataKey="high" name="High Risk" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
