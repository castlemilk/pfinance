"""Schema definitions for spending forecasting."""

import datetime
from typing import Optional

from pydantic import BaseModel, Field


class MonthlySpending(BaseModel):
    """Monthly spending data point for a category."""

    month: datetime.date = Field(description="First day of the month (YYYY-MM-01)")
    amount: float = Field(ge=0, description="Total spending for this month")


class RecurringTransaction(BaseModel):
    """Known recurring transaction for use as a regressor."""

    id: str = Field(description="Recurring pattern ID")
    category: str = Field(description="Category this recurring belongs to")
    median_amount: float = Field(description="Median amount of this recurring")
    period: str = Field(description="Recurrence period: weekly, fortnightly, monthly, etc.")
    next_expected_date: datetime.date = Field(description="Next expected occurrence date")


class SpendingForecast(BaseModel):
    """Forecast for a single future month in a category."""

    month: datetime.date = Field(description="Forecasted month (YYYY-MM-01)")
    predicted: float = Field(ge=0, description="Predicted spending amount")
    lower: float = Field(ge=0, description="Lower bound of confidence interval")
    upper: float = Field(description="Upper bound of confidence interval")


class BudgetWarning(BaseModel):
    """Warning for predicted budget overshoot."""

    category: str = Field(description="Category that may overshoot")
    budget: float = Field(description="User-set monthly budget")
    projected_this_month: float = Field(description="Linear projection for current month")
    actual_so_far: float = Field(description="Actual spending so far this month")
    days_elapsed: int = Field(description="Days elapsed in current month")
    days_in_month: int = Field(description="Total days in current month")
    severity: str = Field(description="warning or alert")
    next_month_forecast: Optional[float] = Field(
        default=None, description="Prophet forecast for next month"
    )


class ForecastRequest(BaseModel):
    """Request for spending forecasting."""

    user_id: str = Field(description="User ID")
    history_by_category: dict[str, list[MonthlySpending]] = Field(
        description="Monthly spending history per category"
    )
    months_ahead: int = Field(default=3, ge=1, le=12, description="Months to forecast")
    recurring_transactions: Optional[list[RecurringTransaction]] = Field(
        default=None, description="Known recurring transactions as regressors"
    )
    budgets: Optional[dict[str, float]] = Field(
        default=None, description="User-set monthly budgets per category"
    )
    current_month_spending: Optional[dict[str, float]] = Field(
        default=None, description="Current month spending so far per category"
    )


class CategoryForecast(BaseModel):
    """Forecast results for a single category."""

    category: str = Field(description="Category name")
    forecasts: list[SpendingForecast] = Field(description="Monthly forecasts")
    method: str = Field(description="Method used: prophet or simple_average")
    mape: Optional[float] = Field(
        default=None, description="Mean Absolute Percentage Error on held-out data"
    )


class ForecastResponse(BaseModel):
    """Response from spending forecasting."""

    category_forecasts: list[CategoryForecast] = Field(
        default_factory=list, description="Forecasts per category"
    )
    budget_warnings: list[BudgetWarning] = Field(
        default_factory=list, description="Budget overshoot warnings"
    )
    processing_time_ms: int = Field(description="Processing time in milliseconds")
    categories_forecasted: int = Field(description="Number of categories forecasted")
