"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table"
import { Badge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { MoreVertical, CheckCircle, Clock, AlertTriangle } from "lucide-react"

const alerts = [
  {
    id: "ALT-1001",
    entity: "Dr. Richard S. Thornton",
    type: "Billing Anomaly",
    risk: "High",
    age: "2h",
    owner: "Jane Doe",
    status: "New",
  },
  {
    id: "ALT-1002",
    entity: "Member #882910",
    type: "Duplicate Service",
    risk: "Medium",
    age: "5h",
    owner: "Unassigned",
    status: "Triaged",
  },
  {
    id: "ALT-1003",
    entity: "Apex Imaging Center",
    type: "Service Frequency",
    risk: "Low",
    age: "1d",
    owner: "System",
    status: "Pending",
  },
]

export function AlertsList() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Alert Queue</CardTitle>
        <div className="flex gap-2">
            <Button variant="outline" size="sm">Assign to Me</Button>
            <Button variant="outline" size="sm">Bulk Action</Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Alert ID</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Risk</TableHead>
              <TableHead>Age</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {alerts.map((alert) => (
              <TableRow key={alert.id} className="cursor-pointer hover:bg-muted/50">
                <TableCell className="font-medium">{alert.id}</TableCell>
                <TableCell>{alert.entity}</TableCell>
                <TableCell>{alert.type}</TableCell>
                <TableCell>
                  <Badge variant={alert.risk === 'High' ? 'destructive' : alert.risk === 'Medium' ? 'warning' : 'secondary'}>
                    {alert.risk}
                  </Badge>
                </TableCell>
                <TableCell>{alert.age}</TableCell>
                <TableCell>{alert.owner}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {alert.status === 'New' ? <AlertTriangle className="h-3 w-3 text-blue-500" /> :
                     alert.status === 'Triaged' ? <CheckCircle className="h-3 w-3 text-green-500" /> :
                     <Clock className="h-3 w-3 text-orange-500" />}
                    {alert.status}
                  </div>
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
