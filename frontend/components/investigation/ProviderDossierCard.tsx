"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Copy, MapPin, Calendar, Stethoscope } from "lucide-react"
import { Button } from "@/components/ui/Button"

export function ProviderDossierCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Provider Dossier</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-md border p-2">
            <div className="flex flex-col">
                <span className="text-[10px] uppercase text-muted-foreground">NPI Number</span>
                <span className="text-sm font-mono font-medium">1234567890</span>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6">
                <Copy className="h-3 w-3" />
            </Button>
        </div>

        <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
                <div className="flex items-center text-xs text-muted-foreground">
                    <Stethoscope className="mr-1 h-3 w-3" /> Specialty
                </div>
                <span className="text-sm font-medium">Cardiology</span>
            </div>
             <div className="flex flex-col gap-1">
                <div className="flex items-center text-xs text-muted-foreground">
                    <MapPin className="mr-1 h-3 w-3" /> Location
                </div>
                <span className="text-sm font-medium">New York, NY</span>
            </div>
             <div className="flex flex-col gap-1">
                <div className="flex items-center text-xs text-muted-foreground">
                    <Calendar className="mr-1 h-3 w-3" /> Practicing
                </div>
                <span className="text-sm font-medium">15 Years</span>
            </div>
        </div>
      </CardContent>
    </Card>
  )
}
