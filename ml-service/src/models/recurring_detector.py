"""Recurring transaction detection pipeline.

Uses sentence-transformer embeddings + HDBSCAN clustering to group similar transactions,
then detects periodicity and classifies recurring types.

CPU-only. ~5ms per transaction for embedding, ~5s for 1000 transactions full recompute.
"""

from __future__ import annotations

import time
from collections import defaultdict
from datetime import date, timedelta
from typing import Optional

import numpy as np
import structlog

logger = structlog.get_logger()

# ---------------------------------------------------------------------------
# Australian merchant lists for classification hints
# ---------------------------------------------------------------------------

SUBSCRIPTION_MERCHANTS: set[str] = {
    # Streaming
    "netflix", "stan", "disney", "binge", "paramount", "apple tv", "youtube premium",
    "spotify", "apple music", "tidal", "amazon prime", "audible", "kindle unlimited",
    # Software / cloud
    "adobe", "microsoft 365", "office 365", "dropbox", "google one", "icloud",
    "canva", "notion", "slack", "zoom", "github", "chatgpt", "openai",
    # News / media
    "the australian", "smh", "afr", "news corp", "nine entertainment",
    # Fitness / wellness
    "headspace", "calm", "strava", "peloton",
    # Gaming
    "playstation", "xbox", "nintendo", "steam",
}

UTILITY_MERCHANTS: set[str] = {
    # Energy
    "agl", "origin energy", "energyaustralia", "energy australia", "alinta",
    "red energy", "lumo energy", "simply energy", "powershop",
    # Telco
    "telstra", "optus", "vodafone", "tpg", "aussie broadband", "superloop",
    "belong", "amaysim", "boost mobile", "kogan mobile", "woolworths mobile",
    # Water
    "sydney water", "melbourne water", "sa water", "unity water", "urban utilities",
    # Internet
    "nbn", "iinet", "internode", "dodo",
}

INSURANCE_MERCHANTS: set[str] = {
    "nrma", "racv", "racq", "rac", "aami", "allianz", "bupa", "medibank",
    "hcf", "nib", "ahm", "australian unity", "qbe", "suncorp", "iag",
    "youi", "budget direct", "woolworths insurance", "coles insurance",
    "real insurance", "comminsure", "anz insurance",
}

RENT_KEYWORDS: set[str] = {"rent", "rental", "lease", "bond", "strata", "body corp"}

SALARY_KEYWORDS: set[str] = {
    "salary", "wages", "pay", "payroll", "income", "employer", "commission",
}


# ---------------------------------------------------------------------------
# Embedding & clustering
# ---------------------------------------------------------------------------

class TransactionEmbedder:
    """Manages sentence-transformer model for transaction description embedding."""

    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        self._model_name = model_name
        self._model = None

    def load(self) -> None:
        from sentence_transformers import SentenceTransformer
        self._model = SentenceTransformer(self._model_name)
        logger.info("Transaction embedder loaded", model=self._model_name)

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    def encode(self, descriptions: list[str]) -> np.ndarray:
        """Encode transaction descriptions into embeddings.

        Returns ndarray of shape (n, 384) for all-MiniLM-L6-v2.
        """
        if self._model is None:
            raise RuntimeError("Embedder not loaded — call load() first")
        return self._model.encode(descriptions, show_progress_bar=False, normalize_embeddings=True)


def cluster_transactions(
    embeddings: np.ndarray,
    min_cluster_size: int = 3,
) -> np.ndarray:
    """Cluster transaction embeddings using HDBSCAN.

    Args:
        embeddings: (n, d) normalized embeddings.
        min_cluster_size: minimum transactions to form a cluster.

    Returns:
        Array of cluster labels. -1 = noise (no cluster).
    """
    import hdbscan

    clusterer = hdbscan.HDBSCAN(
        min_cluster_size=min_cluster_size,
        min_samples=1,
        metric="euclidean",  # embeddings are L2-normalized so euclidean ≈ cosine
        cluster_selection_method="eom",
        allow_single_cluster=True,
    )
    labels = clusterer.fit_predict(embeddings)
    return labels


# ---------------------------------------------------------------------------
# Periodicity detection
# ---------------------------------------------------------------------------

# (min_days, max_days, max_std, period_name)
_PERIOD_RULES: list[tuple[int, int, float, str]] = [
    (5, 9, 2.0, "weekly"),
    (12, 16, 3.0, "fortnightly"),
    (25, 35, 5.0, "monthly"),
    (85, 95, 10.0, "quarterly"),
    (355, 375, 15.0, "yearly"),
]


def detect_periodicity(
    dates: list[date],
) -> Optional[tuple[str, float, float]]:
    """Detect the period of a sorted list of dates.

    Returns (period_name, median_interval, interval_std) or None if irregular.
    """
    if len(dates) < 3:
        return None

    sorted_dates = sorted(dates)
    intervals = [
        (sorted_dates[i + 1] - sorted_dates[i]).days
        for i in range(len(sorted_dates) - 1)
    ]

    if not intervals:
        return None

    median_interval = float(np.median(intervals))
    interval_std = float(np.std(intervals))

    for min_d, max_d, max_s, period_name in _PERIOD_RULES:
        if min_d <= median_interval <= max_d and interval_std < max_s:
            return period_name, median_interval, interval_std

    return None


# ---------------------------------------------------------------------------
# Amount analysis
# ---------------------------------------------------------------------------

def analyze_amounts(amounts: list[float]) -> tuple[bool, str, float]:
    """Analyze amount consistency and trend.

    Returns (is_fixed, trend_name, trend_slope).
    """
    arr = np.array(amounts, dtype=np.float64)
    mean = np.mean(arr)
    if mean == 0:
        return True, "stable", 0.0

    cv = float(np.std(arr) / abs(mean))
    is_fixed = cv < 0.05

    # Linear regression for trend
    if len(arr) >= 3:
        x = np.arange(len(arr), dtype=np.float64)
        slope = float(np.polyfit(x, arr, 1)[0])
        # Normalize slope relative to mean for classification
        rel_slope = slope / abs(mean) if mean != 0 else 0.0
        if rel_slope > 0.02:
            trend = "increasing"
        elif rel_slope < -0.02:
            trend = "decreasing"
        else:
            trend = "stable"
    else:
        slope = 0.0
        trend = "stable"

    return is_fixed, trend, slope


# ---------------------------------------------------------------------------
# Recurring type classification
# ---------------------------------------------------------------------------

def _desc_lower(description: str) -> str:
    return description.lower().strip()


def classify_recurring_type(
    description: str,
    is_debit: bool,
    period: str,
    median_amount: float,
    is_fixed_amount: bool,
) -> str:
    """Classify a recurring pattern into a type using heuristics + merchant lists.

    Returns one of: subscription, salary, rent, utility, insurance, other.
    """
    desc = _desc_lower(description)

    # Salary: credit, fortnightly/monthly, large consistent amount
    if not is_debit:
        if any(kw in desc for kw in SALARY_KEYWORDS):
            return "salary"
        # Large regular credits are likely salary even without keywords
        if period in ("fortnightly", "monthly") and median_amount > 500:
            return "salary"

    # Rent: debit, monthly, large fixed
    if is_debit and period == "monthly" and is_fixed_amount and median_amount > 200:
        if any(kw in desc for kw in RENT_KEYWORDS):
            return "rent"

    # Insurance
    if any(merchant in desc for merchant in INSURANCE_MERCHANTS):
        return "insurance"

    # Utility
    if any(merchant in desc for merchant in UTILITY_MERCHANTS):
        return "utility"

    # Subscription
    if any(merchant in desc for merchant in SUBSCRIPTION_MERCHANTS):
        return "subscription"

    # Fallback heuristics
    if is_debit and is_fixed_amount and period in ("monthly", "yearly"):
        return "subscription"

    return "other"


# ---------------------------------------------------------------------------
# Confidence scoring
# ---------------------------------------------------------------------------

def compute_confidence(
    interval_std: float,
    amount_cv: float,
    occurrence_count: int,
    period: str,
) -> float:
    """Compute confidence score for a recurring pattern.

    Factors:
    - Regularity of intervals (lower std = higher confidence)
    - Amount consistency (lower CV = higher confidence)
    - Number of occurrences (more = higher confidence)
    """
    # Interval regularity: 0-1 score based on how close std is to max allowed
    max_stds = {"weekly": 2.0, "fortnightly": 3.0, "monthly": 5.0, "quarterly": 10.0, "yearly": 15.0}
    max_s = max_stds.get(period, 5.0)
    interval_score = max(0.0, 1.0 - (interval_std / max_s))

    # Amount consistency: 0-1 (CV of 0 = 1.0, CV of 0.5+ = 0.0)
    amount_score = max(0.0, 1.0 - (amount_cv / 0.5))

    # Occurrence bonus: logarithmic, saturates around 12 occurrences
    occurrence_score = min(1.0, np.log2(occurrence_count) / np.log2(12))

    # Weighted combination
    confidence = (
        0.40 * interval_score
        + 0.25 * amount_score
        + 0.35 * occurrence_score
    )

    return round(float(np.clip(confidence, 0.0, 1.0)), 4)


# ---------------------------------------------------------------------------
# Anomaly detection for recurring patterns
# ---------------------------------------------------------------------------

def check_anomaly(
    last_date: date,
    median_interval: float,
    interval_std: float,
    today: Optional[date] = None,
) -> bool:
    """Check if the last occurrence is overdue (potential missed payment/anomaly)."""
    today = today or date.today()
    days_since_last = (today - last_date).days
    # Overdue if more than median + 2*std days have passed
    threshold = median_interval + 2 * max(interval_std, 1.0)
    return days_since_last > threshold


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

class RecurringDetector:
    """Orchestrates the full recurring detection pipeline.

    Pipeline:
    1. Embed transaction descriptions (sentence-transformers)
    2. Cluster with HDBSCAN
    3. Detect periodicity per cluster
    4. Analyze amounts
    5. Classify recurring type
    6. Score confidence
    """

    def __init__(self, embedder: Optional[TransactionEmbedder] = None):
        self._embedder = embedder or TransactionEmbedder()

    def load(self) -> None:
        if not self._embedder.is_loaded:
            self._embedder.load()

    @property
    def is_loaded(self) -> bool:
        return self._embedder.is_loaded

    def detect(
        self,
        transactions: list[dict],
        cached_embeddings: Optional[dict[str, list[float]]] = None,
        min_occurrences: int = 3,
        return_embeddings: bool = False,
        reference_date: Optional[date] = None,
    ) -> dict:
        """Run the full recurring detection pipeline.

        Args:
            transactions: List of dicts with keys: id, description, amount, date, is_debit.
            cached_embeddings: Previously computed embeddings keyed by transaction ID.
            min_occurrences: Minimum cluster size for HDBSCAN.
            return_embeddings: Whether to return embeddings for caching.
            reference_date: Date to use for anomaly detection (default: today).

        Returns:
            Dict with keys: patterns, embeddings (optional), processing_time_ms,
            transactions_analyzed, clusters_found.
        """
        start = time.time()

        if not transactions:
            return {
                "patterns": [],
                "embeddings": None,
                "processing_time_ms": 0,
                "transactions_analyzed": 0,
                "clusters_found": 0,
            }

        # Step 1: Build embeddings (incremental if cache provided)
        descriptions = [t["description"] for t in transactions]
        tx_ids = [t["id"] for t in transactions]

        if cached_embeddings:
            # Split into cached and new
            new_indices = [
                i for i, tid in enumerate(tx_ids) if tid not in cached_embeddings
            ]
            cached_indices = [
                i for i, tid in enumerate(tx_ids) if tid in cached_embeddings
            ]

            if new_indices:
                new_descs = [descriptions[i] for i in new_indices]
                new_embs = self._embedder.encode(new_descs)
            else:
                new_embs = np.empty((0, 384))

            # Assemble full embedding matrix
            dim = 384
            embeddings = np.zeros((len(transactions), dim), dtype=np.float32)
            for idx in cached_indices:
                embeddings[idx] = np.array(
                    cached_embeddings[tx_ids[idx]], dtype=np.float32
                )
            for j, idx in enumerate(new_indices):
                embeddings[idx] = new_embs[j]

            logger.info(
                "Incremental embedding",
                cached=len(cached_indices),
                new=len(new_indices),
            )
        else:
            embeddings = self._embedder.encode(descriptions)

        # Step 2: Cluster
        labels = cluster_transactions(embeddings, min_cluster_size=min_occurrences)

        # Group transactions by cluster label
        clusters: dict[int, list[int]] = defaultdict(list)
        for i, label in enumerate(labels):
            if label >= 0:  # skip noise (-1)
                clusters[label].append(i)

        logger.info(
            "Clustering complete",
            total_transactions=len(transactions),
            clusters=len(clusters),
            noise=int(np.sum(labels == -1)),
        )

        # Step 3-6: Analyze each cluster
        patterns = []
        for cluster_id, indices in clusters.items():
            cluster_txs = [transactions[i] for i in indices]
            cluster_dates = [t["date"] for t in cluster_txs]

            # Ensure dates are date objects
            parsed_dates = []
            for d in cluster_dates:
                if isinstance(d, str):
                    parsed_dates.append(date.fromisoformat(d))
                else:
                    parsed_dates.append(d)

            # Step 3: Periodicity
            period_result = detect_periodicity(parsed_dates)
            if period_result is None:
                continue  # irregular cluster, skip

            period_name, median_interval, interval_std = period_result

            # Step 4: Amount analysis
            amounts = [abs(t["amount"]) for t in cluster_txs]
            is_fixed, trend_name, trend_slope = analyze_amounts(amounts)

            # Determine representative description (most common)
            desc_counts: dict[str, int] = defaultdict(int)
            for t in cluster_txs:
                desc_counts[t["description"]] += 1
            representative_desc = max(desc_counts, key=desc_counts.get)

            # Determine if debit (majority vote)
            debit_count = sum(1 for t in cluster_txs if t.get("is_debit", True))
            is_debit = debit_count > len(cluster_txs) / 2

            median_amount = float(np.median(amounts))

            # Step 5: Classification
            rec_type = classify_recurring_type(
                representative_desc, is_debit, period_name, median_amount, is_fixed
            )

            # Step 6: Confidence
            mean_amount = float(np.mean(amounts))
            amount_cv = float(np.std(amounts) / abs(mean_amount)) if mean_amount != 0 else 0.0
            confidence = compute_confidence(
                interval_std, amount_cv, len(cluster_txs), period_name
            )

            sorted_dates = sorted(parsed_dates)
            last_date = sorted_dates[-1]
            next_expected = last_date + timedelta(days=int(round(median_interval)))

            # Anomaly check
            anomaly = check_anomaly(
                last_date, median_interval, interval_std, today=reference_date
            )

            patterns.append({
                "description": representative_desc,
                "period": period_name,
                "recurrence_type": rec_type,
                "median_amount": round(median_amount, 2),
                "median_interval_days": round(median_interval, 1),
                "amount_trend": trend_name,
                "amount_trend_slope": round(trend_slope, 4),
                "is_fixed_amount": is_fixed,
                "next_expected_date": next_expected.isoformat(),
                "last_seen_date": last_date.isoformat(),
                "confidence": confidence,
                "anomaly_flag": anomaly,
                "transaction_ids": [cluster_txs[j]["id"] for j in range(len(cluster_txs))],
                "occurrence_count": len(cluster_txs),
            })

        # Sort by confidence descending
        patterns.sort(key=lambda p: p["confidence"], reverse=True)

        # Build embeddings cache if requested
        emb_cache = None
        if return_embeddings:
            emb_cache = {
                tx_ids[i]: embeddings[i].tolist() for i in range(len(tx_ids))
            }

        elapsed_ms = int((time.time() - start) * 1000)

        return {
            "patterns": patterns,
            "embeddings": emb_cache,
            "processing_time_ms": elapsed_ms,
            "transactions_analyzed": len(transactions),
            "clusters_found": len(clusters),
        }
