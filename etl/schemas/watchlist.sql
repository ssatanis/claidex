CREATE TABLE IF NOT EXISTS watchlist (
  id bigserial PRIMARY KEY,
  type text CHECK (type IN ('provider','entity')),
  entity_id text NOT NULL,
  email text NOT NULL,
  created_at timestamptz DEFAULT now(),
  last_notified_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_watchlist_type_entity_email
  ON watchlist (type, entity_id, email);
CREATE INDEX IF NOT EXISTS idx_watchlist_entity ON watchlist (type, entity_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_email ON watchlist (email);
