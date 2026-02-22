-- LEIE exclusions
CREATE TABLE IF NOT EXISTS exclusions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT,
    npi BIGINT,
    excluded_at DATE,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exclusions_npi ON exclusions (npi);
CREATE INDEX IF NOT EXISTS idx_exclusions_name ON exclusions USING gin(to_tsvector('english', name));
