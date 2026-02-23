"use client"

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Avatar } from "@/components/ui/Avatar"
import { Badge } from "@/components/ui/Badge"
import { Building, Users, Activity, Settings as SettingsIcon } from "lucide-react"

// Simple Slider component placeholder since I didn't create it in UI lib
const SimpleSlider = () => (
    <input type="range" className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
)

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Admin & Settings</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-[200px_1fr]">
        <nav className="flex flex-col space-y-1">
            <Button variant="ghost" className="justify-start bg-muted">Organization</Button>
            <Button variant="ghost" className="justify-start">User Management</Button>
            <Button variant="ghost" className="justify-start">Risk Configuration</Button>
            <Button variant="ghost" className="justify-start">Integrations</Button>
        </nav>

        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Organization Settings</CardTitle>
                    <CardDescription>Manage your workspace details.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-2">
                        <label className="text-sm font-medium">Organization Name</label>
                        <Input defaultValue="Acme Healthcare Analytics" />
                    </div>
                     <div className="grid gap-2">
                        <label className="text-sm font-medium">Primary Contact Email</label>
                        <Input defaultValue="admin@acmehealth.com" />
                    </div>
                    <Button>Save Changes</Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Risk Model Configuration</CardTitle>
                    <CardDescription>Adjust sensitivity thresholds for detection.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <div className="flex justify-between">
                            <label className="text-sm font-medium">Outlier Detection Sensitivity</label>
                            <span className="text-sm text-muted-foreground">High</span>
                        </div>
                        <SimpleSlider />
                    </div>
                     <div className="space-y-2">
                        <div className="flex justify-between">
                            <label className="text-sm font-medium">Peer Comparison Threshold</label>
                            <span className="text-sm text-muted-foreground">Medium</span>
                        </div>
                         <SimpleSlider />
                    </div>
                </CardContent>
            </Card>
        </div>
      </div>
    </div>
  )
}
