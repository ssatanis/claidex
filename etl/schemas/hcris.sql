-- HCRIS facility-level financials by NPI and year (hospitals and SNFs).
-- Source: HCRIS cost reports + POS (+ optional CCN→NPI crosswalk).
CREATE TABLE IF NOT EXISTS hcris_financials (
  npi text,
  ccn text,
  year int,
  facility_name text,
  state text,
  facility_type text,
  net_patient_revenue numeric,
  total_operating_costs numeric,
  operating_margin_pct numeric,
  medicare_payer_mix_pct numeric,
  medicaid_payer_mix_pct numeric,
  total_beds int,
  total_patient_days int,
  revenue_per_patient_day numeric,
  link_type text
);

CREATE INDEX IF NOT EXISTS idx_hcris_npi ON hcris_financials (npi);
CREATE INDEX IF NOT EXISTS idx_hcris_npi_year ON hcris_financials (npi, year);
CREATE INDEX IF NOT EXISTS idx_hcris_ccn_year ON hcris_financials (ccn, year);
CREATE INDEX IF NOT EXISTS idx_hcris_type_state_year ON hcris_financials (facility_type, state, year);
