"use client"

import * as React from "react"
import { NetworkGraphCanvas } from "@/components/network/NetworkGraphCanvas"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Filter } from "lucide-react"

export default function NetworkPage() {
  return (
    <div className="space-y-6 h-[calc(100vh-140px)] flex flex-col">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Network Graph</h1>
        <div className="flex gap-2">
            <Button variant="outline">
                <Filter className="mr-2 h-4 w-4" /> Filter
            </Button>
            <Button>Export Graph</Button>
        </div>
      </div>

      <div className="flex flex-1 gap-6 overflow-hidden">
        <Card className="w-64 flex-shrink-0 h-full overflow-auto hidden md:block">
            <CardHeader>
                <CardTitle>Filters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <label className="text-sm font-medium">Search</label>
                    <Input placeholder="Search node..." />
                </div>
                 <div className="space-y-2">
                    <label className="text-sm font-medium">Risk Level</label>
                    <div className="flex flex-col gap-2">
                        <label className="flex items-center gap-2 text-sm text-muted-foreground">
                            <input type="checkbox" className="rounded border-gray-300" defaultChecked /> High Risk
                        </label>
                         <label className="flex items-center gap-2 text-sm text-muted-foreground">
                            <input type="checkbox" className="rounded border-gray-300" defaultChecked /> Medium Risk
                        </label>
                         <label className="flex items-center gap-2 text-sm text-muted-foreground">
                            <input type="checkbox" className="rounded border-gray-300" defaultChecked /> Low Risk
                        </label>
                    </div>
                </div>
            </CardContent>
        </Card>

        <div className="flex-1 h-full min-h-[500px]">
            <NetworkGraphCanvas />
        </div>
      </div>
    </div>
  )
}
