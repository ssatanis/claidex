"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card"
import { Badge } from "@/components/ui/Badge"
import { Avatar } from "@/components/ui/Avatar"
import { CheckCircle2, Circle, Clock } from "lucide-react"

const tasks = [
  { id: 1, title: "Review medical records", status: "completed", assignee: "JD" },
  { id: 2, title: "Interview provider", status: "in-progress", assignee: "JD" },
  { id: 3, title: "Finalize risk report", status: "pending", assignee: "Unassigned" },
]

export function InvestigationStatus() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Investigation Tasks</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {tasks.map((task) => (
            <div key={task.id} className="flex items-start justify-between border-b pb-4 last:border-0 last:pb-0">
              <div className="flex items-start gap-3">
                {task.status === "completed" ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600" />
                ) : task.status === "in-progress" ? (
                  <Clock className="mt-0.5 h-4 w-4 text-blue-600" />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 text-muted-foreground" />
                )}
                <div className="space-y-1">
                  <p className={`text-sm font-medium ${task.status === "completed" ? "text-muted-foreground line-through" : ""}`}>
                    {task.title}
                  </p>
                  <div className="flex items-center gap-2">
                    <Avatar className="h-5 w-5 text-[10px]" fallback={task.assignee} />
                    <span className="text-xs text-muted-foreground">Due Oct 24</span>
                  </div>
                </div>
              </div>
              <Badge variant={task.status === "completed" ? "success" : task.status === "in-progress" ? "default" : "secondary"} className="text-[10px]">
                {task.status}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
