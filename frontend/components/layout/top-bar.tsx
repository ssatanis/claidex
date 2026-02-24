"use client";

import { Search, Bell, User, AlertTriangle, Shield, TrendingUp } from "lucide-react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { GlobalSearch } from "./global-search";
import { useState } from "react";
import { formatRelativeTime } from "@/lib/utils";

// Placeholder notifications (can be replaced with API later)
const MOCK_NOTIFICATIONS = [
  {
    id: "1",
    type: "risk",
    title: "Risk events updated",
    body: "New risk events are available. Data refreshes every 15 seconds.",
    time: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    unread: true,
  },
  {
    id: "2",
    type: "exclusion",
    title: "Exclusion list refreshed",
    body: "LEIE exclusions have been synced with the latest data.",
    time: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    unread: true,
  },
];

export function TopBar() {
  const [searchOpen, setSearchOpen] = useState(false);
  const unreadCount = MOCK_NOTIFICATIONS.filter((n) => n.unread).length;

  return (
    <>
      <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-8">
        <div className="flex items-center">
          <h2 className="text-sm font-medium tracking-wide text-gray-600">
            {/* Breadcrumbs can be added here */}
          </h2>
        </div>

        <button
          onClick={() => setSearchOpen(true)}
          className="flex h-10 w-96 items-center gap-2 border border-gray-300 bg-white px-3 text-sm text-gray-500 transition-all hover:border-black focus:border-black focus:outline-none"
        >
          <Search className="h-4 w-4" strokeWidth={1.5} />
          <span>Search providers, entities, events...</span>
          <kbd className="ml-auto inline-flex h-5 shrink-0 items-center gap-0.5 whitespace-nowrap border border-gray-300 bg-gray-50 px-1.5 font-mono text-xs text-gray-600">
            <span>⌘</span><span>K</span>
          </kbd>
        </button>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <a href="/docs" className="flex items-center gap-2">
              <span className="text-sm font-medium tracking-wide">Documentation</span>
            </a>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="relative">
                <Bell className="h-5 w-5" strokeWidth={1.5} />
                {unreadCount > 0 && (
                  <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-semibold text-white border border-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[380px] p-0 border-gray-200 shadow-lg">
              <div className="border-b border-gray-200 px-4 py-3">
                <h3 className="text-sm font-semibold text-black">Notifications</h3>
                <p className="text-xs text-gray-500 mt-0.5">Risk and compliance updates</p>
              </div>
              <div className="max-h-[320px] overflow-y-auto">
                {MOCK_NOTIFICATIONS.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <Bell className="h-10 w-10 text-gray-200 mx-auto mb-2" strokeWidth={1.5} />
                    <p className="text-sm text-gray-500">No new notifications</p>
                    <p className="text-xs text-gray-400 mt-1">Updates appear here when available</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {MOCK_NOTIFICATIONS.map((n) => (
                      <li key={n.id}>
                        <div className="px-4 py-3 hover:bg-gray-50 transition-colors flex gap-3">
                          <div className="shrink-0 mt-0.5">
                            {n.type === "risk" ? (
                              <AlertTriangle className="h-4 w-4 text-amber-500" strokeWidth={1.5} />
                            ) : n.type === "exclusion" ? (
                              <Shield className="h-4 w-4 text-gray-500" strokeWidth={1.5} />
                            ) : (
                              <TrendingUp className="h-4 w-4 text-gray-500" strokeWidth={1.5} />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-black">{n.title}</p>
                            <p className="text-xs text-gray-600 mt-0.5">{n.body}</p>
                            <p className="text-[11px] text-gray-400 mt-1">{formatRelativeTime(n.time)}</p>
                          </div>
                          {n.unread && (
                            <span className="shrink-0 w-2 h-2 rounded-full bg-[#6ABF36] mt-2" aria-hidden />
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="border-t border-gray-200 px-4 py-2 bg-gray-50/80">
                <DropdownMenuItem asChild className="cursor-pointer text-xs text-gray-600 hover:bg-transparent focus:bg-transparent">
                  <Link href="/settings/notifications" className="w-full py-2">
                    Notification settings
                  </Link>
                </DropdownMenuItem>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <User className="h-5 w-5" strokeWidth={1.5} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings">Settings</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Log out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
