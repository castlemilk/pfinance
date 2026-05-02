"""Schema definitions for spending anomaly detection."""

import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class AnomalySeverity(str, Enum):
    """Anomaly severity level."""

    INFO = "info"  # In-app only, no push
    WARNING = "warning"  # Push notification
    ALERT = "alert"  # Push notification with emphasis


class AnomalyType(str, Enum):
    """Type of detected spending anomaly."""

    LARGE_TRANSACTION = "large_transaction"  # Single txn >> user's typical
    HIGH_MONTHLY_SPENDING = "high_monthly_spending"  # Category total >> usual
    NEW_CATEGORY = "new_category"  # First transaction in a category
    MERCHANT_ANOMALY = "merchant_anomaly"  # Amount >> typical for this merchant


class CategoryStats(BaseModel):
    """Rolling statistics for a single spending category."""

    category: str = Field(description="Category name")
    monthly_mean: float = Field(description="Mean monthly spending")
    monthly_std: float = Field(description="Std deviation of monthly spending")
    monthly_median: float = Field(description="Median monthly spending")
    transaction_count_mean: float = Field(description="Mean transaction count per month")
    largest_single_transaction: float = Field(description="Largest single transaction seen")


class MerchantStats(BaseModel):
    """Rolling statistics for a specific merchant."""

    merchant: str = Field(description="Merchant name")
    mean_amount: float = Field(description="Mean transaction amount")
    std_amount: float = Field(description="Std deviation of amount")
    transaction_count: int = Field(description="Total transactions seen")


class SpendingProfile(BaseModel):
    """Per-user spending profile with rolling statistics."""

    user_id: str = Field(description="User ID")
    category_stats: dict[str, CategoryStats] = Field(
        default_factory=dict, description="Statistics per category"
    )
    merchant_stats: dict[str, MerchantStats] = Field(
        default_factory=dict, description="Statistics per merchant"
    )
    last_updated: datetime.datetime = Field(description="When profile was last computed")
    months_of_data: int = Field(default=0, description="Number of months in the rolling window")


class Anomaly(BaseModel):
    """A detected spending anomaly."""

    type: AnomalyType = Field(description="Anomaly type")
    severity: AnomalySeverity = Field(description="Severity level")
    message: str = Field(description="Human-readable description")
    category: Optional[str] = Field(default=None, description="Affected category")
    merchant: Optional[str] = Field(default=None, description="Affected merchant")
    amount: Optional[float] = Field(default=None, description="Transaction amount triggering anomaly")
    z_score: Optional[float] = Field(default=None, description="Z-score if applicable")
    current_month_total: Optional[float] = Field(
        default=None, description="Current month spending for the category"
    )


class TransactionInput(BaseModel):
    """A single transaction for anomaly detection."""

    id: str = Field(description="Transaction ID")
    description: str = Field(description="Transaction description / merchant")
    amount: float = Field(description="Transaction amount (positive)")
    date: datetime.date = Field(description="Transaction date")
    category: str = Field(description="Expense category")
    merchant: Optional[str] = Field(default=None, description="Normalized merchant name")
    is_debit: bool = Field(default=True, description="True if money going out")


class AnomalyDetectionRequest(BaseModel):
    """Request for anomaly detection."""

    user_id: str = Field(description="User ID for profile lookup")
    transactions: list[TransactionInput] = Field(
        description="New transactions to check for anomalies", min_length=1
    )
    history: list[TransactionInput] = Field(
        description="Historical transactions for building the spending profile (6-month window)"
    )
    current_month_spending: Optional[dict[str, float]] = Field(
        default=None,
        description="Pre-computed current month totals per category (optimization)",
    )


class AnomalyDetectionResponse(BaseModel):
    """Response from anomaly detection."""

    anomalies: list[Anomaly] = Field(default_factory=list, description="Detected anomalies")
    profile: SpendingProfile = Field(description="Computed spending profile")
    processing_time_ms: int = Field(description="Processing time in milliseconds")
    transactions_checked: int = Field(description="Number of transactions checked")
