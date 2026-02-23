import { AnalyticsToolbar } from "@/components/analytics/AnalyticsToolbar"
import { AnalyticsMetrics } from "@/components/analytics/AnalyticsMetrics"
import { ClaimsVolumeChart } from "@/components/analytics/ClaimsVolumeChart"
import { FlaggedReasonChart } from "@/components/analytics/FlaggedReasonChart"
import { TopCodesChart } from "@/components/analytics/TopCodesChart"
import { OutlierScatterChart } from "@/components/analytics/OutlierScatterChart"
import { ClaimsDetailTable } from "@/components/analytics/ClaimsDetailTable"

export default function ClaimsAnalyticsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Claims Analytics</h1>
      </div>

      <AnalyticsToolbar />
      <AnalyticsMetrics />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
        <ClaimsVolumeChart className="lg:col-span-4" />
        <FlaggedReasonChart className="lg:col-span-3" />
      </div>

       <div className="grid grid-cols-1 gap-4 lg:grid-cols-7">
        <TopCodesChart className="lg:col-span-3" />
        <OutlierScatterChart className="lg:col-span-4" />
      </div>

       <ClaimsDetailTable />
    </div>
  )
}
