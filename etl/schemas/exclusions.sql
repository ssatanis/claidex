CREATE TABLE IF NOT EXISTS exclusions (
    exclusion_id    TEXT PRIMARY KEY,
    source          TEXT DEFAULT 'LEIE',
    npi             TEXT,
    last_name       TEXT,
    first_name      TEXT,
    business_name   TEXT,
    display_name    TEXT,
    excl_type       TEXT,
    excl_type_label TEXT,
    excldate        DATE,
    reindate        DATE,
    state           CHAR(2),
    reinstated      BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_excl_npi        ON exclusions (npi);
CREATE INDEX IF NOT EXISTS idx_excl_excldate   ON exclusions (excldate);
CREATE INDEX IF NOT EXISTS idx_excl_reinstated ON exclusions (reinstated);
CREATE INDEX IF NOT EXISTS idx_excl_name_fts
    ON exclusions USING gin(to_tsvector('english', coalesce(display_name, '')));
