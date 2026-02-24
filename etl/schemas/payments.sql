-- Medicaid provider-year payment totals
CREATE TABLE IF NOT EXISTS payments_medicaid (
    npi                  TEXT NOT NULL,
    year                 SMALLINT,
    payments             NUMERIC(18,2),
    claims               NUMERIC(18,0),
    beneficiaries        NUMERIC(18,0),
    PRIMARY KEY (npi, year)
);

CREATE INDEX IF NOT EXISTS idx_pay_medicaid_npi  ON payments_medicaid (npi);
CREATE INDEX IF NOT EXISTS idx_pay_medicaid_year ON payments_medicaid (year);

-- Medicare provider-year payment totals
CREATE TABLE IF NOT EXISTS payments_medicare (
    npi                  TEXT NOT NULL,
    year                 SMALLINT,
    last_org_name        TEXT,
    first_name           TEXT,
    city                 TEXT,
    state                TEXT,
    zip                  TEXT,
    provider_type        TEXT,
    entity_code          CHAR(1),
    medicare_allowed     NUMERIC(18,2),
    medicare_paid        NUMERIC(18,2),
    medicare_standardized NUMERIC(18,2),
    total_services       NUMERIC(18,0),
    total_beneficiaries  NUMERIC(18,0),
    PRIMARY KEY (npi, year)
);

CREATE INDEX IF NOT EXISTS idx_pay_medicare_npi  ON payments_medicare (npi);
CREATE INDEX IF NOT EXISTS idx_pay_medicare_year ON payments_medicare (year);
