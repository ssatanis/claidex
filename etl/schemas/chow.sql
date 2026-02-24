CREATE TABLE IF NOT EXISTS chow_events (
  facility_entity_id text,
  facility_ccn text,
  facility_name text,
  state text,
  effective_date date,
  from_owner_entity_id text,
  from_owner_name text,
  to_owner_entity_id text,
  to_owner_name text,
  event_type text,
  source_file text
);

CREATE INDEX IF NOT EXISTS idx_chow_facility_entity ON chow_events (facility_entity_id);
CREATE INDEX IF NOT EXISTS idx_chow_facility_ccn ON chow_events (facility_ccn);
CREATE INDEX IF NOT EXISTS idx_chow_from_owner ON chow_events (from_owner_entity_id);
CREATE INDEX IF NOT EXISTS idx_chow_to_owner ON chow_events (to_owner_entity_id);
CREATE INDEX IF NOT EXISTS idx_chow_effective_date ON chow_events (effective_date);
