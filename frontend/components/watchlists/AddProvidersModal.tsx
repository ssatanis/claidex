"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useSearch } from "@/hooks/use-api";
import { useWatchlistItems, useAddWatchlistItems } from "@/hooks/useWatchlists";
import type { SearchResult } from "@/types/api";
import { cn } from "@/lib/utils";
import { getRiskLevel } from "@/lib/utils";
import { Search, X } from "lucide-react";

interface AddProvidersModalProps {
  watchlistId: string | null;
  watchlistName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (added: number) => void;
}

function isProviderResult(r: SearchResult): r is SearchResult & { type: "Provider"; data: { npi: string } } {
  return r.type === "Provider" && "npi" in r.data;
}

export function AddProvidersModal({
  watchlistId,
  watchlistName,
  open,
  onOpenChange,
  onSuccess,
}: AddProvidersModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedNpis, setSelectedNpis] = useState<Set<string>>(new Set());
  const [manualNpis, setManualNpis] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: searchResults = [], isLoading: searchLoading } = useSearch(
    debouncedQuery,
    "provider",
    20
  );
  const { data: existingItems = [] } = useWatchlistItems(watchlistId);
  const existingNpis = new Set(existingItems.map((i) => i.npi));

  const addMutation = useAddWatchlistItems(watchlistId);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const providerResults = searchResults.filter(isProviderResult);

  const toggleNpi = (npi: string) => {
    if (existingNpis.has(npi)) return;
    setSelectedNpis((prev) => {
      const next = new Set(prev);
      if (next.has(npi)) next.delete(npi);
      else next.add(npi);
      return next;
    });
  };

  const removeSelected = (npi: string) => {
    setSelectedNpis((prev) => {
      const next = new Set(prev);
      next.delete(npi);
      return next;
    });
  };

  const addManualNpis = () => {
    const trimmed = manualNpis.trim();
    if (!trimmed) return;
    const npis = trimmed
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => /^\d{10}$/.test(s));
    setSelectedNpis((prev) => {
      const next = new Set(prev);
      npis.forEach((n) => next.add(n));
      return next;
    });
    setManualNpis("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const npis = Array.from(selectedNpis).filter((n) => !existingNpis.has(n));
    if (npis.length === 0) {
      setError("Select at least one provider to add, or enter NPIs.");
      return;
    }
    if (!watchlistId) return;
    try {
      const { added } = await addMutation.mutateAsync(npis);
      onOpenChange(false);
      setSelectedNpis(new Set());
      setSearchQuery("");
      setManualNpis("");
      onSuccess?.(added);
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "Failed to add providers. Please try again.";
      setError(message);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSelectedNpis(new Set());
      setSearchQuery("");
      setManualNpis("");
      setError(null);
    }
    onOpenChange(next);
  };

  const addCount = Array.from(selectedNpis).filter((n) => !existingNpis.has(n)).length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Providers</DialogTitle>
          <DialogDescription>
            Search for providers by name, NPI, city, or state to add to &quot;{watchlistName}&quot;.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 space-y-4">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded">
              {error}
            </p>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search providers by name, NPI, city, state..."
              className="pl-9 border-black"
              autoFocus
            />
          </div>
          {selectedNpis.size > 0 && (
            <div className="flex flex-wrap gap-2">
              {Array.from(selectedNpis).map((npi) => (
                <Badge
                  key={npi}
                  variant="status"
                  className="pr-1 gap-1"
                >
                  {npi}
                  {!existingNpis.has(npi) && (
                    <button
                      type="button"
                      onClick={() => removeSelected(npi)}
                      className="rounded-full p-0.5 hover:bg-gray-200"
                      aria-label={`Remove ${npi}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              ))}
            </div>
          )}
          <div className="space-y-2 flex-1 min-h-0 flex flex-col">
            <p className="text-sm font-medium text-black">Search results</p>
            <div className="border border-gray-200 rounded-md overflow-auto max-h-48 min-h-[8rem]">
              {!debouncedQuery || debouncedQuery.length < 2 ? (
                <p className="p-4 text-body-sm text-gray-500 text-center">
                  Type at least 2 characters to search.
                </p>
              ) : searchLoading ? (
                <p className="p-4 text-body-sm text-gray-500 text-center">
                  Searching...
                </p>
              ) : providerResults.length === 0 ? (
                <p className="p-4 text-body-sm text-gray-500 text-center">
                  No providers found.
                </p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {providerResults.map((r) => {
                    const npi = r.data.npi;
                    const inList = existingNpis.has(npi);
                    const selected = selectedNpis.has(npi);
                    const risk = "risk_score" in r.data ? getRiskLevel(r.data.risk_score as number) : null;
                    return (
                      <li key={npi} className="flex items-center gap-2 p-2 hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={inList}
                          onChange={() => toggleNpi(npi)}
                          className="rounded border-gray-300"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-body-sm font-medium text-black truncate">
                            {("name" in r.data ? r.data.name : null) ?? `NPI ${npi}`}
                          </p>
                          <p className="text-caption text-gray-500">
                            {npi}
                            {"state" in r.data && r.data.state ? ` · ${r.data.state}` : ""}
                            {inList && (
                              <span className="text-amber-600 ml-1">(Already in watchlist)</span>
                            )}
                          </p>
                        </div>
                        {risk && (
                          <Badge variant={risk.variant} size="sm">
                            {risk.label}
                          </Badge>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-black tracking-wide">
              Or enter NPIs (comma-separated)
            </label>
            <div className="flex gap-2">
              <Input
                value={manualNpis}
                onChange={(e) => setManualNpis(e.target.value)}
                onBlur={addManualNpis}
                placeholder="e.g. 1234567890, 0987654321"
                className="border-black flex-1"
              />
              <Button type="button" variant="secondary" onClick={addManualNpis}>
                Add
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="accent"
              disabled={addCount === 0}
              loading={addMutation.isPending}
            >
              Add {addCount > 0 ? addCount : ""} provider{addCount !== 1 ? "s" : ""} to watchlist
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
