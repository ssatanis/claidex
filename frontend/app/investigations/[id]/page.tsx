import { InvestigationHeader } from "@/components/investigation/InvestigationHeader"
import { RiskAssessmentCard } from "@/components/investigation/RiskAssessmentCard"
import { ProviderDossierCard } from "@/components/investigation/ProviderDossierCard"
import { AnalyticWorkbench } from "@/components/investigation/AnalyticWorkbench"
import { FlaggedClaimsTable } from "@/components/investigation/FlaggedClaimsTable"
import { InvestigationStatus } from "@/components/investigation/InvestigationStatus"
import { AuditTrail } from "@/components/investigation/AuditTrail"

export default async function InvestigationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <div className="space-y-6">
      <InvestigationHeader />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4 xl:grid-cols-12">
        <div className="space-y-6 lg:col-span-1 xl:col-span-3">
          <RiskAssessmentCard />
          <ProviderDossierCard />
        </div>
        <div className="space-y-6 lg:col-span-2 xl:col-span-6">
          <AnalyticWorkbench />
          <FlaggedClaimsTable />
        </div>
        <div className="space-y-6 lg:col-span-1 xl:col-span-3">
          <InvestigationStatus />
          <AuditTrail />
        </div>
      </div>
    </div>
  )
}
