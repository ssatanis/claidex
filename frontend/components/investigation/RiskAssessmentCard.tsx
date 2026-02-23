"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Gauge, AlertTriangle, Users } from "lucide-react"

export function RiskAssessmentCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Risk Assessment</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col items-center justify-center space-y-2">
          <div className="relative flex h-32 w-32 items-center justify-center rounded-full border-8 border-muted border-t-red-600 border-r-red-600 bg-transparent">
            <span className="text-4xl font-bold text-foreground">92</span>
          </div>
          <span className="text-sm font-medium text-red-600">Severe Risk</span>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Billing Anomalies</span>
              <span className="font-medium text-red-600">High</span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted">
              <div className="h-full w-3/4 rounded-full bg-red-600" />
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Patient Overlap</span>
              <span className="font-medium text-orange-500">Medium</span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted">
              <div className="h-full w-1/2 rounded-full bg-orange-500" />
            </div>
          </div>
        </div>

        <div className="rounded-md bg-red-50 p-3">
          <div className="flex gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-red-600" />
            <div className="space-y-1">
              <p className="text-xs font-medium text-red-800">Critical Alert</p>
              <p className="text-xs text-red-700">
                Billing frequency exceeds specialty average by 340% for CPT 99214.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
