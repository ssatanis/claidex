# HCRIS Cost Report → Logical Field Mapping

This document records the mapping from actual column names in the HCRIS hospital and SNF cost report CSVs to the logical fields used in `hcris_by_npi_year.parquet` and the API.

## Hospital (CostReport_20XX_Final.csv)

| Logical field | HCRIS column name (exact) | Notes |
|---------------|---------------------------|--------|
| ccn | `Provider CCN` | Zero-pad to 6 digits |
| fy_end_dt | `Fiscal Year End Date` | Extract year for `year` |
| net_patient_revenue | `Net Patient Revenue` | After contractual allowances |
| total_operating_costs | `Total Costs` | Total operating expenses |
| tot_pat_rev (reference) | `Total Patient Revenue` | Gross; we use Net Patient Revenue |
| medicare_days | `Total Days Title XVIII` | Title XVIII = Medicare |
| medicaid_days | `Total Days Title XIX` | Title XIX = Medicaid |
| total_patient_days | `Total Days (V + XVIII + XIX + Unknown)` | All payer days |
| total_beds | `Number of Beds` | Certified beds |

**Derived:**
- `operating_margin_pct = 100 * (net_patient_revenue - total_operating_costs) / NULLIF(total_operating_costs, 0)`
- `medicare_payer_mix_pct = 100 * medicare_days / NULLIF(total_patient_days, 0)`
- `medicaid_payer_mix_pct = 100 * medicaid_days / NULLIF(total_patient_days, 0)`
- `revenue_per_patient_day = net_patient_revenue / NULLIF(total_patient_days, 0)`

## SNF (CostReportsnf_Final_XX.csv)

| Logical field | HCRIS column name (exact) | Notes |
|---------------|---------------------------|--------|
| ccn | `Provider CCN` | Zero-pad to 6 digits |
| fy_end_dt | `Fiscal Year End Date` | Extract year for `year` |
| net_patient_revenue | `Net Patient Revenue` | After contractual allowances |
| total_operating_costs | `Total Costs` | Total operating expenses |
| medicare_days | `Total Days Title XVIII` | Title XVIII = Medicare |
| medicaid_days | `Total Days Title XIX` | Title XIX = Medicaid |
| total_patient_days | `Total Days Total` | All payer days (SNF uses "Total Days Total" vs hospital "Total Days (V + XVIII + XIX + Unknown)") |
| total_beds | `Number of Beds` | Certified beds |

Derived metrics use the same formulas as hospital.

## CCN ↔ NPI linkage

- **POS files**: `data/raw/pos/pos2015.csv` (and pos2016–2018) provide `prvdr_num` (CCN), `fac_name`, `city_name`, `state_cd`, `prvdr_ctgry_cd` (facility type). **The legacy POS CSV does not contain NPI.**
- **Crosswalk**: To link CCN → NPI, use an external CCN–NPI crosswalk. Options:
  - **NBER NPI–Medicare CCN Crosswalk**: https://www.nber.org/research/data/national-provider-identifier-npi-medicare-ccn-crosswalk (CSV/Stata/SAS). Place a CSV with columns `ccn` and `npi` (or equivalent) at `data/raw/pos/ccn_npi_crosswalk.csv`.
  - **CMS / Care Compare**: Some CMS facility files include both CCN and NPI; if you have such a file, normalize it to columns `ccn`, `npi` and point the ingest at it.
- If no crosswalk is provided, the ingest still produces CCN-year rows with `npi = null` and `link_type = 'no_npi'` so that facility-level financials are available; the API will not return them for NPI lookup until a crosswalk is supplied.

## Standardization rules (applied in ingest)

- **Year**: `YEAR(fy_end_dt)` when present; otherwise fallback to an explicit year column if available.
- **Missing / invalid**: Replace negative or obviously invalid numeric values with `NULL`. Treat missing days or beds as `NULL`, not zero, to avoid infinite ratios.
- **CCN**: Normalize to zero-padded 6-digit string in both HCRIS and POS/crosswalk for joins.
