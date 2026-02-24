"""
Unit tests for Claidex Risk Score statistical helpers.

Run:
    pytest etl/compute/test_risk_scores.py -v
"""

from __future__ import annotations

import math

import numpy as np
import polars as pl
import pytest

from etl.compute.risk_scores import (
    MAD_SCALE,
    WEIGHTS,
    compute_composite,
    compute_program_concentration,
    generate_flags,
    map_to_score,
    risk_label,
    robust_zscore,
)


# ---------------------------------------------------------------------------
# robust_zscore
# ---------------------------------------------------------------------------

class TestRobustZscore:
    def test_zero_when_at_median(self):
        values = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
        z = robust_zscore(values, target=3.0)
        assert z == pytest.approx(0.0, abs=1e-6)

    def test_positive_above_median(self):
        values = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
        z = robust_zscore(values, target=5.0)
        assert z > 0

    def test_negative_below_median(self):
        values = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
        z = robust_zscore(values, target=1.0)
        assert z < 0

    def test_capped_at_plus_5(self):
        values = np.array([1.0, 2.0, 3.0])
        z = robust_zscore(values, target=1_000_000.0)
        assert z == pytest.approx(5.0)

    def test_capped_at_minus_5(self):
        values = np.array([10.0, 20.0, 30.0])
        z = robust_zscore(values, target=-1_000_000.0)
        assert z == pytest.approx(-5.0)

    def test_empty_values_returns_zero(self):
        z = robust_zscore(np.array([]), target=5.0)
        assert z == pytest.approx(0.0)

    def test_mad_formula(self):
        """Manual verification: values=[1,3,5,7,9], target=9."""
        values = np.array([1.0, 3.0, 5.0, 7.0, 9.0])
        median = 5.0
        mad = float(np.median(np.abs(values - median)))  # = 2.0
        expected_z = (9.0 - median) / (MAD_SCALE * mad)
        expected_z = max(-5.0, min(5.0, expected_z))
        z = robust_zscore(values, target=9.0)
        assert z == pytest.approx(expected_z, abs=1e-6)

    def test_constant_peers_all_same(self):
        """When all peers have the same value, any deviation is extreme."""
        values = np.array([5.0, 5.0, 5.0, 5.0])
        z_above = robust_zscore(values, target=6.0)
        z_at = robust_zscore(values, target=5.0)
        assert z_above == pytest.approx(5.0)
        assert z_at == pytest.approx(0.0)


# ---------------------------------------------------------------------------
# map_to_score (logistic)
# ---------------------------------------------------------------------------

class TestMapToScore:
    def test_zero_maps_to_50(self):
        """Logistic at z=0 → 50.0."""
        assert map_to_score(0.0) == pytest.approx(50.0, abs=0.01)

    def test_large_positive_approaches_100(self):
        assert map_to_score(20.0) > 99.9

    def test_large_negative_approaches_0(self):
        assert map_to_score(-20.0) < 0.1

    def test_monotone_increasing(self):
        z_values = [-5, -2, -1, 0, 1, 2, 5]
        scores = [map_to_score(z) for z in z_values]
        for i in range(len(scores) - 1):
            assert scores[i] < scores[i + 1]

    def test_symmetry(self):
        """map_to_score(z) + map_to_score(-z) ≈ 100."""
        for z in (0.5, 1.0, 2.0, 3.0):
            assert map_to_score(z) + map_to_score(-z) == pytest.approx(100.0, abs=1e-6)


# ---------------------------------------------------------------------------
# risk_label
# ---------------------------------------------------------------------------

class TestRiskLabel:
    @pytest.mark.parametrize("score,expected", [
        (0.0,  "Low"),
        (15.0, "Low"),
        (29.9, "Low"),
        (30.0, "Moderate"),
        (45.0, "Moderate"),
        (59.9, "Moderate"),
        (60.0, "Elevated"),
        (70.0, "Elevated"),
        (79.9, "Elevated"),
        (80.0, "High"),
        (95.0, "High"),
        (100.0, "High"),
    ])
    def test_labels(self, score, expected):
        assert risk_label(score) == expected


# ---------------------------------------------------------------------------
# compute_program_concentration
# ---------------------------------------------------------------------------

class TestComputeProgramConcentration:
    def _make_payments(self, rows) -> pl.DataFrame:
        return pl.DataFrame(rows, schema={
            "npi": pl.Utf8, "year": pl.Int32, "program": pl.Utf8,
            "payments": pl.Float64, "claims": pl.Float64,
            "beneficiaries": pl.Float64, "taxonomy": pl.Utf8, "state": pl.Utf8,
        })

    def test_single_program_gives_100(self):
        df = self._make_payments([
            {"npi": "A", "year": 2023, "program": "Medicare", "payments": 100.0,
             "claims": 10.0, "beneficiaries": 5.0, "taxonomy": "T", "state": "TX"},
        ])
        result = compute_program_concentration(df)
        row = result.filter(pl.col("npi") == "A").row(0, named=True)
        assert row["program_concentration_score"] == pytest.approx(100.0)

    def test_equal_two_programs_gives_zero(self):
        df = self._make_payments([
            {"npi": "B", "year": 2023, "program": "Medicare",  "payments": 50.0,
             "claims": 5.0, "beneficiaries": 3.0, "taxonomy": "T", "state": "TX"},
            {"npi": "B", "year": 2023, "program": "Medicaid",  "payments": 50.0,
             "claims": 5.0, "beneficiaries": 3.0, "taxonomy": "T", "state": "TX"},
        ])
        result = compute_program_concentration(df)
        row = result.filter(pl.col("npi") == "B").row(0, named=True)
        assert row["program_concentration_score"] == pytest.approx(0.0)

    def test_75pct_gives_50(self):
        """75% in one program → 200*(0.75-0.5)=50."""
        df = self._make_payments([
            {"npi": "C", "year": 2023, "program": "Medicare",  "payments": 75.0,
             "claims": 10.0, "beneficiaries": 5.0, "taxonomy": "T", "state": "TX"},
            {"npi": "C", "year": 2023, "program": "Medicaid",  "payments": 25.0,
             "claims": 5.0,  "beneficiaries": 2.0, "taxonomy": "T", "state": "TX"},
        ])
        result = compute_program_concentration(df)
        row = result.filter(pl.col("npi") == "C").row(0, named=True)
        assert row["program_concentration_score"] == pytest.approx(50.0, abs=0.1)

    def test_60pct_gives_20(self):
        """60% → 200*(0.60-0.5)=20."""
        df = self._make_payments([
            {"npi": "D", "year": 2023, "program": "Medicare", "payments": 60.0,
             "claims": 10.0, "beneficiaries": 5.0, "taxonomy": "T", "state": "TX"},
            {"npi": "D", "year": 2023, "program": "Medicaid", "payments": 40.0,
             "claims": 5.0,  "beneficiaries": 2.0, "taxonomy": "T", "state": "TX"},
        ])
        result = compute_program_concentration(df)
        row = result.filter(pl.col("npi") == "D").row(0, named=True)
        assert row["program_concentration_score"] == pytest.approx(20.0, abs=0.1)

    def test_empty_df_returns_empty(self):
        df = self._make_payments([])
        result = compute_program_concentration(df)
        assert result.is_empty()


# ---------------------------------------------------------------------------
# compute_composite + risk_label via compute_composite
# ---------------------------------------------------------------------------

class TestComputeComposite:
    def _make_scores(self, **kwargs) -> pl.DataFrame:
        defaults = {
            "npi": "1234567890",
            "billing_outlier_score": 0.0,
            "billing_outlier_percentile": 50.0,
            "ownership_chain_risk": 0.0,
            "payment_trajectory_score": 0.0,
            "payment_trajectory_zscore": 0.0,
            "exclusion_proximity_score": 0.0,
            "program_concentration_score": 0.0,
            "peer_taxonomy": "207R00000X",
            "peer_state": "TX",
            "peer_count": 200,
            "data_window_years": [2020, 2021, 2022, 2023],
            "chain_excluded_count": 0,
            "top_program": "Medicare",
        }
        defaults.update(kwargs)
        return pl.DataFrame([defaults])

    def test_all_zero_components(self):
        df = self._make_scores()
        result = compute_composite(df)
        row = result.row(0, named=True)
        assert row["r_raw"] == pytest.approx(0.0)
        assert row["risk_label"] == "Low"

    def test_all_max_components(self):
        df = self._make_scores(
            billing_outlier_score=100.0,
            ownership_chain_risk=100.0,
            payment_trajectory_score=100.0,
            exclusion_proximity_score=100.0,
            program_concentration_score=100.0,
        )
        result = compute_composite(df)
        row = result.row(0, named=True)
        assert row["r_raw"] == pytest.approx(100.0)

    def test_weights_sum_to_one(self):
        assert sum(WEIGHTS.values()) == pytest.approx(1.0, abs=1e-9)

    def test_r_raw_formula(self):
        b, o, t, e, p = 80.0, 60.0, 40.0, 20.0, 50.0
        expected_raw = (
            b * WEIGHTS["billing_outlier_score"] +
            o * WEIGHTS["ownership_chain_risk"] +
            t * WEIGHTS["payment_trajectory_score"] +
            e * WEIGHTS["exclusion_proximity_score"] +
            p * WEIGHTS["program_concentration_score"]
        )
        df = self._make_scores(
            billing_outlier_score=b,
            ownership_chain_risk=o,
            payment_trajectory_score=t,
            exclusion_proximity_score=e,
            program_concentration_score=p,
        )
        result = compute_composite(df)
        row = result.row(0, named=True)
        assert row["r_raw"] == pytest.approx(expected_raw, abs=0.01)

    def test_global_calibration_with_two_providers(self):
        """Higher r_raw should yield higher risk_score after calibration."""
        df = pl.DataFrame([
            {
                "npi": "1111111111",
                "billing_outlier_score": 90.0,
                "ownership_chain_risk": 80.0,
                "payment_trajectory_score": 70.0,
                "exclusion_proximity_score": 100.0,
                "program_concentration_score": 60.0,
                "billing_outlier_percentile": 97.0,
                "payment_trajectory_zscore": 2.1,
                "peer_taxonomy": "T", "peer_state": "TX", "peer_count": 100,
                "data_window_years": [2021, 2022, 2023],
                "chain_excluded_count": 2, "top_program": "Medicare",
            },
            {
                "npi": "2222222222",
                "billing_outlier_score": 10.0,
                "ownership_chain_risk": 0.0,
                "payment_trajectory_score": 5.0,
                "exclusion_proximity_score": 0.0,
                "program_concentration_score": 0.0,
                "billing_outlier_percentile": 20.0,
                "payment_trajectory_zscore": 0.1,
                "peer_taxonomy": "T", "peer_state": "TX", "peer_count": 100,
                "data_window_years": [2021, 2022, 2023],
                "chain_excluded_count": 0, "top_program": "Medicaid",
            },
        ])
        result = compute_composite(df)
        high_row = result.filter(pl.col("npi") == "1111111111").row(0, named=True)
        low_row  = result.filter(pl.col("npi") == "2222222222").row(0, named=True)
        assert high_row["risk_score"] > low_row["risk_score"]
        assert high_row["risk_label"] in ("High", "Elevated")
        assert low_row["risk_label"] in ("Low", "Moderate")


# ---------------------------------------------------------------------------
# generate_flags
# ---------------------------------------------------------------------------

class TestGenerateFlags:
    def _flags(self, **kwargs):
        defaults = dict(
            billing_outlier_score=0.0,
            billing_outlier_percentile=0.0,
            ownership_chain_risk=0.0,
            payment_trajectory_score=0.0,
            exclusion_proximity_score=0.0,
            program_concentration_score=0.0,
            chain_excluded_count=0,
            top_program=None,
        )
        defaults.update(kwargs)
        return generate_flags(**defaults)

    def test_no_flags_for_clean_provider(self):
        assert self._flags() == []

    def test_billing_percentile_flag(self):
        flags = self._flags(billing_outlier_percentile=95.0)
        assert any("95th percentile" in f for f in flags)

    def test_billing_percentile_not_triggered_below_95(self):
        flags = self._flags(billing_outlier_percentile=94.9)
        assert not any("percentile" in f for f in flags)

    def test_rapid_growth_and_billing_flag(self):
        flags = self._flags(billing_outlier_score=80.0, payment_trajectory_score=60.0)
        assert any("Rapid growth" in f for f in flags)

    def test_rapid_growth_requires_both_thresholds(self):
        flags_only_billing = self._flags(billing_outlier_score=80.0, payment_trajectory_score=59.9)
        flags_only_traj = self._flags(billing_outlier_score=79.9, payment_trajectory_score=60.0)
        assert not any("Rapid growth" in f for f in flags_only_billing)
        assert not any("Rapid growth" in f for f in flags_only_traj)

    def test_ownership_chain_flag(self):
        flags = self._flags(ownership_chain_risk=50.0, chain_excluded_count=3)
        assert any("excluded" in f.lower() and "3" in f for f in flags)

    def test_ownership_chain_singular(self):
        flags = self._flags(ownership_chain_risk=50.0, chain_excluded_count=1)
        assert any("1 excluded provider" in f for f in flags)

    def test_program_concentration_flag(self):
        flags = self._flags(program_concentration_score=60.0, top_program="Medicare")
        assert any("Medicare" in f for f in flags)

    def test_exclusion_proximity_flag_at_80(self):
        flags = self._flags(exclusion_proximity_score=80.0)
        assert any("exclusion" in f.lower() for f in flags)

    def test_exclusion_proximity_not_triggered_at_79(self):
        flags = self._flags(exclusion_proximity_score=79.9)
        assert not any("exclusion" in f.lower() for f in flags)

    def test_multiple_flags_simultaneously(self):
        flags = self._flags(
            billing_outlier_percentile=97.0,
            billing_outlier_score=85.0,
            payment_trajectory_score=65.0,
            ownership_chain_risk=55.0,
            chain_excluded_count=2,
            exclusion_proximity_score=80.0,
            program_concentration_score=70.0,
            top_program="Medicaid",
        )
        assert len(flags) == 5
