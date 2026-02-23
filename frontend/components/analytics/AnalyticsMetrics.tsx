"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { DollarSign, FileText, AlertTriangle, ShieldAlert, BarChart } from "lucide-react"

const metrics = [
  {
    title: "Total Claims Processed",
    value: "145,290",
    change: "+12%",
    icon: FileText,
  },
  {
    title: "Total Paid Amount",
    value: "$45.2M",
    change: "+5.4%",
    icon: DollarSign,
  },
  {
    title: "Flagged Claims Rate",
    value: "4.8%",
    change: "-0.2%",
    icon: ShieldAlert,
    alert: true,
  },
  {
    title: "Suspicious Activity",
    value: "1.2%",
    change: "+0.1%",
    icon: AlertTriangle,
    alert: true,
  },
  {
      title: "Est. Avoidable Spend",
      value: "$2.1M",
      change: "-1.5%",
      icon: BarChart,
  }
]

export function AnalyticsMetrics() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      {metrics.map((metric, index) => (
        <Card key={index}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {metric.title}
            </CardTitle>
            <metric.icon className={`h-4 w-4 ${metric.alert ? "text-red-500" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metric.value}</div>
            <p className={`text-xs ${metric.change.startsWith("+") && !metric.alert ? "text-green-600" : metric.alert && metric.change.startsWith("+") ? "text-red-600" : "text-muted-foreground"}`}>
              {metric.change} from last month
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
