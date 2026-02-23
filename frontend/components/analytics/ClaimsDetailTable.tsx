"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table"
import { Badge } from "@/components/ui/Badge"

const claims = [
  { id: "CLM-901", provider: "Dr. Thornton", code: "99214", amount: "$120", flag: "Upcoding", risk: 92 },
  { id: "CLM-902", provider: "Dr. Miller", code: "99213", amount: "$85", flag: "None", risk: 12 },
  { id: "CLM-903", provider: "Apex Imaging", code: "71045", amount: "$240", flag: "Duplicate", risk: 88 },
  { id: "CLM-904", provider: "Dr. Chen", code: "99203", amount: "$150", flag: "Unbundling", risk: 75 },
  { id: "CLM-905", provider: "Metro Pain", code: "80053", amount: "$45", flag: "None", risk: 5 },
]

export function ClaimsDetailTable() {
  return (
    <Card className="col-span-4">
      <CardHeader>
        <CardTitle>Detailed Claims Data</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Claim ID</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>CPT Code</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Flagged Reason</TableHead>
              <TableHead>Risk Score</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {claims.map((claim) => (
              <TableRow key={claim.id}>
                <TableCell className="font-medium">{claim.id}</TableCell>
                <TableCell>{claim.provider}</TableCell>
                <TableCell>{claim.code}</TableCell>
                <TableCell>{claim.amount}</TableCell>
                <TableCell>
                  {claim.flag !== "None" ? (
                    <Badge variant="destructive">{claim.flag}</Badge>
                  ) : (
                     <Badge variant="outline" className="text-muted-foreground">Clean</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <span className={claim.risk > 50 ? "text-red-600 font-bold" : "text-muted-foreground"}>
                    {claim.risk}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
