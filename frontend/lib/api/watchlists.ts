import { fetchAPI } from "@/lib/api-client";
import type {
  Watchlist,
  WatchlistWithCount,
  WatchlistItemRow,
  WatchlistMetrics,
  CreateWatchlistInput,
  PatchWatchlistInput,
} from "@/types/watchlist";
import type { RiskEvent } from "@/types/api";

export async function getWatchlists(): Promise<WatchlistWithCount[]> {
  return fetchAPI<WatchlistWithCount[]>("/v1/watchlists");
}

export async function getWatchlist(id: string): Promise<Watchlist> {
  return fetchAPI<Watchlist>(`/v1/watchlists/${id}`);
}

export async function createWatchlist(body: CreateWatchlistInput): Promise<Watchlist> {
  return fetchAPI<Watchlist>("/v1/watchlists", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function patchWatchlist(
  id: string,
  body: PatchWatchlistInput
): Promise<Watchlist> {
  return fetchAPI<Watchlist>(`/v1/watchlists/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteWatchlist(id: string): Promise<{ deleted: boolean }> {
  return fetchAPI<{ deleted: boolean }>(`/v1/watchlists/${id}`, {
    method: "DELETE",
  });
}

export async function getWatchlistItems(id: string): Promise<WatchlistItemRow[]> {
  return fetchAPI<WatchlistItemRow[]>(`/v1/watchlists/${id}/items`);
}

export async function addWatchlistItems(
  id: string,
  body: { npis: string[] }
): Promise<{ added: number }> {
  return fetchAPI<{ added: number }>(`/v1/watchlists/${id}/items`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function removeWatchlistItem(
  id: string,
  npi: string
): Promise<{ deleted: boolean }> {
  return fetchAPI<{ deleted: boolean }>(`/v1/watchlists/${id}/items/${npi}`, {
    method: "DELETE",
  });
}

export async function patchWatchlistItem(
  id: string,
  npi: string,
  body: { notes?: string | null }
): Promise<WatchlistItemRow> {
  return fetchAPI<WatchlistItemRow>(`/v1/watchlists/${id}/items/${npi}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function getWatchlistMetrics(id: string): Promise<WatchlistMetrics> {
  return fetchAPI<WatchlistMetrics>(`/v1/watchlists/${id}/metrics`);
}

export async function getWatchlistEvents(
  id: string,
  params?: { limit?: number; offset?: number }
): Promise<RiskEvent[]> {
  const query = new URLSearchParams();
  if (params?.limit != null) query.set("limit", String(params.limit));
  if (params?.offset != null) query.set("offset", String(params.offset));
  const qs = query.toString();
  return fetchAPI<RiskEvent[]>(`/v1/watchlists/${id}/events${qs ? `?${qs}` : ""}`);
}
