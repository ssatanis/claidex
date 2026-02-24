-- Unified view of Medicaid, Medicare, and Medicare Part D payments for
-- benchmark and risk_scores. All parts must expose: npi, year, program,
-- payments, allowed (nullable), claims, beneficiaries, taxonomy, state.

CREATE OR REPLACE VIEW payments_combined_v AS
-- Medicaid (no taxonomy/state on table; join providers)
SELECT
  m.npi,
  m.year,
  'Medicaid'::text       AS program,
  m.payments             AS payments,
  NULL::numeric          AS allowed,
  m.claims,
  m.beneficiaries,
  p.taxonomy_1           AS taxonomy,
  p.state
FROM payments_medicaid m
LEFT JOIN providers p ON p.npi = m.npi
UNION ALL
-- Medicare
SELECT
  npi,
  year,
  'Medicare'::text       AS program,
  medicare_paid          AS payments,
  medicare_allowed       AS allowed,
  total_services         AS claims,
  total_beneficiaries    AS beneficiaries,
  provider_type          AS taxonomy,
  state
FROM payments_medicare
UNION ALL
-- Medicare Part D (table: medicare_part_d)
SELECT
  npi,
  year,
  'MedicarePartD'::text  AS program,
  total_drug_cost        AS payments,
  NULL::numeric          AS allowed,
  total_claims          AS claims,
  total_benes            AS beneficiaries,
  provider_type          AS taxonomy,
  state
FROM medicare_part_d;
