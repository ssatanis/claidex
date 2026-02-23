import { ProviderFilters } from "@/components/directory/ProviderFilters"
import { ProviderTable } from "@/components/directory/ProviderTable"
import { Button } from "@/components/ui/Button"
import { Plus } from "lucide-react"

export default function ProvidersPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Provider Directory</h1>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> Add Provider
        </Button>
      </div>

      <div className="space-y-4">
        <ProviderFilters />
        <ProviderTable />
      </div>
    </div>
  )
}
