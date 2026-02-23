"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs"
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from "recharts"

const data = [
  { name: "Jan", provider: 4000, peer: 2400 },
  { name: "Feb", provider: 3000, peer: 1398 },
  { name: "Mar", provider: 2000, peer: 9800 },
  { name: "Apr", provider: 2780, peer: 3908 },
  { name: "May", provider: 1890, peer: 4800 },
  { name: "Jun", provider: 2390, peer: 3800 },
  { name: "Jul", provider: 3490, peer: 4300 },
]

export function AnalyticWorkbench() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Analytic Workbench</CardTitle>
          <CardDescription>
            Deep dive into provider billing behavior vs peers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="volume" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="volume">Claim Volume</TabsTrigger>
              <TabsTrigger value="cost">Cost per Patient</TabsTrigger>
              <TabsTrigger value="complexity">Complexity</TabsTrigger>
            </TabsList>
            <TabsContent value="volume" className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data}>
                  <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="provider" name="Provider" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="peer" name="Peer Group Avg" fill="#e2e8f0" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </TabsContent>
            <TabsContent value="cost">
              <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                Cost Analysis Visualization Placeholder
              </div>
            </TabsContent>
             <TabsContent value="complexity">
              <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                Complexity Analysis Visualization Placeholder
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
