"""Schema definitions for recurring transaction detection."""

import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class RecurrencePeriod(str, Enum):
    """Detected recurrence period."""

    WEEKLY = "weekly"
    FORTNIGHTLY = "fortnightly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    YEARLY = "yearly"


class RecurrenceType(str, Enum):
    """Classification of recurring transaction type."""

    SUBSCRIPTION = "subscription"
    SALARY = "salary"
    RENT = "rent"
    UTILITY = "utility"
    INSURANCE = "insurance"
    OTHER = "other"


class AmountTrend(str, Enum):
    """Trend direction for recurring amounts."""

    STABLE = "stable"
    INCREASING = "increasing"
    DECREASING = "decreasing"


class TransactionInput(BaseModel):
    """A single transaction for recurring detection input."""

    id: str = Field(description="Transaction ID")
    description: str = Field(description="Transaction description / merchant name")
    amount: float = Field(description="Transaction amount (positive = debit, negative = credit)")
    date: datetime.date = Field(description="Transaction date")
    is_debit: bool = Field(default=True, description="True if money going out")
    category: Optional[str] = Field(default=None, description="Existing category if known")


class RecurringPattern(BaseModel):
    """A detected recurring transaction pattern."""

    description: str = Field(description="Representative description for this recurring group")
    period: RecurrencePeriod = Field(description="Detected recurrence period")
    recurrence_type: RecurrenceType = Field(description="Classification of recurring type")
    median_amount: float = Field(description="Median transaction amount")
    median_interval_days: float = Field(description="Median interval between occurrences in days")
    amount_trend: AmountTrend = Field(description="Trend direction of amounts over time")
    amount_trend_slope: float = Field(
        default=0.0, description="Linear regression slope of amounts ($/period)"
    )
    is_fixed_amount: bool = Field(description="True if amount varies less than 5%")
    next_expected_date: datetime.date = Field(description="Predicted date of next occurrence")
    last_seen_date: datetime.date = Field(description="Date of most recent occurrence")
    confidence: float = Field(ge=0.0, le=1.0, description="Detection confidence score")
    anomaly_flag: bool = Field(
        default=False,
        description="True if last occurrence was missed or amount changed significantly",
    )
    transaction_ids: list[str] = Field(description="IDs of transactions in this recurring group")
    occurrence_count: int = Field(description="Number of detected occurrences")


class RecurringRequest(BaseModel):
    """Request for recurring transaction detection."""

    transactions: list[TransactionInput] = Field(
        description="List of transactions to analyze", min_length=1
    )
    cached_embeddings: Optional[dict[str, list[float]]] = Field(
        default=None,
        description="Cached embeddings from previous run, keyed by transaction ID",
    )
    min_occurrences: int = Field(
        default=3, ge=2, description="Minimum occurrences to consider recurring"
    )


class RecurringResponse(BaseModel):
    """Response from recurring transaction detection."""

    patterns: list[RecurringPattern] = Field(
        default_factory=list, description="Detected recurring patterns"
    )
    embeddings: Optional[dict[str, list[float]]] = Field(
        default=None,
        description="Transaction embeddings for incremental caching (only if return_embeddings=True)",
    )
    processing_time_ms: int = Field(description="Processing time in milliseconds")
    transactions_analyzed: int = Field(description="Number of transactions analyzed")
    clusters_found: int = Field(description="Number of transaction clusters found")
