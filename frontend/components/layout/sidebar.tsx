"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  AlertTriangle,
  Star,
  Key,
  Settings,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Providers", href: "/providers", icon: Users },
  { name: "Events", href: "/events", icon: AlertTriangle },
  { name: "Watchlists", href: "/watchlists", icon: Star },
  { name: "API Keys", href: "/api-keys", icon: Key },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-64 flex-col border-r border-black bg-black text-white">
      {/* Logo */}
      <div className="flex h-16 items-center border-b border-gray-800 px-6">
        <h1 className="font-mono text-xl font-bold uppercase tracking-wider">
          CLAIDEX
        </h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
          const Icon = item.icon;

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 border-l-[3px] px-3 py-2.5 text-sm font-medium tracking-wide transition-all",
                isActive
                  ? "border-[#6ABF36] bg-gray-900 text-white"
                  : "border-transparent text-gray-400 hover:border-gray-700 hover:bg-gray-900 hover:text-white"
              )}
            >
              <Icon
                className={cn(
                  "h-5 w-5 flex-shrink-0 transition-colors",
                  isActive ? "text-[#6ABF36]" : "text-gray-400 group-hover:text-white"
                )}
                strokeWidth={1.5}
              />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom Section */}
      <div className="border-t border-gray-800 p-3 space-y-1">
        <Link
          href="/settings"
          className="group flex items-center gap-3 border-l-[3px] border-transparent px-3 py-2.5 text-sm font-medium tracking-wide text-gray-400 transition-all hover:border-gray-700 hover:bg-gray-900 hover:text-white"
        >
          <Settings className="h-5 w-5 flex-shrink-0" strokeWidth={1.5} />
          <span>Settings</span>
        </Link>

        <div className="flex items-center gap-3 border-l-[3px] border-transparent px-3 py-2.5">
          <User className="h-5 w-5 flex-shrink-0 text-gray-400" strokeWidth={1.5} />
          <span className="text-sm text-gray-400">User</span>
        </div>
      </div>
    </aside>
  );
}
