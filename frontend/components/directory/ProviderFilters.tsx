"use client"

import * as React from "react"
import { Card, CardContent } from "@/components/ui/Card"
import { Input } from "@/components/ui/Input"
import { Button } from "@/components/ui/Button"
import { Select } from "@/components/ui/Select"
import { Search, Filter, X } from "lucide-react"

export function ProviderFilters() {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end">
      <div className="flex-1 space-y-2">
        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
          Search Providers
        </label>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Name, NPI, or Specialty..."
            className="pl-9"
          />
        </div>
      </div>
      <div className="w-full md:w-[180px] space-y-2">
         <label className="text-sm font-medium leading-none">Risk Tier</label>
        <Select>
          <option value="">All Risks</option>
          <option value="high">High Risk</option>
          <option value="medium">Medium Risk</option>
          <option value="low">Low Risk</option>
        </Select>
      </div>
       <div className="w-full md:w-[180px] space-y-2">
         <label className="text-sm font-medium leading-none">Status</label>
        <Select>
          <option value="">All Statuses</option>
          <option value="open">Open Investigation</option>
          <option value="closed">Closed</option>
        </Select>
      </div>
       <div className="w-full md:w-[180px] space-y-2">
         <label className="text-sm font-medium leading-none">State</label>
        <Select>
          <option value="">All States</option>
          <option value="ny">New York</option>
          <option value="ca">California</option>
          <option value="tx">Texas</option>
        </Select>
      </div>
      <Button variant="outline" size="icon" className="shrink-0">
        <Filter className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="sm" className="h-9">
        Reset
      </Button>
    </div>
  )
}
