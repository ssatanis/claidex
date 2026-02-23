"use client"

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Activity, Bell, FileText, Check, X } from "lucide-react"

const alerts = [
  {
    title: "Unusual Billing Pattern Detected",
    description: "Provider billing frequency exceeds specialty average by 340% for CPT 99214.",
    time: "2 hours ago",
    type: "Critical",
  },
  {
    title: "Duplicate Claims Flagged",
    description: "Multiple claims submitted for same patient/service on same date.",
    time: "5 hours ago",
    type: "Warning",
  },
  {
    title: "New Investigation Assigned",
    description: "Case #INV-2023-892 assigned to your queue.",
    time: "1 day ago",
    type: "Info",
  },
]

export function RecentAlertsFeed() {
  return (
    <Card className="col-span-3">
      <CardHeader>
        <CardTitle>Recent Alerts & Recommendations</CardTitle>
        <CardDescription>AI-generated insights and system alerts.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {alerts.map((alert, index) => (
            <div key={index} className="flex items-start space-x-4 border-b pb-4 last:border-0 last:pb-0">
              <div className={`rounded-full p-2 ${
                alert.type === 'Critical' ? 'bg-red-100 text-red-600' :
                alert.type === 'Warning' ? 'bg-orange-100 text-orange-600' :
                'bg-blue-100 text-blue-600'
              }`}>
                {alert.type === 'Critical' ? <Activity className="h-4 w-4" /> :
                 alert.type === 'Warning' ? <Bell className="h-4 w-4" /> :
                 <FileText className="h-4 w-4" />}
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium leading-none">{alert.title}</p>
                  <span className="text-xs text-muted-foreground">{alert.time}</span>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {alert.description}
                </p>
                {alert.type === 'Critical' && (
                  <div className="flex items-center gap-2 pt-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs border-green-200 hover:bg-green-50 text-green-700">
                      <Check className="mr-1 h-3 w-3" /> Apply
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground">
                      <X className="mr-1 h-3 w-3" /> Dismiss
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
