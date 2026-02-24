CREATE TABLE IF NOT EXISTS providers (
    npi                 TEXT PRIMARY KEY,
    entity_type_code    SMALLINT,           -- 1=Individual, 2=Organization
    org_name            TEXT,
    last_name           TEXT,
    first_name          TEXT,
    middle_name         TEXT,
    credential          TEXT,
    address_line1       TEXT,
    city                TEXT,
    state               TEXT,
    zip                 TEXT,
    taxonomy_1          TEXT,
    license_1           TEXT,
    license_state_1     TEXT,
    display_name        TEXT,
    is_excluded         BOOLEAN DEFAULT FALSE,
    eligible_partb      BOOLEAN DEFAULT FALSE,
    eligible_dme        BOOLEAN DEFAULT FALSE,
    eligible_hha        BOOLEAN DEFAULT FALSE,
    eligible_pmd        BOOLEAN DEFAULT FALSE,
    eligible_hospice     BOOLEAN DEFAULT FALSE,
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_providers_state     ON providers (state);
CREATE INDEX IF NOT EXISTS idx_providers_zip       ON providers (zip);
CREATE INDEX IF NOT EXISTS idx_providers_excluded  ON providers (is_excluded) WHERE is_excluded = TRUE;
CREATE INDEX IF NOT EXISTS idx_providers_name_fts
    ON providers USING gin(to_tsvector('english', coalesce(display_name, '')));
CREATE INDEX IF NOT EXISTS idx_providers_fts
    ON providers USING gin(to_tsvector('english', coalesce(display_name, '') || ' ' || coalesce(npi, '') || ' ' || coalesce(city, '')));
