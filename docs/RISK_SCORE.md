# Claidex Risk Score — Methodology

**Version:** 1.0  
**Last updated:** 2026-02-22  
**Endpoint:** `GET /v1/providers/:npi/risk`

---

## Overview

The Claidex Risk Score is a composite, statistically grounded, network-aware anomaly score that quantifies the likelihood that a healthcare provider's billing patterns, payment trajectory, ownership relationships, exclusion history, and payer concentration deviate from what is expected for similar providers. The score ranges from **0 to 100** and is globally calibrated so that a score of 74 means the provider is at the 74th percentile of computed risk across all providers with at least one year of payment data.

The score is designed to be:

- **Statistically defensible** — uses robust estimators (median, MAD) instead of mean/variance to resist distortion by extreme outliers.
- **Network-aware** — incorporates ownership chain topology from the Neo4j graph to surface corporate-structure risk.
- **Explainable** — every numeric score is accompanied by a plain-English `flags` array that describes the specific reasons for elevated risk.

---

## Data Sources

| Source | Tables / Nodes | Used for |
|--------|---------------|----------|
| Postgres | `payments_medicaid`, `payments_medicare`, `medicare_part_d` | Billing metrics, trajectory, concentration |
| Postgres | `providers` | Taxonomy, state, peer-group construction |
| Postgres | `exclusions` | Direct LEIE exclusion status |
| Neo4j | `CorporateEntity`, `OWNS`, `CONTROLLED_BY` | Ownership chain traversal |
| Neo4j | `Provider`, `EXCLUDED_BY` | Chain-level exclusion proximity |

A SQL view `payments_combined_v` (defined in `etl/schemas/risk_scores.sql`) unions all three payment tables and joins `providers` for taxonomy and state.

---

## Peer Group Definition

For any provider *i* in year *t*, the **primary peer group** is defined as all providers sharing:

- The first 10 characters of their primary taxonomy code (`taxonomy_1` from NPPES).
- The same US state.
- At least **100 claims** in that year (to avoid degenerate denominators).

If the resulting peer group has fewer than **50 members**, the peer group falls back to taxonomy-only (state requirement is dropped).  This two-tier fallback ensures robust statistics for rural or specialist providers who may have few same-state peers.

---

## Component 1 — Billing Outlier Score (weight 0.30)

### Metrics

For each provider-year, three billing intensity metrics are computed:

| Symbol | Formula | Interpretation |
|--------|---------|----------------|
| m₁ | `payments / max(claims, 1)` | Average payment per claim |
| m₂ | `claims / max(beneficiaries, 1)` | Claims per unique beneficiary |
| m₃ | `payments` | Total payment volume |

### Log transform

All metrics are log-transformed before statistical analysis to reduce right-skew:

```
x = log(m + ε),   ε = 1.0
```

### Robust z-score

For each metric *x* within a peer group, the robust z-score for provider *i* is:

```
z = (x_i − x̃) / (1.4826 · MAD)
```

where:
- *x̃* is the **median** of *x* across peers
- MAD is the **median absolute deviation**: `median(|x_j − x̃|)` across peers
- The constant **1.4826** makes MAD a consistent estimator of σ for normally distributed data
- The result is **capped to [−5, 5]** before further use

### Temporal aggregation

Payment data from the most-recent **5 years** is included. Recent years receive higher weight via exponential decay:

```
w_t = α^(T − t),   α = 0.7
```

where *T* is the most-recent year with data. Only **positive z-scores** (above-peer anomalies) contribute to risk — providers who bill *less* than peers do not receive a penalty.

### Mapping to [0, 100]

The weighted mean z-score *z̄* is mapped via the logistic function:

```
billing_outlier_score = 100 · σ(z̄ / 2) = 100 / (1 + e^(−z̄/2))
```

A provider exactly at their peer median receives a score of 50; a provider with *z̄* = 0 maps to exactly 50. In practice, the median of positive-only z-scores shifts the distribution rightward.

### Billing outlier percentile

`billing_outlier_percentile` is the empirical CDF rank (PERCENT_RANK) of the provider's m₁ (payments per claim) within their primary peer group for the most-recent year, expressed as a percentage (0–100).

---

## Component 2 — Ownership Chain Risk (weight 0.25)

### Graph traversal

Using Neo4j, the algorithm:

1. Finds the `CorporateEntity` node(s) whose `name` contains the provider's display name and whose `entityType` is `'SNF'` (the current ownership data comes from CMS SNF ownership filings).
2. Traverses `OWNS` edges **up to 5 hops** from that entity to discover all ancestor corporate owners.
3. Expands back downward to collect all sibling SNF entities under the same ownership group.
4. Looks for any `Provider` nodes linked to those entities that have an `EXCLUDED_BY` relationship to an `Exclusion` node.

### Score formula

```
ownership_chain_risk = min(100, 100 × chain_excluded_count / max(chain_provider_count, 1))
```

The specification calls for distance-weighted discounting (distance 1 → full weight, distance ≥ 2 → half weight). The current implementation uses a simplified single-query approach where all excluded providers in the traversal graph are counted at full weight. Distance-weighted expansion is available as a future enhancement.

---

## Component 3 — Payment Trajectory Score (weight 0.20)

### Year-over-year growth rates

For each NPI, annual total payments *P_t* are summed across all programs. The growth rate in year *t* is:

```
g_t = (P_t − P_{t−1}) / max(P_{t−1}, 1)
```

### Peer distribution

For each (taxonomy_10, state, year) combination, the distribution of growth rates *g_t* across peers is collected. A robust z-score for provider *i*'s growth rate is computed with the same median/MAD formula as Component 1.

### Aggregation

Positive z-scores are aggregated with the same α=0.7 temporal decay used in Component 1. The final z-score is mapped to [0, 100] via the logistic function.

---

## Component 4 — Exclusion Proximity Score (weight 0.15)

This component uses a deterministic rule table rather than a continuous score:

| Condition | Score |
|-----------|-------|
| Provider has an active LEIE exclusion (`reinstated = false`) | 100 |
| A directly-owning corporate entity has an `EXCLUDED_BY` relationship | 80 |
| Any provider in the same ownership chain has an `EXCLUDED_BY` relationship | 50 |
| None of the above | 0 |

"Active" exclusions are those where `reinstated = false` in the `exclusions` table.

---

## Component 5 — Program Concentration Score (weight 0.10)

### Share computation

Total payments over the most-recent **3 years** are summed by program. The share of the largest single program is:

```
s_max = max_k(P_k) / sum_k(P_k)
```

### Score formula

```
program_concentration_score = 0                        if s_max ≤ 0.5
                             = min(100, 200 · (s_max − 0.5))   if s_max > 0.5
```

This produces: 100% in one program → 100, 75% → 50, 60% → 20, exactly 50% → 0.

---

## Composite Score and Global Calibration

### Weighted sum

```
R_raw = 0.30·S_b + 0.25·S_o + 0.20·S_t + 0.15·S_e + 0.10·S_p
```

where S_b, S_o, S_t, S_e, S_p are the five component scores (all in [0, 100]).

### Global percentile calibration

After computing *R_raw* for all providers in the batch, the final `risk_score` is the **empirical percentile rank** of each provider's *R_raw* across the full population, scaled to [0, 100]:

```
risk_score = PERCENT_RANK(R_raw) × 100
```

This ensures the score distribution is well-calibrated: 50% of providers have a score below 50, regardless of the absolute level of fraud in the dataset.

### Risk labels

| Score range | Label |
|-------------|-------|
| 0 – 29.9 | Low |
| 30 – 59.9 | Moderate |
| 60 – 79.9 | Elevated |
| 80 – 100 | High |

---

## Flags

Flags are generated independently of the numeric scores using fixed thresholds:

| Condition | Flag text |
|-----------|-----------|
| `billing_outlier_percentile ≥ 95` | "Billing > 95th percentile vs. state/taxonomy peers (payments per claim)." |
| `billing_outlier_score ≥ 80` AND `payment_trajectory_score ≥ 60` | "Rapid growth and high billing intensity vs. peers." |
| `ownership_chain_risk ≥ 50` | "Ownership chain includes N excluded provider(s)." |
| `program_concentration_score ≥ 60` | "Highly concentrated in a single payer program (ProgramName)." |
| `exclusion_proximity_score ≥ 80` | "Direct or owner-level exclusion on record." |

Multiple flags may be present simultaneously.

---

## Persistence and Refresh

Scores are stored in the `provider_risk_scores` Postgres table (defined in `etl/schemas/risk_scores.sql`). The table is designed for direct API reads with indexes on `risk_score DESC` and `risk_label`.

**Batch recompute:**

```bash
# Full batch (all providers)
python -m etl.compute.risk_scores

# Single-NPI smoke test
python -m etl.compute.risk_scores --npi 1316250707 1942248901

# Dry run (compute without writing)
python -m etl.compute.risk_scores --dry-run
```

The recommended schedule is **weekly** (scores are not time-critical for daily operations) or after each ETL data load.

---

## API Response

```jsonc
// GET /v1/providers/1316250707/risk
{
  "data": {
    "npi": "1316250707",
    "risk_score": 74.2,
    "risk_label": "Elevated",
    "components": {
      "billing_outlier_score": 88.0,
      "billing_outlier_percentile": 97.0,
      "ownership_chain_risk": 65.0,
      "payment_trajectory_score": 58.0,
      "payment_trajectory_zscore": 1.4,
      "exclusion_proximity_score": 40.0,
      "program_concentration_score": 55.0
    },
    "peer_group": {
      "taxonomy": "207R00000X",
      "state": "TX",
      "peer_count": 1420
    },
    "flags": [
      "Billing > 95th percentile vs. state/taxonomy peers (payments per claim).",
      "Ownership chain includes 3 excluded providers.",
      "Highly concentrated in a single payer program (Medicare)."
    ],
    "meta": {
      "computed_at": "2026-02-22T17:00:00Z",
      "data_window_years": [2019, 2020, 2021, 2022, 2023]
    }
  },
  "meta": {
    "source": "claidex-v1",
    "query_time_ms": 4
  }
}
```

---

## Testing

### ETL unit tests (Python)

```bash
cd etl
pip install -e .
pytest compute/test_risk_scores.py -v
```

Tests cover:
- `robust_zscore()` — median/MAD formula, capping, empty inputs, constant peers
- `map_to_score()` — logistic symmetry, monotonicity, boundary values
- `risk_label()` — all four threshold segments
- `compute_program_concentration()` — single program (100), equal split (0), 75% (50)
- `compute_composite()` — weight formula, calibration ordering, label consistency
- `generate_flags()` — each threshold trigger, combined flags, no-flag case

### API integration tests (TypeScript)

```bash
cd api
npm test -- --testPathPattern=risk
```

Tests cover:
- 422 for invalid NPI formats
- 404 for unknown NPIs
- Full response shape validation when scores are present
- Risk label consistency with risk score
- Peer count sanity check (> 100 for high-volume NPIs)

---

## Limitations and Future Work

1. **Ownership graph coverage**: The current ownership data is limited to SNF (skilled nursing facility) CMS ownership filings. Providers without an SNF affiliation will always have `ownership_chain_risk = 0`. Expanding to additional CMS associate data sources would improve coverage.

2. **Distance-weighted ownership risk**: The spec calls for distance-1 nodes to count at full weight and distance ≥ 2 at half weight. The current implementation uses a simplified all-full-weight approach. A future version can emit per-hop distances from the Cypher query.

3. **Program labels in taxonomy fallback**: When the peer group falls back to taxonomy-only, the `peer_state` field in the response is set to the provider's state but the statistics are computed over all states. This is labeled in the response but could be made explicit.

4. **Inpatient facility data**: Medicare Inpatient data is CCN-keyed (not NPI) and is currently excluded from billing metrics. Joining via provider name or address would allow inclusion.

5. **Calibration refresh**: The global percentile rank is computed within each batch run. Adding a new high-risk provider to the dataset shifts all other providers' scores slightly. A stable reference population (e.g., fixed to providers present in 2023) could be used for more stable longitudinal comparisons.
