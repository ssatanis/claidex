"use client"

import { KPICards } from "@/components/dashboard/KPICards"
import { RiskDistributionChart } from "@/components/dashboard/RiskDistributionChart"
import { InvestigationsFunnelChart } from "@/components/dashboard/InvestigationsFunnelChart"
import { TopRiskProvidersTable } from "@/components/dashboard/TopRiskProvidersTable"
import { RecentAlertsFeed } from "@/components/dashboard/RecentAlertsFeed"
import { Button } from "@/components/ui/Button"
import { Download, Calendar } from "lucide-react"

export default function Home() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Executive Overview</h2>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" className="hidden sm:flex">
             <Calendar className="mr-2 h-4 w-4" />
             Last 30 Days
          </Button>
          <Button size="sm" className="hidden sm:flex">
             <Download className="mr-2 h-4 w-4" />
             Export
          </Button>
        </div>
      </div>
      <KPICards />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <RiskDistributionChart />
        <InvestigationsFunnelChart />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <TopRiskProvidersTable />
        <RecentAlertsFeed />
      </div>
    </div>
  )
}
