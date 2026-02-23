"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Avatar } from "@/components/ui/Avatar"

const events = [
  { user: "Jane Doe", action: "changed status to Under Review", time: "2 hours ago" },
  { user: "System", action: "flagged 15 new claims", time: "5 hours ago" },
  { user: "Mike Ross", action: "added a note", time: "1 day ago" },
]

export function AuditTrail() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit Trail</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative border-l border-muted pl-4 ml-2 space-y-6">
          {events.map((event, index) => (
            <div key={index} className="relative">
              <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-muted-foreground ring-4 ring-background" />
              <div className="flex flex-col gap-1">
                <p className="text-sm">
                  <span className="font-medium">{event.user}</span> {event.action}
                </p>
                <span className="text-xs text-muted-foreground">{event.time}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
