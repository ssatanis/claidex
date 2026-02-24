"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Building2,
  Hash,
  MapPin,
  LayoutDashboard,
  Users,
  Calendar,
  ArrowRight,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Command } from "cmdk";
import { cn } from "@/lib/utils";
import { useSearch } from "@/hooks/use-api";

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SUGGESTIONS = [
  {
    label: "Search by provider name",
    example: "e.g. Memorial Hospital, Smith Clinic",
    icon: Building2,
  },
  {
    label: "Search by NPI",
    example: "10-digit NPI, e.g. 1234567890",
    icon: Hash,
  },
  {
    label: "Search by city or state",
    example: "e.g. Boston, CA, Texas",
    icon: MapPin,
  },
] as const;

const QUICK_LINKS = [
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { label: "Providers", path: "/providers", icon: Users },
  { label: "Events", path: "/events", icon: Calendar },
] as const;

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: results, isLoading } = useSearch(
    debouncedQuery,
    undefined,
    20
  );

  const providers = (results ?? []).filter((r) => r.type === "Provider");
  const entities = (results ?? []).filter(
    (r) => r.type === "CorporateEntity" || r.type === "Person"
  );
  const hasQuery = debouncedQuery.length >= 2;
  const showSuggestions = !hasQuery;

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(true);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const handleSelectProvider = (npi: string) => {
    onOpenChange(false);
    router.push(`/providers/${npi}`);
  };

  const handleSelectEntity = (entityId: string) => {
    onOpenChange(false);
    router.push(`/entities/${entityId}`);
  };

  const handleQuickLink = (path: string) => {
    onOpenChange(false);
    router.push(path);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl p-0 gap-0 overflow-hidden border border-gray-200 bg-white shadow-xl"
        aria-describedby={undefined}
        hideClose
      >
        <Command
          className="rounded-none border-none bg-transparent"
          shouldFilter={false}
        >
          <div className="flex items-center border-b border-gray-200 bg-gray-50/80 px-4 search-dialog-header" data-no-focus-ring>
            <Search
              className="mr-3 h-5 w-5 text-gray-400 flex-shrink-0"
              strokeWidth={1.5}
            />
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Search providers, entities, events..."
              className="flex h-14 w-full bg-transparent text-base outline-none outline-offset-0 placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
              autoFocus
            />
            <kbd className="ml-2 hidden shrink-0 items-center gap-0.5 whitespace-nowrap rounded border border-gray-300 bg-white px-2 py-1 font-mono text-xs text-gray-500 sm:inline-flex">
              <span>⌘</span><span>K</span>
            </kbd>
          </div>

          <Command.List className="max-h-[min(28rem,70vh)] overflow-y-auto p-0">
            {/* Premium suggestions when no query or short query */}
            {showSuggestions && (
              <div className="border-b border-gray-100 px-4 py-4">
                <p className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-500">
                  What you can search
                </p>
                <ul className="space-y-2">
                  {SUGGESTIONS.map((s) => {
                    const Icon = s.icon;
                    return (
                      <li
                        key={s.label}
                        className="flex items-start gap-3 rounded-md border border-transparent px-3 py-2 text-gray-600 transition-colors hover:border-gray-200 hover:bg-gray-50/80"
                      >
                        <Icon
                          className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400"
                          strokeWidth={1.5}
                        />
                        <div>
                          <p className="text-sm font-medium text-gray-800">
                            {s.label}
                          </p>
                          <p className="text-xs text-gray-500">{s.example}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-4 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-gray-500">
                  Quick navigation
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {QUICK_LINKS.map((link) => {
                    const Icon = link.icon;
                    return (
                      <Command.Item
                        key={link.path}
                        value={`go ${link.label} ${link.path}`}
                        onSelect={() => handleQuickLink(link.path)}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors",
                          "hover:border-black hover:bg-gray-50 hover:text-black",
                          "aria-selected:border-black aria-selected:bg-gray-50 aria-selected:text-black"
                        )}
                      >
                        <Icon className="h-4 w-4" strokeWidth={1.5} />
                        {link.label}
                        <ArrowRight className="h-3.5 w-3.5 text-gray-400" />
                      </Command.Item>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Results: loading */}
            {hasQuery && isLoading && (
              <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-gray-500">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-black" />
                Searching...
              </div>
            )}

            {/* Results: no results */}
            {hasQuery && !isLoading && providers.length === 0 && entities.length === 0 && (
              <Command.Empty className="py-12 text-center">
                <p className="text-sm font-medium text-gray-700">
                  No results for &quot;{debouncedQuery}&quot;
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Try provider name, NPI, or city/state
                </p>
              </Command.Empty>
            )}

            {/* Results: providers */}
            {hasQuery && !isLoading && providers.length > 0 && (
              <Command.Group
                heading="Providers"
                className="px-4 py-2 text-xs font-medium uppercase tracking-wider text-gray-500"
              >
                <div className="pb-2 pt-1">
                  {providers.map((result) => {
                    if (result.type !== "Provider") return null;
                    const d = result.data as {
                      npi: string;
                      name: string;
                      state?: string | null;
                      city?: string | null;
                    };
                    return (
                      <Command.Item
                        key={d.npi}
                        value={`provider ${d.npi} ${d.name}`}
                        onSelect={() => handleSelectProvider(d.npi)}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
                          "hover:bg-gray-50 aria-selected:bg-gray-100"
                        )}
                      >
                        <Building2
                          className="h-4 w-4 flex-shrink-0 text-gray-500"
                          strokeWidth={1.5}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-900 truncate">
                            {d.name || "Unknown"}
                          </p>
                          <p className="text-xs text-gray-500">
                            NPI {d.npi}
                            {d.state ? ` · ${d.state}` : ""}
                            {d.city ? ` · ${d.city}` : ""}
                          </p>
                        </div>
                        <ArrowRight className="h-4 w-4 flex-shrink-0 text-gray-400" />
                      </Command.Item>
                    );
                  })}
                </div>
              </Command.Group>
            )}

            {/* Results: entities (when API supports them) */}
            {hasQuery && !isLoading && entities.length > 0 && (
              <Command.Group
                heading="Entities"
                className="px-4 py-2 text-xs font-medium uppercase tracking-wider text-gray-500"
              >
                <div className="pb-2 pt-1">
                  {entities.map((result) => {
                    const d = result.data as { entity_id: string; name: string | null };
                    return (
                      <Command.Item
                        key={d.entity_id}
                        value={`entity ${d.entity_id} ${d.name ?? ""}`}
                        onSelect={() => handleSelectEntity(d.entity_id)}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
                          "hover:bg-gray-50 aria-selected:bg-gray-100"
                        )}
                      >
                        <Building2
                          className="h-4 w-4 flex-shrink-0 text-gray-500"
                          strokeWidth={1.5}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-900 truncate">
                            {d.name || d.entity_id}
                          </p>
                          <p className="text-xs text-gray-500">
                            Entity {d.entity_id}
                          </p>
                        </div>
                        <ArrowRight className="h-4 w-4 flex-shrink-0 text-gray-400" />
                      </Command.Item>
                    );
                  })}
                </div>
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
