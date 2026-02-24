-- Medicare Inpatient Prospective Payment System (IPPS) facility-level data.
-- Keyed by CMS Certification Number (CCN), NOT NPI.
-- Source: CMS Medicare Provider Utilization and Payment Data: Inpatient
-- Years: 2018-2023

CREATE TABLE IF NOT EXISTS medicare_inpatient (
    ccn                      TEXT        NOT NULL,
    facility_name            TEXT,
    city                     TEXT,
    state                    TEXT,
    zip                      TEXT,
    year                     INTEGER     NOT NULL,
    total_benes              NUMERIC,
    total_submitted_charges  NUMERIC,
    total_payments           NUMERIC,
    total_medicare_payments  NUMERIC,
    total_discharges         NUMERIC,
    total_covered_days       NUMERIC,

    PRIMARY KEY (ccn, year)
);

CREATE INDEX IF NOT EXISTS idx_medicare_inpatient_state ON medicare_inpatient (state);
CREATE INDEX IF NOT EXISTS idx_medicare_inpatient_year  ON medicare_inpatient (year);
