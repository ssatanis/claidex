"use client"

import * as React from "react"
import { Card, CardContent } from "@/components/ui/Card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table"
import { Badge } from "@/components/ui/Badge"
import { Avatar } from "@/components/ui/Avatar"
import { Button } from "@/components/ui/Button"
import { MoreHorizontal, ArrowRight } from "lucide-react"
import Link from "next/link"

const providers = [
  {
    id: "INV-2023-892",
    name: "Dr. Richard S. Thornton",
    group: "Cardiology Group",
    specialty: "Cardiology",
    state: "NY",
    riskScore: 92,
    openCases: 2,
    lastInvestigation: "2023-10-22",
  },
  {
    id: "INV-2023-893",
    name: "Sarah J. Miller",
    group: "Dermatology Partners",
    specialty: "Dermatology",
    state: "CA",
    riskScore: 88,
    openCases: 1,
    lastInvestigation: "2023-10-20",
  },
  {
    id: "INV-2023-894",
    name: "Apex Imaging Center",
    group: "Apex Health",
    specialty: "Radiology",
    state: "TX",
    riskScore: 45,
    openCases: 0,
    lastInvestigation: "2023-09-15",
  },
   {
    id: "INV-2023-895",
    name: "Dr. Emily Chen",
    group: "Internal Medicine Assoc.",
    specialty: "Internal Medicine",
    state: "NY",
    riskScore: 78,
    openCases: 1,
    lastInvestigation: "2023-10-18",
  },
  {
    id: "INV-2023-896",
    name: "Metro Pain Clinic",
    group: "Metro Health",
    specialty: "Pain Management",
    state: "FL",
    riskScore: 95,
    openCases: 3,
    lastInvestigation: "2023-10-24",
  },
]

export function ProviderTable() {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Provider Name</TableHead>
              <TableHead>Group/Org</TableHead>
              <TableHead>Specialty</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Risk Score</TableHead>
              <TableHead>Open Cases</TableHead>
              <TableHead>Last Inv.</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {providers.map((provider) => (
              <TableRow key={provider.id} className="cursor-pointer hover:bg-muted/50">
                <TableCell className="font-medium flex items-center gap-2">
                   <Avatar className="h-8 w-8" fallback={provider.name.charAt(0)} />
                   <div>
                     <div className="font-semibold">{provider.name}</div>
                     <div className="text-xs text-muted-foreground md:hidden">{provider.group}</div>
                   </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">{provider.group}</TableCell>
                <TableCell>{provider.specialty}</TableCell>
                <TableCell>{provider.state}</TableCell>
                <TableCell>
                   <Badge variant={provider.riskScore > 90 ? "destructive" : provider.riskScore > 70 ? "warning" : "success"}>
                    {provider.riskScore}
                  </Badge>
                </TableCell>
                <TableCell>{provider.openCases}</TableCell>
                <TableCell>{provider.lastInvestigation}</TableCell>
                <TableCell className="text-right">
                    <Link href={`/investigations/${provider.id}`}>
                        <Button variant="ghost" size="icon">
                            <ArrowRight className="h-4 w-4" />
                        </Button>
                    </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
