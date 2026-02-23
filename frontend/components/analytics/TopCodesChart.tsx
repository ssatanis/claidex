"use client"

import * as React from "react"
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card"
import { cn } from "@/lib/utils"

const data = [
  { name: "99213", risk: 80, count: 2400 },
  { name: "99214", risk: 95, count: 3200 },
  { name: "71045", risk: 60, count: 1200 },
  { name: "99203", risk: 70, count: 1800 },
  { name: "80053", risk: 50, count: 4000 },
]

export function TopCodesChart({ className }: { className?: string }) {
  return (
    <Card className={cn("col-span-3", className)}>
      <CardHeader>
        <CardTitle>Top Codes by Risk</CardTitle>
        <CardDescription>CPT/HCPCS codes with highest risk scores.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
              <XAxis type="number" hide />
              <YAxis dataKey="name" type="category" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} width={50} />
              <Tooltip cursor={{fill: 'transparent'}} />
              <Bar dataKey="risk" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
