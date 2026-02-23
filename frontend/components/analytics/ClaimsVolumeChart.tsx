"use client"

import * as React from "react"
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card"
import { cn } from "@/lib/utils"

const data = [
  { date: "Oct 1", total: 4000, flagged: 240 },
  { date: "Oct 5", total: 3000, flagged: 139 },
  { date: "Oct 10", total: 2000, flagged: 980 },
  { date: "Oct 15", total: 2780, flagged: 390 },
  { date: "Oct 20", total: 1890, flagged: 480 },
  { date: "Oct 25", total: 2390, flagged: 380 },
  { date: "Oct 30", total: 3490, flagged: 430 },
]

export function ClaimsVolumeChart({ className }: { className?: string }) {
  return (
    <Card className={cn("col-span-4", className)}>
      <CardHeader>
        <CardTitle>Claims Volume over Time</CardTitle>
        <CardDescription>Total processed vs flagged claims.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="total" stroke="#2563eb" strokeWidth={2} dot={false} activeDot={{ r: 8 }} />
              <Line type="monotone" dataKey="flagged" stroke="#ef4444" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
