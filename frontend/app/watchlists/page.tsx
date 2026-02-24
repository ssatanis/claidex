"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { FolderPlus, AlertTriangle } from "lucide-react";
import { useWatchlists, useDeleteWatchlist } from "@/hooks/useWatchlists";
import { WatchlistCard } from "@/components/watchlists/WatchlistCard";
import { NewWatchlistModal } from "@/components/watchlists/NewWatchlistModal";
import type { WatchlistWithCount } from "@/types/watchlist";

export default function WatchlistsPage() {
  const router = useRouter();
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WatchlistWithCount | null>(null);

  const { data: watchlists = [], isLoading, error, refetch } = useWatchlists();
  const deleteMutation = useDeleteWatchlist();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "n" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
        setNewModalOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleNewSuccess = (newId: string) => {
    router.push(`/watchlists/${newId}`);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-h1 text-black">Watchlists</h1>
            <p className="mt-1 text-body-sm text-gray-600">
              Monitor providers and entities of interest
            </p>
          </div>
          <Button variant="accent" size="md" onClick={() => setNewModalOpen(true)}>
            <FolderPlus className="h-4 w-4" />
            <span>New Watchlist</span>
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-40 w-full rounded-md" />
            ))}
          </div>
        ) : error ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <AlertTriangle className="h-16 w-16 text-red-600 mb-4" strokeWidth={1.5} />
              <p className="text-body text-black">Failed to load watchlists</p>
              <p className="text-body-sm text-gray-500 mt-1">
                Please check your connection and try again.
              </p>
              <Button variant="secondary" className="mt-4" onClick={() => refetch()}>
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : watchlists.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <FolderPlus className="h-16 w-16 text-gray-300 mb-4" strokeWidth={1.5} />
              <p className="text-body text-black">No watchlists yet</p>
              <p className="text-body-sm text-gray-600 mt-1">
                Create your first watchlist to start monitoring providers
              </p>
              <Button
                variant="accent"
                size="md"
                className="mt-6"
                onClick={() => setNewModalOpen(true)}
              >
                <FolderPlus className="h-4 w-4" />
                <span>New Watchlist</span>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {watchlists.map((wl) => (
              <WatchlistCard
                key={wl.id}
                watchlist={wl}
                onDelete={(w) => setDeleteTarget(w)}
              />
            ))}
          </div>
        )}
      </div>

      <NewWatchlistModal
        open={newModalOpen}
        onOpenChange={setNewModalOpen}
        onSuccess={handleNewSuccess}
      />

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &quot;{deleteTarget?.name}&quot;?</DialogTitle>
            <DialogDescription>
              This will remove {deleteTarget?.item_count ?? 0} provider
              {(deleteTarget?.item_count ?? 0) !== 1 ? "s" : ""} from monitoring. This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={deleteMutation.isPending}
              onClick={handleDeleteConfirm}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
