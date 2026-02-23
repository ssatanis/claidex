"use client"

import * as React from "react"
import { AlertsList } from "@/components/alerts/AlertsList"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs"
import { Button } from "@/components/ui/Button"
import { Filter } from "lucide-react"

export default function AlertsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Alerts & Queues</h1>
        <div className="flex gap-2">
           <Button variant="outline">
               <Filter className="mr-2 h-4 w-4" /> Filter
           </Button>
           <Button>Create Alert Rule</Button>
        </div>
      </div>

      <Tabs defaultValue="all" className="w-full">
        <TabsList>
          <TabsTrigger value="all">All Alerts</TabsTrigger>
          <TabsTrigger value="high">High Priority</TabsTrigger>
          <TabsTrigger value="recommendations">System Recommendations</TabsTrigger>
          <TabsTrigger value="breached">SLA Breaches</TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="mt-4">
          <AlertsList />
        </TabsContent>
        <TabsContent value="high" className="mt-4">
          <div className="flex h-[200px] items-center justify-center text-muted-foreground">
             High Priority Filter View
          </div>
        </TabsContent>
        <TabsContent value="recommendations" className="mt-4">
          <div className="flex h-[200px] items-center justify-center text-muted-foreground">
             Recommendations View
          </div>
        </TabsContent>
         <TabsContent value="breached" className="mt-4">
          <div className="flex h-[200px] items-center justify-center text-muted-foreground">
             SLA Breaches View
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
