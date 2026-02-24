-- =============================================================================
-- Claidex Watchlists schema (Neon Postgres)
-- =============================================================================
-- User-defined collections of providers/entities for monitoring.
-- Apply manually in Neon console or via migration.
-- =============================================================================

-- Watchlists: named collections owned by a user (and optionally shared with org)
CREATE TABLE IF NOT EXISTS watchlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  organization_id UUID,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  description TEXT,
  color TEXT DEFAULT '#6ABF36',
  icon TEXT DEFAULT 'folder',
  shared BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_watchlists_user ON watchlists(user_id);
CREATE INDEX IF NOT EXISTS idx_watchlists_org ON watchlists(organization_id);

-- Watchlist items: NPIs (and optional entity_type) per watchlist
CREATE TABLE IF NOT EXISTS watchlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id UUID NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
  npi TEXT NOT NULL,
  entity_type TEXT DEFAULT 'provider',
  notes TEXT,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  added_by_user_id UUID,
  UNIQUE(watchlist_id, npi)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_items_watchlist ON watchlist_items(watchlist_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_items_npi ON watchlist_items(npi);

-- Watchlist alerts: config for notifications (routes stubbed for later)
CREATE TABLE IF NOT EXISTS watchlist_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id UUID NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT true,
  severity_threshold TEXT DEFAULT 'high',
  notify_email BOOLEAN DEFAULT true,
  notify_dashboard BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
