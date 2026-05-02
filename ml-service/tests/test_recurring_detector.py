"""Tests for recurring transaction detection pipeline.

Tests cover:
- Periodicity detection (weekly, fortnightly, monthly, quarterly, yearly)
- Amount analysis (fixed vs variable, trend detection)
- Recurring type classification (subscription, salary, rent, utility, insurance)
- Confidence scoring
- Anomaly detection
- Full pipeline orchestration with mock embedder
"""

from datetime import date, timedelta
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from src.models.recurring_detector import (
    RecurringDetector,
    TransactionEmbedder,
    analyze_amounts,
    check_anomaly,
    classify_recurring_type,
    cluster_transactions,
    compute_confidence,
    detect_periodicity,
)


# ---------------------------------------------------------------------------
# Periodicity detection tests
# ---------------------------------------------------------------------------


class TestDetectPeriodicity:
    def test_monthly(self):
        """Monthly transactions ~30 days apart."""
        dates = [date(2025, 1, 15) + timedelta(days=30 * i) for i in range(6)]
        result = detect_periodicity(dates)
        assert result is not None
        period, median, std = result
        assert period == "monthly"
        assert 28 <= median <= 32

    def test_fortnightly(self):
        """Fortnightly transactions ~14 days apart."""
        dates = [date(2025, 1, 1) + timedelta(days=14 * i) for i in range(8)]
        result = detect_periodicity(dates)
        assert result is not None
        period, _, _ = result
        assert period == "fortnightly"

    def test_weekly(self):
        """Weekly transactions ~7 days apart."""
        dates = [date(2025, 1, 6) + timedelta(days=7 * i) for i in range(10)]
        result = detect_periodicity(dates)
        assert result is not None
        period, _, _ = result
        assert period == "weekly"

    def test_quarterly(self):
        """Quarterly transactions ~90 days apart."""
        dates = [date(2025, 1, 1) + timedelta(days=90 * i) for i in range(5)]
        result = detect_periodicity(dates)
        assert result is not None
        period, _, _ = result
        assert period == "quarterly"

    def test_yearly(self):
        """Yearly transactions ~365 days apart."""
        dates = [date(2022, 3, 15) + timedelta(days=365 * i) for i in range(4)]
        result = detect_periodicity(dates)
        assert result is not None
        period, _, _ = result
        assert period == "yearly"

    def test_irregular_returns_none(self):
        """Random intervals should return None."""
        dates = [date(2025, 1, 1), date(2025, 1, 10), date(2025, 3, 5), date(2025, 5, 22)]
        result = detect_periodicity(dates)
        assert result is None

    def test_too_few_dates(self):
        """Less than 3 dates should return None."""
        assert detect_periodicity([date(2025, 1, 1), date(2025, 2, 1)]) is None
        assert detect_periodicity([date(2025, 1, 1)]) is None
        assert detect_periodicity([]) is None

    def test_unsorted_input(self):
        """Should handle unsorted dates correctly."""
        dates = [date(2025, 3, 15), date(2025, 1, 15), date(2025, 5, 15), date(2025, 2, 15),
                 date(2025, 4, 15), date(2025, 6, 15)]
        # These are monthly on the 15th, just unsorted
        result = detect_periodicity(dates)
        assert result is not None
        period, _, _ = result
        assert period == "monthly"

    def test_monthly_with_slight_variation(self):
        """Monthly with ±2 day variation should still detect."""
        base = date(2025, 1, 15)
        offsets = [0, 29, 61, 90, 121, 150]  # roughly monthly
        dates = [base + timedelta(days=d) for d in offsets]
        result = detect_periodicity(dates)
        assert result is not None
        period, _, _ = result
        assert period == "monthly"


# ---------------------------------------------------------------------------
# Amount analysis tests
# ---------------------------------------------------------------------------


class TestAnalyzeAmounts:
    def test_fixed_amount(self):
        """Identical amounts should be detected as fixed."""
        is_fixed, trend, slope = analyze_amounts([15.99] * 6)
        assert is_fixed is True
        assert trend == "stable"

    def test_variable_amount(self):
        """Varying amounts (>5% CV) should not be fixed."""
        amounts = [100.0, 120.0, 80.0, 150.0, 90.0, 110.0]
        is_fixed, _, _ = analyze_amounts(amounts)
        assert is_fixed is False

    def test_increasing_trend(self):
        """Steadily increasing amounts should be detected."""
        amounts = [100.0, 110.0, 120.0, 130.0, 140.0, 150.0]
        _, trend, slope = analyze_amounts(amounts)
        assert trend == "increasing"
        assert slope > 0

    def test_decreasing_trend(self):
        """Steadily decreasing amounts should be detected."""
        amounts = [150.0, 140.0, 130.0, 120.0, 110.0, 100.0]
        _, trend, slope = analyze_amounts(amounts)
        assert trend == "decreasing"
        assert slope < 0

    def test_stable_trend(self):
        """Amounts hovering around the same value."""
        amounts = [100.0, 101.0, 99.5, 100.5, 100.0]
        _, trend, _ = analyze_amounts(amounts)
        assert trend == "stable"


# ---------------------------------------------------------------------------
# Classification tests
# ---------------------------------------------------------------------------


class TestClassifyRecurringType:
    def test_netflix_subscription(self):
        result = classify_recurring_type("Netflix", True, "monthly", 22.99, True)
        assert result == "subscription"

    def test_spotify_subscription(self):
        result = classify_recurring_type("Spotify Premium", True, "monthly", 12.99, True)
        assert result == "subscription"

    def test_salary_credit(self):
        result = classify_recurring_type("EMPLOYER PTY LTD SALARY", False, "fortnightly", 3500.0, True)
        assert result == "salary"

    def test_large_regular_credit_as_salary(self):
        """Large regular credit without salary keyword should still be salary."""
        result = classify_recurring_type("ABC COMPANY PTY LTD", False, "fortnightly", 2800.0, True)
        assert result == "salary"

    def test_rent(self):
        result = classify_recurring_type("RENT PAYMENT TO LANDLORD", True, "monthly", 2200.0, True)
        assert result == "rent"

    def test_telstra_utility(self):
        result = classify_recurring_type("TELSTRA MOBILE", True, "monthly", 89.0, False)
        assert result == "utility"

    def test_agl_utility(self):
        result = classify_recurring_type("AGL ENERGY", True, "quarterly", 350.0, False)
        assert result == "utility"

    def test_nrma_insurance(self):
        result = classify_recurring_type("NRMA INSURANCE", True, "monthly", 120.0, True)
        assert result == "insurance"

    def test_bupa_insurance(self):
        result = classify_recurring_type("BUPA HEALTH", True, "monthly", 250.0, True)
        assert result == "insurance"

    def test_unknown_fixed_monthly_as_subscription(self):
        """Unknown fixed monthly debit defaults to subscription."""
        result = classify_recurring_type("SOME UNKNOWN SERVICE", True, "monthly", 9.99, True)
        assert result == "subscription"

    def test_unknown_variable_as_other(self):
        """Unknown variable amount falls to 'other'."""
        result = classify_recurring_type("RANDOM STORE", True, "monthly", 50.0, False)
        assert result == "other"


# ---------------------------------------------------------------------------
# Confidence scoring tests
# ---------------------------------------------------------------------------


class TestComputeConfidence:
    def test_perfect_monthly_subscription(self):
        """Netflix-like: exact timing, exact amount, 12 occurrences."""
        conf = compute_confidence(interval_std=0.5, amount_cv=0.0, occurrence_count=12, period="monthly")
        assert conf >= 0.9

    def test_fortnightly_salary_high_confidence(self):
        """Regular salary: low std, fixed amount, many occurrences."""
        conf = compute_confidence(interval_std=0.3, amount_cv=0.01, occurrence_count=24, period="fortnightly")
        assert conf >= 0.95

    def test_low_occurrence_count(self):
        """Only 3 occurrences should reduce confidence."""
        conf = compute_confidence(interval_std=1.0, amount_cv=0.02, occurrence_count=3, period="monthly")
        assert conf < 0.8

    def test_high_std_reduces_confidence(self):
        """High interval variability reduces confidence."""
        conf_good = compute_confidence(interval_std=0.5, amount_cv=0.0, occurrence_count=6, period="monthly")
        conf_bad = compute_confidence(interval_std=4.5, amount_cv=0.0, occurrence_count=6, period="monthly")
        assert conf_good > conf_bad

    def test_confidence_bounded_0_1(self):
        """Confidence should always be between 0 and 1."""
        conf = compute_confidence(interval_std=100.0, amount_cv=10.0, occurrence_count=1, period="monthly")
        assert 0.0 <= conf <= 1.0


# ---------------------------------------------------------------------------
# Anomaly detection tests
# ---------------------------------------------------------------------------


class TestCheckAnomaly:
    def test_no_anomaly_recent(self):
        """Payment made recently, no anomaly."""
        assert check_anomaly(
            last_date=date(2025, 3, 1),
            median_interval=30.0,
            interval_std=2.0,
            today=date(2025, 3, 15),
        ) is False

    def test_anomaly_overdue(self):
        """Payment overdue by more than median + 2*std."""
        assert check_anomaly(
            last_date=date(2025, 1, 1),
            median_interval=30.0,
            interval_std=2.0,
            today=date(2025, 3, 1),
        ) is True

    def test_borderline_not_anomaly(self):
        """Just within threshold should not be anomaly."""
        # threshold = 30 + 2*2 = 34 days
        assert check_anomaly(
            last_date=date(2025, 1, 1),
            median_interval=30.0,
            interval_std=2.0,
            today=date(2025, 2, 3),  # 33 days
        ) is False


# ---------------------------------------------------------------------------
# HDBSCAN clustering tests
# ---------------------------------------------------------------------------


class TestClusterTransactions:
    def test_distinct_clusters(self):
        """Two clearly separated groups should form two clusters."""
        rng = np.random.RandomState(42)
        # Group A: cluster around (1, 0, 0, ...)
        group_a = rng.randn(10, 384) * 0.01 + np.array([1.0] + [0.0] * 383)
        # Group B: cluster around (0, 1, 0, ...)
        group_b = rng.randn(10, 384) * 0.01 + np.array([0.0, 1.0] + [0.0] * 382)
        # Normalize
        embeddings = np.vstack([group_a, group_b])
        norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
        embeddings = embeddings / norms

        labels = cluster_transactions(embeddings, min_cluster_size=3)
        unique_labels = set(labels[labels >= 0])
        assert len(unique_labels) >= 2

    def test_noise_for_singletons(self):
        """Isolated points should be labeled as noise (-1)."""
        rng = np.random.RandomState(42)
        # One cluster of 5 + 3 isolated points
        cluster = rng.randn(5, 384) * 0.01 + np.array([1.0] + [0.0] * 383)
        isolated = rng.randn(3, 384)
        embeddings = np.vstack([cluster, isolated])
        norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
        embeddings = embeddings / norms

        labels = cluster_transactions(embeddings, min_cluster_size=3)
        # Isolated points should mostly be noise
        noise_count = np.sum(labels[-3:] == -1)
        assert noise_count >= 1


# ---------------------------------------------------------------------------
# Full pipeline integration test (with mock embedder)
# ---------------------------------------------------------------------------


class TestRecurringDetectorIntegration:
    """Integration tests using a mock embedder and description-based clustering.

    HDBSCAN clustering is tested separately in TestClusterTransactions.
    Here we mock both the embedder and clustering to test the full pipeline logic.
    """

    def _make_mock_embedder(self):
        """Create a mock embedder that returns dummy embeddings."""
        embedder = MagicMock(spec=TransactionEmbedder)
        embedder.is_loaded = True

        def mock_encode(descriptions, **kwargs):
            return np.random.randn(len(descriptions), 384).astype(np.float32)

        embedder.encode = mock_encode
        return embedder

    @staticmethod
    def _description_cluster(embeddings, min_cluster_size=3):
        """Mock clustering that groups by transaction index ranges.

        This is patched in place of HDBSCAN for integration tests.
        We rely on the test setup to provide transactions grouped by description.
        """
        # This will be replaced per-test using side_effect
        raise NotImplementedError

    def _make_netflix_transactions(self, count: int = 8) -> list[dict]:
        """Generate Netflix-like subscription transactions."""
        base_date = date(2024, 6, 15)
        return [
            {
                "id": f"netflix-{i}",
                "description": "NETFLIX.COM",
                "amount": 22.99,
                "date": base_date + timedelta(days=30 * i),
                "is_debit": True,
            }
            for i in range(count)
        ]

    def _make_salary_transactions(self, count: int = 12) -> list[dict]:
        """Generate fortnightly salary credits."""
        base_date = date(2024, 6, 1)
        return [
            {
                "id": f"salary-{i}",
                "description": "EMPLOYER PTY LTD SALARY",
                "amount": -3500.00,  # credit
                "date": base_date + timedelta(days=14 * i),
                "is_debit": False,
            }
            for i in range(count)
        ]

    def _make_spotify_transactions(self, count: int = 6) -> list[dict]:
        """Generate Spotify subscription transactions."""
        base_date = date(2024, 7, 1)
        return [
            {
                "id": f"spotify-{i}",
                "description": "SPOTIFY PREMIUM",
                "amount": 12.99,
                "date": base_date + timedelta(days=30 * i),
                "is_debit": True,
            }
            for i in range(count)
        ]

    @patch("src.models.recurring_detector.cluster_transactions")
    def test_detects_monthly_subscription(self, mock_cluster):
        """Should detect Netflix as a monthly subscription with high confidence."""
        embedder = self._make_mock_embedder()
        detector = RecurringDetector(embedder=embedder)

        txns = self._make_netflix_transactions(8)
        # All 8 transactions in cluster 0
        mock_cluster.return_value = np.array([0] * 8)

        result = detector.detect(txns, min_occurrences=3)

        assert result["transactions_analyzed"] == 8
        assert result["clusters_found"] == 1
        assert len(result["patterns"]) == 1

        p = result["patterns"][0]
        assert p["period"] == "monthly"
        assert p["recurrence_type"] == "subscription"
        assert p["confidence"] >= 0.7
        assert p["median_amount"] == 22.99
        assert p["is_fixed_amount"] is True

    @patch("src.models.recurring_detector.cluster_transactions")
    def test_detects_fortnightly_salary(self, mock_cluster):
        """Should detect salary as fortnightly with high confidence."""
        embedder = self._make_mock_embedder()
        detector = RecurringDetector(embedder=embedder)

        txns = self._make_salary_transactions(12)
        mock_cluster.return_value = np.array([0] * 12)

        result = detector.detect(txns, min_occurrences=3)

        assert len(result["patterns"]) == 1
        p = result["patterns"][0]
        assert p["period"] == "fortnightly"
        assert p["recurrence_type"] == "salary"
        assert p["confidence"] >= 0.85

    @patch("src.models.recurring_detector.cluster_transactions")
    def test_mixed_transactions(self, mock_cluster):
        """Should find multiple patterns in mixed transaction data."""
        embedder = self._make_mock_embedder()
        detector = RecurringDetector(embedder=embedder)

        txns = (
            self._make_netflix_transactions(6)
            + self._make_salary_transactions(8)
            + self._make_spotify_transactions(6)
        )
        # 3 clusters: Netflix=0, Salary=1, Spotify=2
        labels = [0] * 6 + [1] * 8 + [2] * 6
        mock_cluster.return_value = np.array(labels)

        result = detector.detect(txns, min_occurrences=3)

        assert result["transactions_analyzed"] == 20
        assert result["clusters_found"] == 3
        assert len(result["patterns"]) == 3

    def test_empty_transactions(self):
        """Should handle empty input gracefully."""
        embedder = self._make_mock_embedder()
        detector = RecurringDetector(embedder=embedder)

        result = detector.detect([], min_occurrences=3)
        assert result["patterns"] == []
        assert result["transactions_analyzed"] == 0

    @patch("src.models.recurring_detector.cluster_transactions")
    def test_too_few_transactions(self, mock_cluster):
        """Two transactions of the same type shouldn't form a recurring pattern."""
        embedder = self._make_mock_embedder()
        detector = RecurringDetector(embedder=embedder)

        txns = self._make_netflix_transactions(2)
        # HDBSCAN would label both as noise with min_cluster_size=3
        mock_cluster.return_value = np.array([-1, -1])

        result = detector.detect(txns, min_occurrences=3)
        assert result["patterns"] == []

    @patch("src.models.recurring_detector.cluster_transactions")
    def test_incremental_mode(self, mock_cluster):
        """Should use cached embeddings and only encode new transactions."""
        embedder = self._make_mock_embedder()
        detector = RecurringDetector(embedder=embedder)

        txns = self._make_netflix_transactions(6)
        mock_cluster.return_value = np.array([0] * 6)

        # First run: full encoding
        result1 = detector.detect(txns, return_embeddings=True)
        assert result1["embeddings"] is not None
        assert len(result1["embeddings"]) == 6

        # Second run with 1 new transaction + cached embeddings
        extra = [
            {
                "id": "netflix-extra-1",
                "description": "NETFLIX.COM",
                "amount": 22.99,
                "date": date(2025, 6, 15),
                "is_debit": True,
            }
        ]
        all_txns = txns + extra
        mock_cluster.return_value = np.array([0] * 7)

        result2 = detector.detect(
            all_txns,
            cached_embeddings=result1["embeddings"],
            return_embeddings=True,
        )
        assert result2["embeddings"] is not None
        assert len(result2["embeddings"]) == 7

    @patch("src.models.recurring_detector.cluster_transactions")
    def test_patterns_sorted_by_confidence(self, mock_cluster):
        """Patterns should be returned sorted by confidence descending."""
        embedder = self._make_mock_embedder()
        detector = RecurringDetector(embedder=embedder)

        # Salary (12 fortnightly) should have higher confidence than Netflix (4 monthly)
        txns = self._make_netflix_transactions(4) + self._make_salary_transactions(12)
        labels = [0] * 4 + [1] * 12
        mock_cluster.return_value = np.array(labels)

        result = detector.detect(txns, min_occurrences=3)

        if len(result["patterns"]) >= 2:
            confidences = [p["confidence"] for p in result["patterns"]]
            assert confidences == sorted(confidences, reverse=True)


# ---------------------------------------------------------------------------
# Schema validation tests
# ---------------------------------------------------------------------------


class TestSchemas:
    def test_recurring_request_min_transactions(self):
        """RecurringRequest should require at least 1 transaction."""
        from src.schemas.recurring import RecurringRequest, TransactionInput

        with pytest.raises(Exception):
            RecurringRequest(transactions=[])

    def test_transaction_input_defaults(self):
        from src.schemas.recurring import TransactionInput

        t = TransactionInput(
            id="1", description="Test", amount=10.0, date=date(2025, 1, 1)
        )
        assert t.is_debit is True
        assert t.category is None

    def test_recurring_pattern_all_fields(self):
        from src.schemas.recurring import (
            AmountTrend,
            RecurrencePeriod,
            RecurrenceType,
            RecurringPattern,
        )

        p = RecurringPattern(
            description="Netflix",
            period=RecurrencePeriod.MONTHLY,
            recurrence_type=RecurrenceType.SUBSCRIPTION,
            median_amount=22.99,
            median_interval_days=30.0,
            amount_trend=AmountTrend.STABLE,
            is_fixed_amount=True,
            next_expected_date=date(2025, 4, 15),
            last_seen_date=date(2025, 3, 15),
            confidence=0.95,
            transaction_ids=["1", "2", "3"],
            occurrence_count=3,
        )
        assert p.anomaly_flag is False
        assert p.amount_trend_slope == 0.0
