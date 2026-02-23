"use client"

import * as React from "react"
import { Search, Bell, ChevronDown } from "lucide-react"
import { Input } from "@/components/ui/Input"
import { Button } from "@/components/ui/Button"
import { Avatar } from "@/components/ui/Avatar"
import { Badge } from "@/components/ui/Badge"

export function TopBar() {
  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-6">
      <div className="flex w-1/3 items-center">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search providers, claims, investigations..."
            className="pl-9 bg-muted/50 border-transparent focus:bg-background transition-all"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5 text-muted-foreground" />
          <span className="absolute right-1.5 top-1.5 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-risk-high opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-risk-high"></span>
          </span>
        </Button>

        <div className="flex items-center gap-2 border-l pl-4">
          <Avatar className="h-8 w-8 cursor-pointer" fallback="JD" />
          <div className="hidden flex-col text-sm sm:flex">
            <span className="font-medium leading-none">Jane Doe</span>
            <span className="text-xs text-muted-foreground">Senior Investigator</span>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    </header>
  )
}
