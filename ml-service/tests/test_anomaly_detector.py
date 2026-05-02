"""Tests for spending anomaly detection pipeline."""

import pytest
from datetime import date, datetime

from src.schemas.anomaly import (
    AnomalySeverity,
    AnomalyType,
    CategoryStats,
    MerchantStats,
    SpendingProfile,
    TransactionInput,
)
from src.models.anomaly_detector import (
    AnomalyDetector,
    build_spending_profile,
    detect_anomalies,
    SINGLE_TXN_Z_THRESHOLD,
    MONTHLY_Z_THRESHOLD,
    NEW_CATEGORY_AMOUNT_THRESHOLD,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_transaction(
    id: str = "t1",
    description: str = "Woolworths",
    amount: float = 50.0,
    date_val: date = date(2026, 3, 15),
    category: str = "Food",
    merchant: str | None = None,
    is_debit: bool = True,
) -> TransactionInput:
    return TransactionInput(
        id=id,
        description=description,
        amount=amount,
        date=date_val,
        category=category,
        merchant=merchant,
        is_debit=is_debit,
    )


def _make_history(months: int = 6, category: str = "Food", base_amount: float = 200.0):
    """Generate synthetic monthly history: ~4 transactions per month with variation."""
    import numpy as np

    rng = np.random.default_rng(42)
    txns = []
    for m in range(months):
        month = 9 - m  # Sept back to April for 6 months
        year = 2025 if month > 0 else 2024
        if month <= 0:
            month += 12
            year -= 1
        # Add month-level variation (±20%)
        month_factor = 1.0 + rng.normal(0, 0.2)
        for day_offset in range(4):
            # Per-transaction variation (±15%)
            txn_noise = rng.normal(0, 0.15)
            amount = (base_amount / 4) * month_factor * (1.0 + txn_noise)
            txns.append(
                _make_transaction(
                    id=f"h-{m}-{day_offset}",
                    amount=round(max(5.0, amount), 2),
                    date_val=date(year, month, 5 + day_offset * 7),
                    category=category,
                )
            )
    return txns


def _make_profile_with_food() -> SpendingProfile:
    """Pre-built profile with Food category stats."""
    return SpendingProfile(
        user_id="user-1",
        category_stats={
            "Food": CategoryStats(
                category="Food",
                monthly_mean=200.0,
                monthly_std=30.0,
                monthly_median=195.0,
                transaction_count_mean=4.0,
                largest_single_transaction=80.0,
            ),
            "Entertainment": CategoryStats(
                category="Entertainment",
                monthly_mean=50.0,
                monthly_std=15.0,
                monthly_median=45.0,
                transaction_count_mean=2.0,
                largest_single_transaction=40.0,
            ),
        },
        merchant_stats={
            "Woolworths": MerchantStats(
                merchant="Woolworths",
                mean_amount=45.0,
                std_amount=10.0,
                transaction_count=12,
            ),
        },
        last_updated=datetime(2026, 3, 1),
        months_of_data=6,
    )


# ---------------------------------------------------------------------------
# Profile building tests
# ---------------------------------------------------------------------------


class TestBuildSpendingProfile:
    def test_empty_transactions(self):
        profile = build_spending_profile("user-1", [])
        assert profile.user_id == "user-1"
        assert profile.category_stats == {}
        assert profile.months_of_data == 0

    def test_basic_profile_building(self):
        history = _make_history(months=6, category="Food", base_amount=200.0)
        profile = build_spending_profile("user-1", history)

        assert profile.user_id == "user-1"
        assert "Food" in profile.category_stats
        assert profile.months_of_data >= 1

        food_stats = profile.category_stats["Food"]
        assert food_stats.monthly_mean > 0
        assert food_stats.transaction_count_mean > 0
        assert food_stats.largest_single_transaction > 0

    def test_credits_excluded(self):
        """Credit transactions should not be included in spending profile."""
        txns = [
            _make_transaction(id="c1", amount=1000.0, is_debit=False, category="Income"),
            _make_transaction(id="d1", amount=50.0, is_debit=True, category="Food"),
        ]
        profile = build_spending_profile("user-1", txns)
        assert "Income" not in profile.category_stats
        assert "Food" in profile.category_stats

    def test_merchant_stats_computed(self):
        history = _make_history(months=3)
        profile = build_spending_profile("user-1", history)
        assert len(profile.merchant_stats) > 0


# ---------------------------------------------------------------------------
# Anomaly detection tests
# ---------------------------------------------------------------------------


class TestDetectAnomalies:
    def test_no_anomaly_normal_transaction(self):
        profile = _make_profile_with_food()
        txn = _make_transaction(amount=50.0, category="Food")
        anomalies = detect_anomalies(txn, profile)
        assert len(anomalies) == 0

    def test_new_category_large_amount(self):
        profile = _make_profile_with_food()
        txn = _make_transaction(amount=150.0, category="Travel")
        anomalies = detect_anomalies(txn, profile)

        assert len(anomalies) == 1
        assert anomalies[0].type == AnomalyType.NEW_CATEGORY
        assert anomalies[0].severity == AnomalySeverity.INFO
        assert "Travel" in anomalies[0].message

    def test_new_category_small_amount_no_anomaly(self):
        profile = _make_profile_with_food()
        txn = _make_transaction(amount=20.0, category="Travel")
        anomalies = detect_anomalies(txn, profile)
        assert len(anomalies) == 0

    def test_large_transaction_anomaly(self):
        profile = _make_profile_with_food()
        # Expected per-txn: 200/4 = 50, std per-txn: 30/4 = 7.5
        # z-score for $500: (500-50)/7.5 = 60 >> 3.0
        txn = _make_transaction(amount=500.0, category="Food")
        anomalies = detect_anomalies(txn, profile)

        large_txn_anomalies = [a for a in anomalies if a.type == AnomalyType.LARGE_TRANSACTION]
        assert len(large_txn_anomalies) == 1
        assert large_txn_anomalies[0].severity == AnomalySeverity.WARNING
        assert large_txn_anomalies[0].z_score is not None
        assert large_txn_anomalies[0].z_score > SINGLE_TXN_Z_THRESHOLD

    def test_monthly_spending_anomaly(self):
        profile = _make_profile_with_food()
        # Monthly mean=200, std=30. z > 2.0 means total > 200 + 2*30 = 260
        txn = _make_transaction(amount=30.0, category="Food")
        current_spending = {"Food": 300.0}  # Well above 260 threshold

        anomalies = detect_anomalies(txn, profile, current_month_spending=current_spending)

        monthly_anomalies = [
            a for a in anomalies if a.type == AnomalyType.HIGH_MONTHLY_SPENDING
        ]
        assert len(monthly_anomalies) == 1
        assert monthly_anomalies[0].current_month_total == 300.0

    def test_merchant_anomaly(self):
        profile = _make_profile_with_food()
        # Woolworths: mean=45, std=10. z > 3.0 means amount > 45 + 3*10 = 75
        txn = _make_transaction(
            amount=150.0, category="Food", merchant="Woolworths"
        )
        anomalies = detect_anomalies(txn, profile)

        merchant_anomalies = [
            a for a in anomalies if a.type == AnomalyType.MERCHANT_ANOMALY
        ]
        assert len(merchant_anomalies) == 1
        assert merchant_anomalies[0].merchant == "Woolworths"

    def test_credit_transaction_skipped(self):
        profile = _make_profile_with_food()
        txn = _make_transaction(amount=10000.0, category="Food", is_debit=False)
        anomalies = detect_anomalies(txn, profile)
        assert len(anomalies) == 0

    def test_multiple_anomalies_possible(self):
        """A single transaction can trigger both large_transaction and merchant anomalies."""
        profile = _make_profile_with_food()
        txn = _make_transaction(
            amount=500.0, category="Food", merchant="Woolworths"
        )
        anomalies = detect_anomalies(txn, profile)

        types = {a.type for a in anomalies}
        assert AnomalyType.LARGE_TRANSACTION in types
        assert AnomalyType.MERCHANT_ANOMALY in types


# ---------------------------------------------------------------------------
# Orchestrator tests
# ---------------------------------------------------------------------------


class TestAnomalyDetector:
    def test_end_to_end(self):
        detector = AnomalyDetector()
        history = _make_history(months=6)
        new_txns = [
            _make_transaction(id="new-1", amount=500.0, category="Food"),
            _make_transaction(id="new-2", amount=30.0, category="Food"),
        ]

        result = detector.detect(
            user_id="user-1",
            transactions=new_txns,
            history=history,
        )

        assert result["transactions_checked"] == 2
        assert result["processing_time_ms"] >= 0
        assert result["profile"].user_id == "user-1"
        # The $500 transaction should be flagged
        assert len(result["anomalies"]) >= 1

    def test_empty_history(self):
        detector = AnomalyDetector()
        new_txns = [
            _make_transaction(id="new-1", amount=150.0, category="Travel"),
        ]

        result = detector.detect(
            user_id="user-1",
            transactions=new_txns,
            history=[],
        )

        # No profile means no anomalies (empty profile = all categories are "new")
        # But new category with amount > $100 should still be flagged
        assert result["transactions_checked"] == 1

    def test_precision_on_synthetic_data(self):
        """Verify anomaly precision > 0.70 on synthetic data (acceptance criteria)."""
        detector = AnomalyDetector()

        # Generate 6 months of consistent Food spending (~$200/month, 4 txns)
        history = _make_history(months=6, category="Food", base_amount=200.0)

        # True positives: clearly anomalous transactions
        true_anomalous = [
            _make_transaction(id="tp-1", amount=800.0, category="Food"),
            _make_transaction(id="tp-2", amount=600.0, category="Food"),
            _make_transaction(id="tp-3", amount=500.0, category="Food"),
        ]

        # True negatives: normal transactions
        true_normal = [
            _make_transaction(id="tn-1", amount=50.0, category="Food"),
            _make_transaction(id="tn-2", amount=55.0, category="Food"),
            _make_transaction(id="tn-3", amount=45.0, category="Food"),
            _make_transaction(id="tn-4", amount=60.0, category="Food"),
        ]

        # Check anomalous transactions
        tp_result = detector.detect("user-1", true_anomalous, history)
        tp_flagged = sum(
            1
            for a in tp_result["anomalies"]
            if a.type == AnomalyType.LARGE_TRANSACTION
        )

        # Check normal transactions
        fp_result = detector.detect("user-1", true_normal, history)
        fp_flagged = sum(
            1
            for a in fp_result["anomalies"]
            if a.type == AnomalyType.LARGE_TRANSACTION
        )

        # Precision = TP / (TP + FP)
        total_flagged = tp_flagged + fp_flagged
        if total_flagged > 0:
            precision = tp_flagged / total_flagged
            assert precision >= 0.70, f"Precision {precision:.2f} < 0.70"

        # At least some true anomalies should be detected
        assert tp_flagged >= 2, f"Only {tp_flagged}/3 true anomalies detected"
