"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  ShieldAlert,
  Users,
  BarChart3,
  Network,
  Bell,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react"

const sidebarItems = [
  { icon: LayoutDashboard, label: "Overview", href: "/" },
  { icon: ShieldAlert, label: "Provider Investigations", href: "/investigations" }, // Placeholder path
  { icon: Users, label: "Member Investigations", href: "/members" }, // Placeholder path
  { icon: BarChart3, label: "Claims Analytics", href: "/analytics/claims" },
  { icon: Network, label: "Network Graph", href: "/network" },
  { icon: Bell, label: "Alerts & Queues", href: "/alerts" },
  { icon: FileText, label: "Reports & Exports", href: "/reports" },
  { icon: Settings, label: "Admin & Settings", href: "/admin" },
]

export function Sidebar() {
  const pathname = usePathname()
  const [isCollapsed, setIsCollapsed] = React.useState(false)

  return (
    <aside
      className={cn(
        "flex flex-col border-r bg-card transition-all duration-300",
        isCollapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex h-16 items-center border-b px-4">
        {!isCollapsed && (
          <span className="text-xl font-bold text-primary">ClaideX</span>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="ml-auto rounded-md p-1 hover:bg-muted"
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 space-y-1 p-2">
        {sidebarItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted hover:text-foreground",
                isActive ? "bg-primary/10 text-primary hover:bg-primary/20" : "text-muted-foreground",
                isCollapsed && "justify-center px-2"
              )}
            >
              <item.icon className={cn("h-5 w-5", !isCollapsed && "mr-3")} />
              {!isCollapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      <div className="border-t p-4">
        {!isCollapsed ? (
          <div className="rounded-md bg-muted/50 p-3 text-xs">
            <p className="font-semibold">Workspace</p>
            <p className="text-muted-foreground">General Investigation</p>
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="h-8 w-8 rounded-full bg-muted/50" />
          </div>
        )}
      </div>
    </aside>
  )
}
