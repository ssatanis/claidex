CREATE TABLE IF NOT EXISTS fec_contributions (
    id                   BIGSERIAL PRIMARY KEY,
    contributor_name     TEXT,
    normalized_name      TEXT,
    normalized_last_name TEXT,
    first_name_initial   TEXT,
    employer             TEXT,
    normalized_employer  TEXT,
    occupation           TEXT,
    city                 TEXT,
    state                CHAR(2),
    amount               NUMERIC,
    committee_id         TEXT,
    transaction_date     DATE,
    cycle                SMALLINT DEFAULT 2024
);

-- Index-backed candidate lookup: last name + state (primary individual match path)
CREATE INDEX IF NOT EXISTS idx_fec_contrib_last_state
    ON fec_contributions (normalized_last_name, state);

-- Employer token scan (text_pattern_ops enables LIKE 'TOKEN%' prefix matching)
CREATE INDEX IF NOT EXISTS idx_fec_contrib_employer
    ON fec_contributions (normalized_employer text_pattern_ops);

-- State filter used in employer and sector intensity queries
CREATE INDEX IF NOT EXISTS idx_fec_contrib_state
    ON fec_contributions (state);

-- Occupation filter used in sector intensity denominator query
CREATE INDEX IF NOT EXISTS idx_fec_contrib_occupation
    ON fec_contributions (occupation text_pattern_ops);

-- Committee join
CREATE INDEX IF NOT EXISTS idx_fec_contrib_cmte
    ON fec_contributions (committee_id);
