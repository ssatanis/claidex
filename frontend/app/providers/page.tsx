"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Users } from "lucide-react";
import { useSearch } from "@/hooks/use-api";

const US_STATES = [
  "All", "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];

type EntityTypeFilter = "all" | "provider";

export default function ProvidersPage() {
  const router = useRouter();

  // State
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("All");
  const [entityTypeFilter, setEntityTypeFilter] = useState<EntityTypeFilter>("all");

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchInput);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchInput]);

  // Fetch search results
  const {
    data: searchResults,
    isLoading,
    error,
  } = useSearch(
    debouncedQuery,
    entityTypeFilter !== "all" ? entityTypeFilter : undefined,
    100
  );

  // Filter results by state (client-side)
  const filteredResults =
    searchResults?.filter((result) => {
      if (result.type !== "Provider") return false;
      if (stateFilter !== "All" && result.data.state !== stateFilter) return false;
      return true;
    }) || [];

  const handleRowClick = (npi: string) => {
    router.push(`/providers/${npi}`);
  };

  const showResults = debouncedQuery.length >= 2;

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-h1 text-black">Providers</h1>
          <p className="mt-1 text-body-sm text-gray-600">
            Search and browse healthcare providers
          </p>
        </div>

        {/* Search and Filters */}
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
                placeholder="Search by provider name or NPI..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-10 h-12 text-base"
              />
            </div>

            {/* Filters Row */}
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Select
                  value={stateFilter}
                  onChange={(e) => setStateFilter(e.target.value)}
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

              <div className="flex-1">
                <Select
                  value={entityTypeFilter}
                  onChange={(e) => setEntityTypeFilter(e.target.value as EntityTypeFilter)}
                  label="Entity Type"
                  className="w-full"
                >
                  <option value="all">All Types</option>
                  <option value="provider">Providers Only</option>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results Section */}
        {!showResults ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Users className="h-16 w-16 text-gray-300 mb-4" strokeWidth={1.5} />
              <p className="text-body text-gray-600">
                Enter a provider name or NPI to begin searching
              </p>
              <p className="text-body-sm text-gray-500 mt-1">
                Minimum 2 characters required
              </p>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <Card>
            <CardContent className="p-0">
              <div className="space-y-2 p-6">
                {[...Array(10)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        ) : error ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <p className="text-body text-red-600">Error loading results</p>
              <p className="text-body-sm text-gray-500 mt-1">
                Please try again or refine your search
              </p>
            </CardContent>
          </Card>
        ) : filteredResults.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Search className="h-16 w-16 text-gray-300 mb-4" strokeWidth={1.5} />
              <p className="text-body text-gray-600">No providers found</p>
              <p className="text-body-sm text-gray-500 mt-1">
                Try adjusting your search or filters
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Provider Name</TableHead>
                      <TableHead>NPI</TableHead>
                      <TableHead>Taxonomy</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Entity Type</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredResults.map((result, index) => {
                      if (result.type !== "Provider") return null;
                      const provider = result.data as {
                        npi: string;
                        name: string;
                        entityType: string | null;
                        city: string | null;
                        state: string | null;
                        taxonomy: string | null;
                        isExcluded: boolean;
                      };

                      return (
                        <TableRow
                          key={`${provider.npi}-${index}`}
                          className="cursor-pointer"
                          onClick={() => handleRowClick(provider.npi)}
                        >
                          <TableCell className="font-semibold">
                            {provider.name || "Unknown"}
                          </TableCell>
                          <TableCell className="font-mono text-sm text-gray-600">
                            {provider.npi}
                          </TableCell>
                          <TableCell className="max-w-xs truncate text-gray-600">
                            {provider.taxonomy || "—"}
                          </TableCell>
                          <TableCell className="text-gray-600">
                            {provider.city && provider.state
                              ? `${provider.city}, ${provider.state}`
                              : provider.state || "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="category" size="sm">
                              {provider.entityType || "Unknown"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={provider.isExcluded ? "critical" : "low"}
                              size="sm"
                              showDot
                            >
                              {provider.isExcluded ? "Excluded" : "Active"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Results Count */}
              <div className="border-t border-gray-200 px-6 py-4">
                <p className="text-sm text-gray-600">
                  Showing {filteredResults.length} provider
                  {filteredResults.length !== 1 ? "s" : ""}
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
