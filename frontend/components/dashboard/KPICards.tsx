"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { ArrowUpRight, ArrowDownRight, DollarSign, Activity, Users, Clock, AlertTriangle } from "lucide-react"

const kpiData = [
  {
    title: "Active Investigations",
    value: "1,248",
    change: "+12.5%",
    trend: "up",
    icon: Activity,
    color: "text-blue-600",
  },
  {
    title: "High-Risk Providers",
    value: "86",
    change: "+4.3%",
    trend: "up",
    icon: AlertTriangle,
    color: "text-red-600",
  },
  {
    title: "Potential Savings",
    value: "$4.2M",
    change: "+8.1%",
    trend: "up",
    icon: DollarSign,
    color: "text-emerald-600",
  },
  {
    title: "Avg Resolution Time",
    value: "14 Days",
    change: "-2.5%",
    trend: "down",
    icon: Clock,
    color: "text-purple-600",
  },
]

export function KPICards() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {kpiData.map((kpi, index) => (
        <Card key={index}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {kpi.title}
            </CardTitle>
            <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpi.value}</div>
            <p className="text-xs text-muted-foreground flex items-center mt-1">
              {kpi.trend === "up" ? (
                <ArrowUpRight className="mr-1 h-4 w-4 text-emerald-500" />
              ) : (
                <ArrowDownRight className="mr-1 h-4 w-4 text-emerald-500" />
              )}
              <span className={kpi.trend === "up" && kpi.title.includes("Risk") ? "text-red-500" : "text-emerald-500"}>
                {kpi.change}
              </span>
              <span className="ml-1">from last month</span>
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
