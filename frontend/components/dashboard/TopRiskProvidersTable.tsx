"use client"

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table"
import { Badge } from "@/components/ui/Badge"
import { Avatar } from "@/components/ui/Avatar"

const providers = [
  {
    name: "Dr. Richard S. Thornton",
    specialty: "Cardiology",
    riskScore: 92,
    flaggedClaims: 145,
    status: "Escalated",
  },
  {
    name: "Sarah J. Miller",
    specialty: "Dermatology",
    riskScore: 88,
    flaggedClaims: 98,
    status: "Under Review",
  },
  {
    name: "Apex Imaging Center",
    specialty: "Radiology",
    riskScore: 85,
    flaggedClaims: 210,
    status: "Open",
  },
  {
    name: "Dr. Emily Chen",
    specialty: "Internal Medicine",
    riskScore: 78,
    flaggedClaims: 45,
    status: "Under Review",
  },
  {
    name: "Metro Pain Clinic",
    specialty: "Pain Management",
    riskScore: 95,
    flaggedClaims: 320,
    status: "Escalated",
  },
]

export function TopRiskProvidersTable() {
  return (
    <Card className="col-span-4">
      <CardHeader>
        <CardTitle>Top High-Risk Providers</CardTitle>
        <CardDescription>Providers with highest risk scores this month.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Provider</TableHead>
              <TableHead>Specialty</TableHead>
              <TableHead>Risk Score</TableHead>
              <TableHead>Flagged Claims</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {providers.map((provider) => (
              <TableRow key={provider.name}>
                <TableCell className="font-medium flex items-center gap-2">
                  <Avatar className="h-8 w-8" fallback={provider.name.charAt(0)} />
                  {provider.name}
                </TableCell>
                <TableCell>{provider.specialty}</TableCell>
                <TableCell>
                  <Badge variant={provider.riskScore > 90 ? "destructive" : "warning"}>
                    {provider.riskScore}
                  </Badge>
                </TableCell>
                <TableCell>{provider.flaggedClaims}</TableCell>
                <TableCell>
                    <Badge variant="outline">{provider.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
