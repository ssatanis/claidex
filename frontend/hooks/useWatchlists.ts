import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as watchlistsApi from "@/lib/api/watchlists";
import type {
  WatchlistWithCount,
  Watchlist,
  WatchlistItemRow,
  WatchlistMetrics,
  CreateWatchlistInput,
  PatchWatchlistInput,
} from "@/types/watchlist";
import type { RiskEvent } from "@/types/api";

const watchlistsKey = ["watchlists"] as const;

export function useWatchlists() {
  return useQuery<WatchlistWithCount[]>({
    queryKey: watchlistsKey,
    queryFn: watchlistsApi.getWatchlists,
  });
}

export function useWatchlist(id: string | null) {
  return useQuery<Watchlist>({
    queryKey: [...watchlistsKey, id],
    queryFn: () => watchlistsApi.getWatchlist(id!),
    enabled: !!id,
  });
}

export function useWatchlistItems(id: string | null) {
  return useQuery<WatchlistItemRow[]>({
    queryKey: [...watchlistsKey, id, "items"],
    queryFn: () => watchlistsApi.getWatchlistItems(id!),
    enabled: !!id,
  });
}

export function useWatchlistMetrics(id: string | null) {
  return useQuery<WatchlistMetrics>({
    queryKey: [...watchlistsKey, id, "metrics"],
    queryFn: () => watchlistsApi.getWatchlistMetrics(id!),
    enabled: !!id,
    refetchInterval: 60_000,
  });
}

export function useWatchlistEvents(
  id: string | null,
  params?: { limit?: number; offset?: number }
) {
  return useQuery<RiskEvent[]>({
    queryKey: [...watchlistsKey, id, "events", params],
    queryFn: () => watchlistsApi.getWatchlistEvents(id!, params),
    enabled: !!id,
  });
}

export function useCreateWatchlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateWatchlistInput) => watchlistsApi.createWatchlist(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: watchlistsKey });
    },
  });
}

export function usePatchWatchlist(id: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PatchWatchlistInput) =>
      watchlistsApi.patchWatchlist(id!, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: watchlistsKey });
      if (id) {
        queryClient.invalidateQueries({ queryKey: [...watchlistsKey, id] });
      }
    },
  });
}

export function useDeleteWatchlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => watchlistsApi.deleteWatchlist(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: watchlistsKey });
    },
  });
}

export function useAddWatchlistItems(id: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (npis: string[]) =>
      watchlistsApi.addWatchlistItems(id!, { npis }),
    onSuccess: (_, __, ___) => {
      queryClient.invalidateQueries({ queryKey: watchlistsKey });
      if (id) {
        queryClient.invalidateQueries({ queryKey: [...watchlistsKey, id] });
        queryClient.invalidateQueries({
          queryKey: [...watchlistsKey, id, "items"],
        });
        queryClient.invalidateQueries({
          queryKey: [...watchlistsKey, id, "metrics"],
        });
      }
    },
  });
}

export function useRemoveWatchlistItem(id: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (npi: string) => watchlistsApi.removeWatchlistItem(id!, npi),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: watchlistsKey });
      if (id) {
        queryClient.invalidateQueries({ queryKey: [...watchlistsKey, id] });
        queryClient.invalidateQueries({
          queryKey: [...watchlistsKey, id, "items"],
        });
        queryClient.invalidateQueries({
          queryKey: [...watchlistsKey, id, "metrics"],
        });
      }
    },
  });
}

export function usePatchWatchlistItem(id: string | null, npi: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { notes?: string | null }) =>
      watchlistsApi.patchWatchlistItem(id!, npi!, body),
    onSuccess: () => {
      if (id) {
        queryClient.invalidateQueries({
          queryKey: [...watchlistsKey, id, "items"],
        });
      }
    },
  });
}
