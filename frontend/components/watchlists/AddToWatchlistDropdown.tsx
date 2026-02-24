"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Star, Plus, Check } from "lucide-react";
import { useWatchlists, useWatchlistItems } from "@/hooks/useWatchlists";
import * as watchlistsApi from "@/lib/api/watchlists";
import { NewWatchlistModal } from "./NewWatchlistModal";

const watchlistsKey = ["watchlists"] as const;

interface AddToWatchlistDropdownProps {
  npi: string;
  providerName?: string;
  variant?: "primary" | "secondary" | "accent" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  onAdded?: (watchlistName: string) => void;
  onRemoved?: (watchlistName: string) => void;
}

export function AddToWatchlistDropdown({
  npi,
  variant = "secondary",
  size = "md",
  onAdded,
  onRemoved,
}: AddToWatchlistDropdownProps) {
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [pendingNpiForNew, setPendingNpiForNew] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: watchlists = [], isLoading: listsLoading } = useWatchlists();

  const handleAdd = async (watchlistId: string, watchlistName: string) => {
    try {
      await watchlistsApi.addWatchlistItems(watchlistId, { npis: [npi] });
      queryClient.invalidateQueries({ queryKey: watchlistsKey });
      queryClient.invalidateQueries({ queryKey: [...watchlistsKey, watchlistId] });
      queryClient.invalidateQueries({ queryKey: [...watchlistsKey, watchlistId, "items"] });
      queryClient.invalidateQueries({ queryKey: [...watchlistsKey, watchlistId, "metrics"] });
      onAdded?.(watchlistName);
    } catch {
      // Toast or inline error could be added
    }
  };

  const handleRemove = async (watchlistId: string, watchlistName: string) => {
    try {
      await watchlistsApi.removeWatchlistItem(watchlistId, npi);
      queryClient.invalidateQueries({ queryKey: watchlistsKey });
      queryClient.invalidateQueries({ queryKey: [...watchlistsKey, watchlistId] });
      queryClient.invalidateQueries({ queryKey: [...watchlistsKey, watchlistId, "items"] });
      queryClient.invalidateQueries({ queryKey: [...watchlistsKey, watchlistId, "metrics"] });
      onRemoved?.(watchlistName);
    } catch {
      // Toast or inline error could be added
    }
  };

  const handleCreateNew = () => {
    setPendingNpiForNew(npi);
    setNewModalOpen(true);
  };

  const handleNewSuccess = (newId: string, newName: string) => {
    if (pendingNpiForNew) {
      watchlistsApi.addWatchlistItems(newId, { npis: [pendingNpiForNew] }).then(() => {
        queryClient.invalidateQueries({ queryKey: watchlistsKey });
        queryClient.invalidateQueries({ queryKey: [...watchlistsKey, newId] });
        queryClient.invalidateQueries({ queryKey: [...watchlistsKey, newId, "items"] });
        queryClient.invalidateQueries({ queryKey: [...watchlistsKey, newId, "metrics"] });
        onAdded?.(newName);
      });
      setPendingNpiForNew(null);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={variant as "primary" | "secondary" | "accent" | "ghost" | "danger"} size={size}>
            <Star className="h-4 w-4" />
            <span>Add to Watchlist</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[220px]">
          {listsLoading ? (
            <div className="px-2 py-4 text-center text-sm text-gray-500">
              Loading watchlists...
            </div>
          ) : watchlists.length === 0 ? (
            <>
              <div className="px-2 py-2 text-sm text-gray-600">
                No watchlists yet. Create one to add this provider.
              </div>
              <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setNewModalOpen(true); setPendingNpiForNew(npi); }}>
                <Plus className="h-4 w-4 mr-2" />
                Create new watchlist
              </DropdownMenuItem>
            </>
          ) : (
            <>
              {watchlists.map((wl) => (
                <WatchlistRow
                  key={wl.id}
                  watchlist={wl}
                  npi={npi}
                  onAdd={() => handleAdd(wl.id, wl.name)}
                  onRemove={() => handleRemove(wl.id, wl.name)}
                />
              ))}
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  handleCreateNew();
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create new watchlist
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <NewWatchlistModal
        open={newModalOpen}
        onOpenChange={(open) => {
          setNewModalOpen(open);
          if (!open) setPendingNpiForNew(null);
        }}
        onSuccess={handleNewSuccess}
      />
    </>
  );
}

function WatchlistRow({
  watchlist,
  npi,
  onAdd,
  onRemove,
}: {
  watchlist: { id: string; name: string; item_count: number };
  npi: string;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const { data: items = [] } = useWatchlistItems(watchlist.id);
  const isInList = items.some((i) => i.npi === npi);

  return (
    <DropdownMenuItem
      onSelect={(e) => {
        e.preventDefault();
        if (isInList) onRemove();
        else onAdd();
      }}
    >
      <span className="flex-1 truncate">{watchlist.name}</span>
      <span className="text-caption text-gray-500 ml-1">({watchlist.item_count})</span>
      {isInList && <Check className="h-4 w-4 ml-2 text-accent" />}
    </DropdownMenuItem>
  );
}
