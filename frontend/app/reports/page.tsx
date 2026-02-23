"use client"

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs"
import { Button } from "@/components/ui/Button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table"
import { Badge } from "@/components/ui/Badge"
import { FileText, Clock, Download, Play } from "lucide-react"

const scheduledReports = [
  { id: 1, name: "Weekly Provider Risk Summary", frequency: "Weekly (Mon)", lastRun: "Oct 23, 2023", nextRun: "Oct 30, 2023", status: "Success" },
  { id: 2, name: "Monthly Claims Outlier Report", frequency: "Monthly (1st)", lastRun: "Oct 01, 2023", nextRun: "Nov 01, 2023", status: "Running" },
  { id: 3, name: "Daily Alert Breach Report", frequency: "Daily", lastRun: "Oct 24, 2023", nextRun: "Oct 25, 2023", status: "Failed" },
]

const templates = [
  { name: "Provider Risk Summary", desc: "Aggregate risk scores by specialty and region." },
  { name: "Claims Outlier Report", desc: "Detailed list of claims exceeding deviation thresholds." },
  { name: "Geographic Risk Overview", desc: "Heatmap data export for state/county risk." },
]

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Reports & Exports</h1>
        <Button>
          <FileText className="mr-2 h-4 w-4" /> Create New Report
        </Button>
      </div>

      <Tabs defaultValue="scheduled" className="w-full">
        <TabsList>
          <TabsTrigger value="scheduled">Scheduled Reports</TabsTrigger>
          <TabsTrigger value="ondemand">On-Demand Templates</TabsTrigger>
        </TabsList>
        <TabsContent value="scheduled" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Scheduled Reports</CardTitle>
              <CardDescription>Automated reports sent to your inbox.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Report Name</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Last Run</TableHead>
                    <TableHead>Next Run</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scheduledReports.map((report) => (
                    <TableRow key={report.id}>
                      <TableCell className="font-medium">{report.name}</TableCell>
                      <TableCell>{report.frequency}</TableCell>
                      <TableCell>{report.lastRun}</TableCell>
                      <TableCell>{report.nextRun}</TableCell>
                      <TableCell>
                        <Badge variant={report.status === 'Success' ? 'success' : report.status === 'Running' ? 'secondary' : 'destructive'}>
                          {report.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon">
                            <Download className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="ondemand" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {templates.map((template, index) => (
                <Card key={index} className="hover:bg-muted/50 cursor-pointer transition-colors">
                    <CardHeader>
                        <CardTitle className="text-lg">{template.name}</CardTitle>
                        <CardDescription>{template.desc}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button variant="outline" className="w-full">
                            <Play className="mr-2 h-4 w-4" /> Run Now
                        </Button>
                    </CardContent>
                </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
