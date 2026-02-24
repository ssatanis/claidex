"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import {
  User,
  Shield,
  Bell,
  Building2,
  Database,
  Key,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { name: "Profile", href: "/settings/profile", icon: User },
  { name: "Security", href: "/settings/security", icon: Shield },
  { name: "Notifications", href: "/settings/notifications", icon: Bell },
  { name: "Organization & Teams", href: "/settings/organization", icon: Building2 },
  { name: "Data & Privacy", href: "/settings/data-privacy", icon: Database },
  { name: "API & Integrations", href: "/settings/api-integrations", icon: Key },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <AppShell>
      <div className="flex gap-8 max-w-6xl mx-auto">
        <aside className="w-56 shrink-0 border-r border-gray-200 pr-6">
          <h2 className="text-h3 text-black mb-4">Settings</h2>
          <nav className="space-y-0.5">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 text-sm font-medium tracking-wide border-l-2 transition-colors",
                    isActive
                      ? "border-[#6ABF36] bg-gray-100 text-black"
                      : "border-transparent text-gray-600 hover:bg-gray-50 hover:text-black"
                  )}
                >
                  <Icon
                    className={cn("h-4 w-4 shrink-0", isActive ? "text-[#6ABF36]" : "text-gray-500")}
                    strokeWidth={1.5}
                  />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </aside>
        <div className="flex-1 min-w-0 pb-12">{children}</div>
      </div>
    </AppShell>
  );
}
