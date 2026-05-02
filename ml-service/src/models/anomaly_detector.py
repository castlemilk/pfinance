"""Spending anomaly detection pipeline.

Z-score MVP: per-user rolling spending profile with category and merchant statistics.
Detects single-transaction anomalies, monthly spending anomalies, and new categories.

CPU-only. ~1ms per transaction check against existing profile.
"""

from __future__ import annotations

import time
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Optional

import numpy as np
import structlog

from ..schemas.anomaly import (
    Anomaly,
    AnomalySeverity,
    AnomalyType,
    CategoryStats,
    MerchantStats,
    SpendingProfile,
    TransactionInput,
)

logger = structlog.get_logger()

# ---------------------------------------------------------------------------
# Profile builder
# ---------------------------------------------------------------------------

ROLLING_WINDOW_MONTHS = 6


def _month_key(d: date) -> str:
    """Return YYYY-MM key for grouping."""
    return f"{d.year}-{d.month:02d}"


def build_spending_profile(
    user_id: str,
    transactions: list[TransactionInput],
    window_months: int = ROLLING_WINDOW_MONTHS,
) -> SpendingProfile:
    """Build a spending profile from historical transactions.

    Groups transactions by month and category, computes rolling statistics
    over the specified window.

    Args:
        user_id: User identifier.
        transactions: Historical debit transactions (should be pre-filtered).
        window_months: Number of months for the rolling window.

    Returns:
        SpendingProfile with category and merchant statistics.
    """
    if not transactions:
        return SpendingProfile(
            user_id=user_id,
            category_stats={},
            merchant_stats={},
            last_updated=datetime.now(tz=None),
            months_of_data=0,
        )

    # Filter to debit transactions only
    debits = [t for t in transactions if t.is_debit]
    if not debits:
        return SpendingProfile(
            user_id=user_id,
            category_stats={},
            merchant_stats={},
            last_updated=datetime.now(tz=None),
            months_of_data=0,
        )

    # Determine window
    all_dates = [t.date for t in debits]
    max_date = max(all_dates)
    cutoff = date(max_date.year, max_date.month, 1) - timedelta(days=window_months * 31)

    windowed = [t for t in debits if t.date >= cutoff]

    # Group by (month, category)
    monthly_cat: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    monthly_cat_counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))

    for t in windowed:
        mk = _month_key(t.date)
        monthly_cat[mk][t.category] += abs(t.amount)
        monthly_cat_counts[mk][t.category] += 1

    # All months in window
    months = sorted(monthly_cat.keys())
    num_months = len(months)

    # Build category stats
    all_categories = set()
    for mk in months:
        all_categories.update(monthly_cat[mk].keys())

    category_stats: dict[str, CategoryStats] = {}
    for cat in all_categories:
        monthly_totals = [monthly_cat[mk].get(cat, 0.0) for mk in months]
        monthly_counts = [monthly_cat_counts[mk].get(cat, 0) for mk in months]
        all_amounts = [abs(t.amount) for t in windowed if t.category == cat]

        arr = np.array(monthly_totals, dtype=np.float64)
        counts_arr = np.array(monthly_counts, dtype=np.float64)

        category_stats[cat] = CategoryStats(
            category=cat,
            monthly_mean=float(np.mean(arr)),
            monthly_std=float(np.std(arr)) if len(arr) > 1 else 0.0,
            monthly_median=float(np.median(arr)),
            transaction_count_mean=float(np.mean(counts_arr)),
            largest_single_transaction=max(all_amounts) if all_amounts else 0.0,
        )

    # Build merchant stats
    merchant_amounts: dict[str, list[float]] = defaultdict(list)
    for t in windowed:
        merchant_name = t.merchant or t.description
        merchant_amounts[merchant_name].append(abs(t.amount))

    merchant_stats: dict[str, MerchantStats] = {}
    for merchant, amounts in merchant_amounts.items():
        arr = np.array(amounts, dtype=np.float64)
        merchant_stats[merchant] = MerchantStats(
            merchant=merchant,
            mean_amount=float(np.mean(arr)),
            std_amount=float(np.std(arr)) if len(arr) > 1 else 0.0,
            transaction_count=len(amounts),
        )

    return SpendingProfile(
        user_id=user_id,
        category_stats=category_stats,
        merchant_stats=merchant_stats,
        last_updated=datetime.now(tz=None),
        months_of_data=num_months,
    )


# ---------------------------------------------------------------------------
# Anomaly detection
# ---------------------------------------------------------------------------

# Z-score thresholds
SINGLE_TXN_Z_THRESHOLD = 3.0
MONTHLY_Z_THRESHOLD = 2.0
NEW_CATEGORY_AMOUNT_THRESHOLD = 100.0


def detect_anomalies(
    transaction: TransactionInput,
    profile: SpendingProfile,
    current_month_spending: Optional[dict[str, float]] = None,
) -> list[Anomaly]:
    """Detect anomalies for a single transaction against the user's profile.

    Checks:
    1. New category with amount > $100 → info
    2. Single transaction z-score > 3.0 → warning
    3. Monthly spending z-score > 2.0 → warning
    4. Merchant-level anomaly → warning

    Args:
        transaction: The new transaction to check.
        profile: User's spending profile.
        current_month_spending: Pre-computed current month totals per category.

    Returns:
        List of detected anomalies (may be empty).
    """
    anomalies: list[Anomaly] = []

    if not transaction.is_debit:
        return anomalies  # Only check spending anomalies

    cat_stats = profile.category_stats.get(transaction.category)

    # Check 1: New category
    if cat_stats is None:
        if abs(transaction.amount) > NEW_CATEGORY_AMOUNT_THRESHOLD:
            anomalies.append(
                Anomaly(
                    type=AnomalyType.NEW_CATEGORY,
                    severity=AnomalySeverity.INFO,
                    message=(
                        f"First transaction in '{transaction.category}': "
                        f"${abs(transaction.amount):.2f}"
                    ),
                    category=transaction.category,
                    amount=abs(transaction.amount),
                )
            )
        return anomalies

    # Check 2: Single transaction anomaly
    if cat_stats.monthly_std > 0 and cat_stats.transaction_count_mean > 0:
        # Expected per-transaction amount
        expected_per_txn = cat_stats.monthly_mean / cat_stats.transaction_count_mean
        per_txn_std = cat_stats.monthly_std / cat_stats.transaction_count_mean

        if per_txn_std > 0:
            z_score = (abs(transaction.amount) - expected_per_txn) / per_txn_std
            if z_score > SINGLE_TXN_Z_THRESHOLD:
                merchant_name = transaction.merchant or transaction.description
                anomalies.append(
                    Anomaly(
                        type=AnomalyType.LARGE_TRANSACTION,
                        severity=AnomalySeverity.WARNING,
                        message=(
                            f"${abs(transaction.amount):.2f} at {merchant_name} "
                            f"is unusually large for {transaction.category}"
                        ),
                        category=transaction.category,
                        merchant=merchant_name,
                        amount=abs(transaction.amount),
                        z_score=round(z_score, 2),
                    )
                )

    # Check 3: Monthly spending anomaly
    if current_month_spending and cat_stats.monthly_std > 0:
        month_total = current_month_spending.get(transaction.category, 0.0)
        monthly_z = (month_total - cat_stats.monthly_mean) / cat_stats.monthly_std
        if monthly_z > MONTHLY_Z_THRESHOLD:
            anomalies.append(
                Anomaly(
                    type=AnomalyType.HIGH_MONTHLY_SPENDING,
                    severity=AnomalySeverity.WARNING
                    if monthly_z < SINGLE_TXN_Z_THRESHOLD
                    else AnomalySeverity.ALERT,
                    message=(
                        f"{transaction.category} spending this month "
                        f"(${month_total:.2f}) is above your usual range"
                    ),
                    category=transaction.category,
                    current_month_total=month_total,
                    z_score=round(monthly_z, 2),
                )
            )

    # Check 4: Merchant-level anomaly
    merchant_name = transaction.merchant or transaction.description
    m_stats = profile.merchant_stats.get(merchant_name)
    if m_stats and m_stats.std_amount > 0 and m_stats.transaction_count >= 3:
        merchant_z = (abs(transaction.amount) - m_stats.mean_amount) / m_stats.std_amount
        if merchant_z > SINGLE_TXN_Z_THRESHOLD:
            anomalies.append(
                Anomaly(
                    type=AnomalyType.MERCHANT_ANOMALY,
                    severity=AnomalySeverity.WARNING,
                    message=(
                        f"${abs(transaction.amount):.2f} at {merchant_name} "
                        f"is unusually large (typical: ${m_stats.mean_amount:.2f})"
                    ),
                    category=transaction.category,
                    merchant=merchant_name,
                    amount=abs(transaction.amount),
                    z_score=round(merchant_z, 2),
                )
            )

    return anomalies


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------


class AnomalyDetector:
    """Orchestrates anomaly detection pipeline.

    Pipeline:
    1. Build spending profile from historical transactions
    2. Check each new transaction against the profile
    3. Return anomalies with severity levels

    CPU-only. Profile build: ~10ms for 1000 transactions. Detection: ~0.1ms per transaction.
    """

    def detect(
        self,
        user_id: str,
        transactions: list[TransactionInput],
        history: list[TransactionInput],
        current_month_spending: Optional[dict[str, float]] = None,
    ) -> dict:
        """Run anomaly detection on new transactions.

        Args:
            user_id: User identifier.
            transactions: New transactions to check.
            history: Historical transactions for profile building.
            current_month_spending: Pre-computed current month totals.

        Returns:
            Dict with keys: anomalies, profile, processing_time_ms, transactions_checked.
        """
        start = time.time()

        # Step 1: Build spending profile from history
        profile = build_spending_profile(user_id, history)

        # Step 2: Check each new transaction
        all_anomalies: list[Anomaly] = []
        for txn in transactions:
            anomalies = detect_anomalies(txn, profile, current_month_spending)
            all_anomalies.extend(anomalies)

        elapsed_ms = int((time.time() - start) * 1000)

        logger.info(
            "Anomaly detection complete",
            user_id=user_id,
            transactions_checked=len(transactions),
            anomalies_found=len(all_anomalies),
            processing_time_ms=elapsed_ms,
        )

        return {
            "anomalies": all_anomalies,
            "profile": profile,
            "processing_time_ms": elapsed_ms,
            "transactions_checked": len(transactions),
        }
