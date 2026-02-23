"use client"

import * as React from "react"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card"

const data = [
  { name: "Untriaged", value: 400 },
  { name: "Under Review", value: 300 },
  { name: "Escalated", value: 100 },
  { name: "Resolved", value: 200 },
]

const COLORS = ["#94a3b8", "#3b82f6", "#ef4444", "#10b981"]

export function InvestigationsFunnelChart() {
  return (
    <Card className="col-span-3">
      <CardHeader>
        <CardTitle>Open Investigations by Stage</CardTitle>
        <CardDescription>Current workload distribution.</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend verticalAlign="bottom" height={36}/>
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
