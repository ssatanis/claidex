"use client";

import { use, useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ChevronRight,
  Pencil,
  Plus,
  MoreHorizontal,
  Trash2,
  Download,
  Settings,
  UserX,
  ExternalLink,
} from "lucide-react";
import { useWatchlist, useWatchlistItems, useWatchlistMetrics, usePatchWatchlist, useDeleteWatchlist, useRemoveWatchlistItem } from "@/hooks/useWatchlists";
import { AddProvidersModal } from "@/components/watchlists/AddProvidersModal";
import { getRiskLevel } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { WatchlistItemRow } from "@/types/watchlist";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function WatchlistDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [addProvidersOpen, setAddProvidersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [removeItemTarget, setRemoveItemTarget] = useState<WatchlistItemRow | null>(null);
  const [searchFilter, setSearchFilter] = useState("");
  const [sortBy, setSortBy] = useState<"risk" | "name" | "added">("added");

  const { data: watchlist, isLoading: wlLoading, error: wlError } = useWatchlist(id);
  const { data: items = [], isLoading: itemsLoading } = useWatchlistItems(id);
  const { data: metrics, isLoading: metricsLoading } = useWatchlistMetrics(id);
  const patchMutation = usePatchWatchlist(id);
  const deleteMutation = useDeleteWatchlist();
  const removeItemMutation = useRemoveWatchlistItem(id);

  const [editingName, setEditingName] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [descValue, setDescValue] = useState("");

  useEffect(() => {
    if (watchlist) {
      setNameValue(watchlist.name);
      setDescValue(watchlist.description ?? "");
    }
  }, [watchlist]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "a" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
        setAddProvidersOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filteredAndSortedItems = useMemo(() => {
    let list = [...items];
    if (searchFilter.trim()) {
      const q = searchFilter.trim().toLowerCase();
      list = list.filter(
        (i) =>
          (i.provider_name ?? "").toLowerCase().includes(q) ||
          i.npi.includes(q) ||
          (i.state ?? "").toLowerCase().includes(q)
      );
    }
    if (sortBy === "risk") {
      list.sort((a, b) => (b.risk_score ?? 0) - (a.risk_score ?? 0));
    } else if (sortBy === "name") {
      list.sort((a, b) =>
        (a.provider_name ?? "").localeCompare(b.provider_name ?? "")
      );
    } else {
      list.sort(
        (a, b) =>
          new Date(b.added_at).getTime() - new Date(a.added_at).getTime()
      );
    }
    return list;
  }, [items, searchFilter, sortBy]);

  const saveName = () => {
    setEditingName(false);
    if (watchlist && nameValue.trim() !== watchlist.name) {
      patchMutation.mutate({ name: nameValue.trim() });
    }
  };

  const saveDesc = () => {
    setEditingDesc(false);
    if (watchlist && descValue !== (watchlist.description ?? "")) {
      patchMutation.mutate({ description: descValue.trim() || null });
    }
  };

  const handleDelete = async () => {
    if (!watchlist) return;
    try {
      await deleteMutation.mutateAsync(watchlist.id);
      router.push("/watchlists");
    } catch {
      // Error handled by mutation
    }
  };

  const handleRemoveItem = async () => {
    if (!removeItemTarget) return;
    try {
      await removeItemMutation.mutateAsync(removeItemTarget.npi);
      setRemoveItemTarget(null);
    } catch {
      // Error handled by mutation
    }
  };

  const exportCsv = () => {
    const headers = ["NPI", "Provider Name", "State", "Risk Score", "Risk Label", "Excluded", "Notes"];
    const rows = items.map((i) =>
      [
        i.npi,
        (i.provider_name ?? "").replace(/"/g, '""'),
        i.state ?? "",
        i.risk_score ?? "",
        i.risk_label ?? "",
        i.is_excluded ? "Yes" : "No",
        (i.notes ?? "").replace(/"/g, '""'),
      ].map((c) => `"${c}"`).join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${watchlist?.name ?? "watchlist"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportJson = () => {
    const json = JSON.stringify(items, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${watchlist?.name ?? "watchlist"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (wlLoading || !watchlist) {
    if (wlError || (!wlLoading && !watchlist)) {
      return (
        <AppShell>
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <p className="text-body text-black">Watchlist not found</p>
              <Link href="/watchlists" className="text-accent mt-2 underline">
                Back to Watchlists
              </Link>
            </CardContent>
          </Card>
        </AppShell>
      );
    }
    return (
      <AppShell>
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-96" />
        </div>
      </AppShell>
    );
  }

  const riskColor =
    metrics && metrics.avg_risk_score != null
      ? metrics.avg_risk_score >= 75
        ? "text-red-600"
        : metrics.avg_risk_score >= 50
          ? "text-amber-600"
          : "text-[#6ABF36]"
      : "text-gray-500";

  return (
    <AppShell>
      <div className="space-y-6">
        <nav className="flex items-center gap-2 text-body-sm text-gray-600">
          <Link href="/watchlists" className="hover:text-black underline">
            Watchlists
          </Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-black">{watchlist.name}</span>
        </nav>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {editingName ? (
              <Input
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onBlur={saveName}
                onKeyDown={(e) => e.key === "Enter" && saveName()}
                className="text-h2 font-semibold border-black max-w-xl"
                autoFocus
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingName(true)}
                className="group flex items-center gap-2 text-left"
              >
                <h1 className="text-h1 text-black font-semibold">{watchlist.name}</h1>
                <Pencil className="h-4 w-4 text-gray-400 opacity-0 group-hover:opacity-100" />
              </button>
            )}
            {editingDesc ? (
              <textarea
                value={descValue}
                onChange={(e) => setDescValue(e.target.value)}
                onBlur={saveDesc}
                onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLElement).blur()}
                className="mt-1 w-full max-w-xl text-body-sm text-gray-600 border border-black rounded px-2 py-1"
                rows={2}
                autoFocus
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingDesc(true)}
                className="group flex items-center gap-2 text-left mt-1"
              >
                <p className="text-body-sm text-gray-600">
                  {watchlist.description || "Add a description"}
                </p>
                <Pencil className="h-3 w-3 text-gray-400 opacity-0 group-hover:opacity-100" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="accent" size="md" onClick={() => setAddProvidersOpen(true)}>
              <Plus className="h-4 w-4" />
              <span>Add Providers</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="md">
                  <Download className="h-4 w-4" />
                  <span>Export</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={exportCsv}>Export as CSV</DropdownMenuItem>
                <DropdownMenuItem onSelect={exportJson}>Export as JSON</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="secondary" size="md" onClick={() => setSettingsOpen(true)}>
              <Settings className="h-4 w-4" />
              <span>Settings</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="md">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-red-600"
                  onSelect={() => setDeleteConfirmOpen(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Watchlist
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {metricsLoading ? (
            <>
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-24 rounded-md" />
              ))}
            </>
          ) : metrics ? (
            <>
              <Card>
                <CardContent className="p-4">
                  <p className="text-2xl font-semibold text-black">{metrics.total_items}</p>
                  <p className="text-body-sm text-gray-600">providers monitored</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-2xl font-semibold text-amber-600">
                    {metrics.high_risk_count}
                  </p>
                  <p className="text-body-sm text-gray-600">
                    {metrics.high_risk_pct}% of total
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-2xl font-semibold text-red-600">
                    {metrics.excluded_count}
                  </p>
                  <p className="text-body-sm text-gray-600">active exclusions</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className={cn("text-2xl font-semibold", riskColor)}>
                    {metrics.avg_risk_score != null
                      ? metrics.avg_risk_score.toFixed(1)
                      : "—"}
                  </p>
                  <p className="text-body-sm text-gray-600">portfolio average</p>
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>

        {/* Providers table */}
        <Card>
          <CardContent className="p-0">
            <div className="p-4 border-b border-gray-200 flex flex-wrap items-center gap-4">
              <Input
                placeholder="Search within watchlist..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="max-w-xs border-black"
              />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "risk" | "name" | "added")}
                className="border border-black rounded px-3 py-2 text-sm"
              >
                <option value="added">Date added</option>
                <option value="risk">Risk score</option>
                <option value="name">Name</option>
              </select>
            </div>
            {itemsLoading ? (
              <div className="p-8">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12 w-full mb-2" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <UserX className="h-12 w-12 text-gray-300 mb-3" />
                <p className="text-body text-black">No providers yet</p>
                <p className="text-body-sm text-gray-600 mt-1">
                  Add your first provider to start monitoring
                </p>
                <Button
                  variant="accent"
                  size="md"
                  className="mt-4"
                  onClick={() => setAddProvidersOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Providers</span>
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>NPI</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead>Exclusion</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="w-[80px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndSortedItems.map((row) => {
                    const risk = getRiskLevel(row.risk_score);
                    return (
                      <TableRow key={row.id} className="hover:bg-gray-50">
                        <TableCell>
                          <Link
                            href={`/providers/${row.npi}`}
                            className="font-medium text-black hover:underline"
                          >
                            {row.provider_name ?? `NPI ${row.npi}`}
                          </Link>
                        </TableCell>
                        <TableCell className="font-mono text-body-sm">
                          {row.npi}
                        </TableCell>
                        <TableCell>
                          <Badge variant={risk.variant} size="sm">
                            {row.risk_label ?? risk.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={row.is_excluded ? "critical" : "low"}
                            size="sm"
                          >
                            {row.is_excluded ? "Excluded" : "Clear"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-body-sm">{row.state ?? "—"}</TableCell>
                        <TableCell className="text-body-sm text-gray-600 max-w-[200px] truncate">
                          {row.notes ?? "—"}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link href={`/providers/${row.npi}`}>
                                  <ExternalLink className="h-4 w-4 mr-2" />
                                  View Detail
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-red-600"
                                onSelect={() => setRemoveItemTarget(row)}
                              >
                                <UserX className="h-4 w-4 mr-2" />
                                Remove from Watchlist
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <AddProvidersModal
        watchlistId={id}
        watchlistName={watchlist.name}
        open={addProvidersOpen}
        onOpenChange={setAddProvidersOpen}
      />

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Watchlist settings</DialogTitle>
            <DialogDescription>
              Color and sharing can be configured here. Alerts coming soon.
            </DialogDescription>
          </DialogHeader>
          <p className="text-body-sm text-gray-500">No additional settings for now.</p>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this watchlist?</DialogTitle>
            <DialogDescription>
              This will remove {items.length} provider{items.length !== 1 ? "s" : ""} from
              monitoring. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={deleteMutation.isPending} onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!removeItemTarget} onOpenChange={(open) => !open && setRemoveItemTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove from watchlist?</DialogTitle>
            <DialogDescription>
              Remove {removeItemTarget?.provider_name ?? removeItemTarget?.npi ?? "this provider"}{" "}
              from this watchlist?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRemoveItemTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={removeItemMutation.isPending}
              onClick={handleRemoveItem}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
