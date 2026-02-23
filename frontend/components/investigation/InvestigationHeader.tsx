"use client"

import * as React from "react"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { ArrowLeft, MoreHorizontal, Edit, Share2 } from "lucide-react"
import { useRouter } from "next/navigation"

export function InvestigationHeader() {
  const router = useRouter()
  return (
    <div className="flex flex-col gap-4 border-b bg-background pb-6 pt-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => router.back()}>
          <ArrowLeft className="mr-1 h-3 w-3" /> Back to List
        </Button>
        <span>/</span>
        <span>Case #INV-2023-892</span>
      </div>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">Dr. Richard S. Thornton</h1>
            <Badge variant="outline" className="text-muted-foreground border-muted-foreground/30">
              Cardiology Group
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="destructive" className="uppercase text-[10px] tracking-wider">
              High Risk
            </Badge>
            <span className="text-sm text-muted-foreground">Case ID: INV-2023-892</span>
            <span className="text-sm text-muted-foreground">•</span>
            <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-200 border-0">
              Under Review
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Share2 className="mr-2 h-4 w-4" /> Share
          </Button>
          <Button size="sm">
            <Edit className="mr-2 h-4 w-4" /> Edit Case
          </Button>
          <Button variant="ghost" size="icon">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
