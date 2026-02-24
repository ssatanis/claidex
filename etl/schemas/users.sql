CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    role TEXT, -- e.g., admin, analyst, viewer
    position TEXT, -- e.g., "Medicaid Integrity Analyst"
    organization_id UUID,
    timezone TEXT,
    locale TEXT,
    preferences JSONB, -- e.g. default_landing, table_density, reduced_motion
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
