// Watchlists feature: user-defined collections of providers for monitoring.

export interface Watchlist {
  id: string;
  user_id: string;
  organization_id: string | null;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  shared: boolean;
  created_at: string;
  updated_at: string;
}

export interface WatchlistWithCount extends Watchlist {
  item_count: number;
}

export interface WatchlistItemRow {
  id: string;
  watchlist_id: string;
  npi: string;
  entity_type: string;
  notes: string | null;
  added_at: string;
  added_by_user_id: string | null;
  provider_name: string | null;
  state: string | null;
  taxonomy_code: string | null;
  risk_score: number | null;
  risk_label: string | null;
  is_excluded: boolean;
}

export interface WatchlistMetrics {
  total_items: number;
  high_risk_count: number;
  high_risk_pct: number;
  excluded_count: number;
  avg_risk_score: number | null;
  last_risk_update: string | null;
}

export interface CreateWatchlistInput {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  shared?: boolean;
}

export interface PatchWatchlistInput {
  name?: string;
  description?: string | null;
  color?: string;
  icon?: string;
  shared?: boolean;
}
