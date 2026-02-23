"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { ChevronDown, ChevronRight, Eye, Flag, MoreVertical } from "lucide-react"

const flaggedClaims = [
  {
    id: "CLM-2023-001",
    date: "2023-10-15",
    code: "99214",
    amount: "$250.00",
    payer: "BlueCross",
    flagType: "Upcoding",
    riskScore: "High",
  },
  {
    id: "CLM-2023-002",
    date: "2023-10-18",
    code: "99215",
    amount: "$350.00",
    payer: "Medicare",
    flagType: "Duplicate",
    riskScore: "Medium",
  },
  {
    id: "CLM-2023-003",
    date: "2023-10-20",
    code: "71045",
    amount: "$120.00",
    payer: "Aetna",
    flagType: "Unbundling",
    riskScore: "High",
  },
]

export function FlaggedClaimsTable() {
  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle>Flagged Claims</CardTitle>
        <div className="flex gap-2">
            <Button variant="outline" size="sm">Filter</Button>
            <Button variant="outline" size="sm">Export</Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Claim ID</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Payer</TableHead>
              <TableHead>Flag Type</TableHead>
              <TableHead>Risk</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {flaggedClaims.map((claim) => (
              <TableRow key={claim.id}>
                <TableCell className="font-medium">{claim.id}</TableCell>
                <TableCell>{claim.date}</TableCell>
                <TableCell>{claim.code}</TableCell>
                <TableCell>{claim.amount}</TableCell>
                <TableCell>{claim.payer}</TableCell>
                <TableCell>
                  <Badge variant="outline">{claim.flagType}</Badge>
                </TableCell>
                <TableCell>
                  <span className={`font-semibold ${claim.riskScore === 'High' ? 'text-red-600' : 'text-orange-500'}`}>
                    {claim.riskScore}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                    <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                    </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
