-- Providers (NPI) table; adjust types to match ETL output
CREATE TABLE IF NOT EXISTS providers (
    npi BIGINT PRIMARY KEY,
    full_name TEXT,
    type TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    zip TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_providers_full_name ON providers USING gin(to_tsvector('english', full_name));
