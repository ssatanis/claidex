"use client"

import * as React from "react"
import { Button } from "@/components/ui/Button"
import { Select } from "@/components/ui/Select"
import { Calendar, Download, SlidersHorizontal } from "lucide-react"

export function AnalyticsToolbar() {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-2">
         <Button variant="outline" className="w-[200px] justify-start text-left font-normal">
            <Calendar className="mr-2 h-4 w-4" />
            <span>Oct 01 - Oct 31, 2023</span>
          </Button>
      </div>
      <div className="flex items-center gap-2">
        <Select className="w-[150px]">
          <option>All Payers</option>
          <option>Medicare</option>
          <option>Medicaid</option>
          <option>Commercial</option>
        </Select>
         <Select className="w-[150px]">
          <option>All Regions</option>
          <option>Northeast</option>
          <option>Southeast</option>
          <option>West</option>
        </Select>
        <Button variant="outline" size="icon">
            <SlidersHorizontal className="h-4 w-4" />
        </Button>
        <Button variant="default">
            <Download className="mr-2 h-4 w-4" /> Export
        </Button>
      </div>
    </div>
  )
}
