-- =============================================================================
-- Claidex Risk Score schema
-- =============================================================================
--
-- 1. payments_combined_v  — VIEW unifying all three payment programs with
--    provider taxonomy/state for peer-group construction.
--
-- 2. provider_risk_scores — precomputed risk scores table, populated by the
--    batch ETL job (etl/compute/risk_scores.py) and served directly by the API.
--
-- Idempotent — safe to re-run.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. Unified payments view
--    Combines payments_medicaid, payments_medicare, medicare_part_d and
--    enriches each row with taxonomy_1 / state from the providers table.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW payments_combined_v AS

-- Medicaid
SELECT
    m.npi,
    m.year::INTEGER                                          AS year,
    'Medicaid'::TEXT                                         AS program,
    m.payments::NUMERIC                                      AS payments,
    NULL::NUMERIC                                            AS allowed,
    m.claims::NUMERIC                                        AS claims,
    m.beneficiaries::NUMERIC                                 AS beneficiaries,
    COALESCE(pr.taxonomy_1, 'Unknown')                       AS taxonomy,
    COALESCE(pr.state,      'Unknown')                       AS state
FROM payments_medicaid m
LEFT JOIN providers pr ON pr.npi = m.npi

UNION ALL

-- Medicare fee-for-service
SELECT
    mw.npi,
    mw.year::INTEGER                                         AS year,
    'Medicare'::TEXT                                         AS program,
    mw.medicare_paid::NUMERIC                                AS payments,
    mw.medicare_allowed::NUMERIC                             AS allowed,
    mw.total_services::NUMERIC                               AS claims,
    mw.total_beneficiaries::NUMERIC                          AS beneficiaries,
    COALESCE(pr.taxonomy_1, mw.provider_type, 'Unknown')     AS taxonomy,
    COALESCE(pr.state,      mw.state,         'Unknown')     AS state
FROM payments_medicare mw
LEFT JOIN providers pr ON pr.npi = mw.npi

UNION ALL

-- Medicare Part D (prescriptions)
SELECT
    pd.npi,
    pd.year::INTEGER                                         AS year,
    'MedicarePartD'::TEXT                                    AS program,
    pd.total_drug_cost::NUMERIC                              AS payments,
    NULL::NUMERIC                                            AS allowed,
    pd.total_claims::NUMERIC                                 AS claims,
    pd.total_benes::NUMERIC                                  AS beneficiaries,
    COALESCE(pr.taxonomy_1, pd.provider_type, 'Unknown')     AS taxonomy,
    COALESCE(pr.state,      pd.state,         'Unknown')     AS state
FROM medicare_part_d pd
LEFT JOIN providers pr ON pr.npi = pd.npi;


-- ---------------------------------------------------------------------------
-- 2. Risk scores output table
--    Populated by etl/compute/risk_scores.py (daily/weekly batch).
--    The API reads directly from this table for low-latency responses.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS provider_risk_scores (
    npi                         TEXT        PRIMARY KEY,

    -- Composite output
    risk_score                  NUMERIC(6,2),           -- 0–100, globally calibrated
    risk_label                  TEXT,                   -- Low / Moderate / Elevated / High
    r_raw                       NUMERIC(8,4),           -- pre-calibration weighted sum

    -- Component scores (0–100 each)
    billing_outlier_score       NUMERIC(6,2),
    billing_outlier_percentile  NUMERIC(6,2),           -- PERCENT_RANK within peer group
    ownership_chain_risk        NUMERIC(6,2),
    payment_trajectory_score    NUMERIC(6,2),
    payment_trajectory_zscore   NUMERIC(8,4),
    exclusion_proximity_score   NUMERIC(6,2),
    program_concentration_score NUMERIC(6,2),

    -- Peer group metadata
    peer_taxonomy               TEXT,
    peer_state                  TEXT,
    peer_count                  INTEGER,

    -- Time window used
    data_window_years           INTEGER[],

    -- Flags and full components JSON (for API serialization)
    flags                       JSONB   DEFAULT '[]'::JSONB,
    components                  JSONB,

    updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

-- Support range scans by risk level
CREATE INDEX IF NOT EXISTS idx_risk_scores_score
    ON provider_risk_scores (risk_score DESC);

CREATE INDEX IF NOT EXISTS idx_risk_scores_label
    ON provider_risk_scores (risk_label);

CREATE INDEX IF NOT EXISTS idx_prs_npi
    ON provider_risk_scores (npi);

CREATE INDEX IF NOT EXISTS idx_risk_scores_billing
    ON provider_risk_scores (billing_outlier_score DESC);

CREATE INDEX IF NOT EXISTS idx_risk_scores_updated
    ON provider_risk_scores (updated_at DESC);
