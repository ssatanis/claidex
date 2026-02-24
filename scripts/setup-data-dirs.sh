#!/usr/bin/env bash
# Create canonical data/ layout. Run from repo root. data/ is gitignored.

set -e
ROOT="${1:-.}"
DATA="${ROOT}/data"

mkdir -p "$DATA/raw"/{nppes,medicaid-puf,medicare-physician,medicare-facility,snf-ownership,leie,sam,ppef,pos,hcris,open-payments,form990,fec,pesp,openownership,medicare-enrollment,md-ppas,nursing-home-affiliated}
mkdir -p "$DATA/raw/medicare-facility"/{inpatient,outpatient,snf,hha,hospice,dme}
mkdir -p "$DATA/raw/leie/monthly-supplements"
mkdir -p "$DATA/processed"/{providers,payments,ownership,exclusions,opencorporates}
mkdir -p "$DATA/exports"

# Optional year/month placeholders (ingest scripts will use real YYYY/YYYY-MM)
mkdir -p "$DATA/raw/medicaid-puf/2024" "$DATA/raw/medicaid-puf/2023"
mkdir -p "$DATA/raw/medicare-physician/2023"
mkdir -p "$DATA/raw/nppes/2026-02" "$DATA/raw/leie/2026-02" "$DATA/raw/snf-ownership/2026-02"

echo "Created data layout under $DATA"
