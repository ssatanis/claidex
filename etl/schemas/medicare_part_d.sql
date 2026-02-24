-- Medicare Part D Prescribers by Provider summary data.
-- Keyed by NPI + year.
-- Source: CMS Medicare Part D Prescribers - by Provider
-- Years: 2019-2022

CREATE TABLE IF NOT EXISTS medicare_part_d (
    npi              TEXT        NOT NULL,
    year             INTEGER     NOT NULL,
    last_org_name    TEXT,
    state            TEXT,
    provider_type    TEXT,
    total_claims     NUMERIC,
    total_drug_cost  NUMERIC,
    total_benes      NUMERIC,
    opioid_claims    NUMERIC,
    opioid_cost      NUMERIC,

    PRIMARY KEY (npi, year)
);

CREATE INDEX IF NOT EXISTS idx_medicare_part_d_state ON medicare_part_d (state);
CREATE INDEX IF NOT EXISTS idx_medicare_part_d_year  ON medicare_part_d (year);
