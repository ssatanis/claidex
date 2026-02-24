"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  X,
  Filter,
} from "lucide-react";
import { useEvents } from "@/hooks/use-api";
import { formatRelativeTime } from "@/lib/utils";
import type { RiskEvent } from "@/types/api";

const US_STATES = [
  "All",
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
];

const EVENT_TYPES = [
  "All",
  "Exclusion",
  "Payment Spike",
  "Risk Score Change",
  "Ownership Change",
];

type SeverityFilter = "all" | "critical" | "high" | "medium" | "low";
type ProgramFilter = "All" | "Medicare" | "Medicaid";

export default function EventsPage() {
  const router = useRouter();

  // Filter state
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [programFilter, setProgramFilter] = useState<ProgramFilter>("All");
  const [eventTypeFilter, setEventTypeFilter] = useState("All");
  const [stateFilter, setStateFilter] = useState("All");
  const [page, setPage] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<RiskEvent | null>(null);

  const ITEMS_PER_PAGE = 50;

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(0); // Reset to first page on search
    }, 500);

    return () => clearTimeout(timer);
  }, [searchInput]);

  // Fetch events with filters
  const {
    data: events,
    isLoading,
    error,
  } = useEvents({
    severity: severityFilter !== "all" ? severityFilter : undefined,
    program: programFilter !== "All" ? programFilter : undefined,
    event_type: eventTypeFilter !== "All" ? eventTypeFilter : undefined,
    state: stateFilter !== "All" ? stateFilter : undefined,
    limit: ITEMS_PER_PAGE,
    offset: page * ITEMS_PER_PAGE,
  });

  // Client-side search filtering (since backend doesn't support search yet)
  const filteredEvents =
    events?.filter((event) => {
      if (!debouncedSearch) return true;
      const searchLower = debouncedSearch.toLowerCase();
      return (
        event.provider_name?.toLowerCase().includes(searchLower) ||
        event.provider_npi?.toLowerCase().includes(searchLower) ||
        event.event_type?.toLowerCase().includes(searchLower) ||
        event.description?.toLowerCase().includes(searchLower)
      );
    }) || [];

  // Count active filters
  const activeFilterCount =
    (severityFilter !== "all" ? 1 : 0) +
    (programFilter !== "All" ? 1 : 0) +
    (eventTypeFilter !== "All" ? 1 : 0) +
    (stateFilter !== "All" ? 1 : 0) +
    (debouncedSearch ? 1 : 0);

  // Severity chip styling
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "border-red-600 bg-red-50 text-red-700";
      case "high":
        return "border-orange-600 bg-orange-50 text-orange-700";
      case "medium":
        return "border-amber-600 bg-amber-50 text-amber-700";
      case "low":
        return "border-[#6ABF36] bg-green-50 text-green-700";
      default:
        return "border-gray-400 bg-gray-50 text-gray-600";
    }
  };

  const handleNavigateToProvider = (npi: string) => {
    router.push(`/providers/${npi}`);
    setSelectedEvent(null);
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-h1 text-black">Risk Events</h1>
          <p className="mt-1 text-body-sm text-gray-600">
            Monitor and investigate risk events across your provider network
          </p>
        </div>

        {/* Filter Bar */}
        <Card>
          <CardContent className="space-y-4 p-6">
            {/* Search Input */}
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
                strokeWidth={1.5}
              />
              <Input
                type="text"
                placeholder="Search events, providers, NPIs..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-10 h-12 text-base"
              />
            </div>

            {/* Filters Row */}
            <div className="flex items-center gap-4 flex-wrap">
              {/* Severity Chips */}
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-gray-500" strokeWidth={1.5} />
                <div className="flex gap-2">
                  {(["all", "critical", "high", "medium", "low"] as const).map(
                    (severity) => (
                      <button
                        key={severity}
                        onClick={() => {
                          setSeverityFilter(severity);
                          setPage(0);
                        }}
                        className={`px-3 py-1 text-xs font-medium tracking-wide border transition-colors ${
                          severityFilter === severity
                            ? severity === "all"
                              ? "border-black bg-black text-white"
                              : getSeverityColor(severity)
                            : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        {severity.charAt(0).toUpperCase() + severity.slice(1)}
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Program Filter */}
              <div className="flex-1 min-w-[160px]">
                <Select
                  value={programFilter}
                  onChange={(e) => {
                    setProgramFilter(e.target.value as ProgramFilter);
                    setPage(0);
                  }}
                  label="Program"
                  className="w-full"
                >
                  <option value="All">All Programs</option>
                  <option value="Medicare">Medicare</option>
                  <option value="Medicaid">Medicaid</option>
                </Select>
              </div>

              {/* Event Type Filter */}
              <div className="flex-1 min-w-[160px]">
                <Select
                  value={eventTypeFilter}
                  onChange={(e) => {
                    setEventTypeFilter(e.target.value);
                    setPage(0);
                  }}
                  label="Event Type"
                  className="w-full"
                >
                  {EVENT_TYPES.map((type) => (
                    <option key={type} value={type === "All" ? "All" : type}>
                      {type === "All" ? "All Event Types" : type}
                    </option>
                  ))}
                </Select>
              </div>

              {/* State Filter */}
              <div className="flex-1 min-w-[160px]">
                <Select
                  value={stateFilter}
                  onChange={(e) => {
                    setStateFilter(e.target.value);
                    setPage(0);
                  }}
                  label="State"
                  className="w-full"
                >
                  {US_STATES.map((state) => (
                    <option key={state} value={state}>
                      {state === "All" ? "All States" : state}
                    </option>
                  ))}
                </Select>
              </div>

              {/* Active Filters Badge */}
              {activeFilterCount > 0 && (
                <div className="flex items-center gap-2">
                  <Badge variant="category" size="sm">
                    {activeFilterCount} filter{activeFilterCount !== 1 ? "s" : ""}{" "}
                    active
                  </Badge>
                  <button
                    onClick={() => {
                      setSearchInput("");
                      setDebouncedSearch("");
                      setSeverityFilter("all");
                      setProgramFilter("All");
                      setEventTypeFilter("All");
                      setStateFilter("All");
                      setPage(0);
                    }}
                    className="text-xs text-gray-600 hover:text-black underline"
                  >
                    Clear all
                  </button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Events Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-2 p-6">
                {[...Array(10)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-16">
                <AlertTriangle
                  className="h-16 w-16 text-red-600 mb-4"
                  strokeWidth={1.5}
                />
                <p className="text-body text-red-600">Error loading events</p>
                <p className="text-body-sm text-gray-500 mt-1">
                  Please try again or refine your filters
                </p>
              </div>
            ) : !filteredEvents || filteredEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <AlertTriangle
                  className="h-16 w-16 text-gray-300 mb-4"
                  strokeWidth={1.5}
                />
                <p className="text-body text-gray-600">No events found</p>
                <p className="text-body-sm text-gray-500 mt-1">
                  Try adjusting your filters or search query
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Severity</TableHead>
                        <TableHead>Event Type</TableHead>
                        <TableHead>Provider / Entity</TableHead>
                        <TableHead>Program</TableHead>
                        <TableHead>State</TableHead>
                        <TableHead>Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEvents.map((event) => (
                        <TableRow
                          key={event.id}
                          className="cursor-pointer hover:bg-gray-50 transition-colors"
                          onClick={() => setSelectedEvent(event)}
                        >
                          <TableCell>
                            <Badge
                              variant={event.severity as any}
                              showDot
                              size="sm"
                              className="capitalize"
                            >
                              {event.severity}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">
                            {event.event_type}
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-semibold text-black">
                                {event.provider_name || "Unknown"}
                              </div>
                              {event.provider_npi && (
                                <div className="text-xs text-gray-500 font-mono">
                                  NPI: {event.provider_npi}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="category" size="sm">
                              {event.program}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-gray-600">
                            {event.state || "—"}
                          </TableCell>
                          <TableCell className="text-gray-600">
                            {formatRelativeTime(event.timestamp)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4">
                  <p className="text-sm text-gray-600">
                    Showing {page * ITEMS_PER_PAGE + 1}–
                    {Math.min(
                      (page + 1) * ITEMS_PER_PAGE,
                      filteredEvents.length
                    )}{" "}
                    of {filteredEvents.length} event
                    {filteredEvents.length !== 1 ? "s" : ""}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setPage(Math.max(0, page - 1))}
                      disabled={page === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      <span>Previous</span>
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setPage(page + 1)}
                      disabled={filteredEvents.length < ITEMS_PER_PAGE}
                    >
                      <span>Next</span>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Event Detail Drawer — full data and context */}
      {selectedEvent && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40 animate-in fade-in duration-200"
            onClick={() => setSelectedEvent(null)}
            aria-hidden
          />
          <div
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white border-l border-gray-200 shadow-xl z-50 overflow-y-auto animate-in slide-in-from-right duration-300"
            role="dialog"
            aria-labelledby="event-detail-title"
            aria-modal="true"
          >
            <div className="p-6 space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge
                      variant={selectedEvent.severity as any}
                      showDot
                      size="md"
                      className="capitalize"
                    >
                      {selectedEvent.severity}
                    </Badge>
                    <Badge variant="category" size="sm">
                      {selectedEvent.event_type}
                    </Badge>
                  </div>
                  <h2 id="event-detail-title" className="text-h3 text-black">
                    {selectedEvent.event_type}
                  </h2>
                </div>
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="p-2 hover:bg-gray-100 rounded transition-colors shrink-0"
                  aria-label="Close"
                >
                  <X className="h-5 w-5 text-gray-600" strokeWidth={1.5} />
                </button>
              </div>

              {/* Description / specifics */}
              <section>
                <h3 className="text-caption text-gray-500 uppercase tracking-wider mb-2">Summary</h3>
                <p className="text-body text-gray-800">
                  {selectedEvent.description || "No additional details for this event."}
                </p>
              </section>

              {/* Provider */}
              <section className="border-t border-gray-100 pt-4">
                <h3 className="text-caption text-gray-500 uppercase tracking-wider mb-2">Provider / Entity</h3>
                <p className="text-body font-semibold text-black">
                  {selectedEvent.provider_name || "Unknown"}
                </p>
                {selectedEvent.provider_npi && (
                  <p className="text-body-sm text-gray-600 font-mono mt-1">NPI {selectedEvent.provider_npi}</p>
                )}
                {selectedEvent.entity_id && (
                  <p className="text-body-sm text-gray-600 mt-1">Entity ID: {selectedEvent.entity_id}</p>
                )}
              </section>

              {/* All event data grid */}
              <section className="border-t border-gray-100 pt-4">
                <h3 className="text-caption text-gray-500 uppercase tracking-wider mb-3">Event details</h3>
                <dl className="grid grid-cols-1 gap-3 text-sm">
                  <div>
                    <dt className="text-gray-500 font-medium">Event ID</dt>
                    <dd className="text-black font-mono mt-0.5 break-all">{selectedEvent.id}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500 font-medium">Program</dt>
                    <dd><Badge variant="category" size="sm">{selectedEvent.program}</Badge></dd>
                  </div>
                  <div>
                    <dt className="text-gray-500 font-medium">State</dt>
                    <dd className="text-black">{selectedEvent.state || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500 font-medium">Time (relative)</dt>
                    <dd className="text-black">{formatRelativeTime(selectedEvent.timestamp)}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500 font-medium">Timestamp</dt>
                    <dd className="text-black">
                      {new Date(selectedEvent.timestamp).toLocaleString("en-US", {
                        dateStyle: "full",
                        timeStyle: "long",
                      })}
                    </dd>
                  </div>
                </dl>
              </section>

              {/* Context / related — placeholder for news and continuous training note */}
              <section className="border-t border-gray-100 pt-4">
                <h3 className="text-caption text-gray-500 uppercase tracking-wider mb-2">Context</h3>
                <p className="text-body-sm text-gray-600">
                  Risk events are updated continuously from exclusions and risk scores. Related regulatory or news updates can be linked here when available.
                </p>
              </section>

              {/* View Provider — clarify when profile may not exist yet */}
              {selectedEvent.provider_npi && (
                <section className="border-t border-gray-100 pt-4">
                  <Button
                    variant="primary"
                    className="w-full"
                    onClick={() => handleNavigateToProvider(selectedEvent.provider_npi!)}
                  >
                    View provider profile
                  </Button>
                  <p className="text-xs text-gray-500 mt-2 text-center">
                    Profile available when NPI is in our registry
                  </p>
                </section>
              )}
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
