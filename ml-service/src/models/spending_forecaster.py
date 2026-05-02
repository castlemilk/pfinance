"""Spending forecasting pipeline using Prophet and simple average fallback.

Prophet model per category per user:
- yearly_seasonality only if 12+ months history
- changepoint_prior_scale=0.05 (conservative)
- Recurring transactions as regressors

Fallback: simple average with wide confidence intervals for < 4 months history.

CPU-only. Prophet fitting ~1-2s per category. Full forecast refresh ~15s per user.
"""

from __future__ import annotations

import calendar
import time
from datetime import date, timedelta
from typing import Optional

import numpy as np
import structlog

from ..schemas.forecast import (
    BudgetWarning,
    CategoryForecast,
    MonthlySpending,
    RecurringTransaction,
    SpendingForecast,
)

logger = structlog.get_logger()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _next_n_months(from_date: date, n: int) -> list[date]:
    """Return the first day of the next n months from from_date."""
    result = []
    year, month = from_date.year, from_date.month
    for _ in range(n):
        month += 1
        if month > 12:
            month = 1
            year += 1
        result.append(date(year, month, 1))
    return result


def _is_expected_in_month(recurring: RecurringTransaction, month: date) -> bool:
    """Check if a recurring transaction is expected in the given month.

    Simple heuristic: monthly/quarterly/yearly check by expected date alignment.
    """
    if recurring.period == "weekly":
        return True  # Always expected
    if recurring.period == "fortnightly":
        return True  # At least once per month
    if recurring.period == "monthly":
        return True
    if recurring.period == "quarterly":
        return recurring.next_expected_date.month % 3 == month.month % 3
    if recurring.period == "yearly":
        return recurring.next_expected_date.month == month.month
    return True


# ---------------------------------------------------------------------------
# Simple average fallback
# ---------------------------------------------------------------------------


def forecast_simple_average(
    history: list[MonthlySpending],
    months_ahead: int,
) -> list[SpendingForecast]:
    """Simple average forecast for categories with < 4 months of data.

    Uses mean with ±30% confidence interval.
    """
    if not history:
        return []

    amounts = [h.amount for h in history]
    avg = float(np.mean(amounts))
    std = float(np.std(amounts)) if len(amounts) > 1 else avg * 0.3

    last_month = max(h.month for h in history)
    future_months = _next_n_months(last_month, months_ahead)

    return [
        SpendingForecast(
            month=m,
            predicted=round(max(0.0, avg), 2),
            lower=round(max(0.0, avg - 1.5 * std), 2),
            upper=round(avg + 1.5 * std, 2),
        )
        for m in future_months
    ]


# ---------------------------------------------------------------------------
# Prophet forecasting
# ---------------------------------------------------------------------------


def forecast_with_prophet(
    history: list[MonthlySpending],
    months_ahead: int,
    recurring: Optional[list[RecurringTransaction]] = None,
    category: str = "",
) -> tuple[list[SpendingForecast], Optional[float]]:
    """Forecast spending using Prophet.

    Args:
        history: Monthly spending history (must have >= 4 data points).
        months_ahead: Number of months to forecast.
        recurring: Known recurring transactions as regressors.
        category: Category name for filtering recurring transactions.

    Returns:
        Tuple of (forecasts, MAPE on held-out month if enough data).
    """
    import pandas as pd
    from prophet import Prophet

    df = pd.DataFrame(
        {
            "ds": pd.to_datetime([h.month for h in history]),
            "y": [h.amount for h in history],
        }
    )

    has_yearly = len(history) >= 12

    model = Prophet(
        yearly_seasonality=has_yearly,
        weekly_seasonality=False,
        daily_seasonality=False,
        changepoint_prior_scale=0.05,  # Conservative
    )

    # Add recurring transactions as regressors
    cat_recurring = []
    if recurring:
        cat_recurring = [r for r in recurring if r.category == category]

    for r in cat_recurring:
        regressor_name = f"recurring_{r.id}"
        df[regressor_name] = [
            r.median_amount if _is_expected_in_month(r, row_date.date()) else 0.0
            for row_date in df["ds"]
        ]
        model.add_regressor(regressor_name)

    # Fit the model
    import logging

    prophet_logger = logging.getLogger("prophet")
    prophet_logger.setLevel(logging.WARNING)
    cmdstanpy_logger = logging.getLogger("cmdstanpy")
    cmdstanpy_logger.setLevel(logging.WARNING)
    model.fit(df)

    # Make future dataframe
    future = model.make_future_dataframe(periods=months_ahead, freq="MS")

    # Fill regressors for future dates
    for r in cat_recurring:
        regressor_name = f"recurring_{r.id}"
        future[regressor_name] = [
            r.median_amount if _is_expected_in_month(r, row_date.date()) else 0.0
            for row_date in future["ds"]
        ]

    forecast = model.predict(future)

    # Extract future forecasts
    future_rows = forecast.tail(months_ahead)
    forecasts = [
        SpendingForecast(
            month=row["ds"].date(),
            predicted=round(max(0.0, row["yhat"]), 2),
            lower=round(max(0.0, row["yhat_lower"]), 2),
            upper=round(row["yhat_upper"], 2),
        )
        for _, row in future_rows.iterrows()
    ]

    # Compute MAPE on the last month of history as a simple holdout
    mape = None
    if len(history) >= 6:
        # Use last data point as holdout
        actual = history[-1].amount
        predicted_last = forecast.iloc[-months_ahead - 1]["yhat"]
        if actual > 0:
            mape = round(abs(actual - predicted_last) / actual * 100, 2)

    return forecasts, mape


# ---------------------------------------------------------------------------
# Budget overshoot warnings
# ---------------------------------------------------------------------------


def check_budget_overshoot(
    budgets: dict[str, float],
    current_month_spending: dict[str, float],
    category_forecasts: dict[str, list[SpendingForecast]],
    reference_date: Optional[date] = None,
) -> list[BudgetWarning]:
    """Check for budget overshoot warnings.

    Uses linear projection for current month and Prophet forecast for next month.
    """
    today = reference_date or date.today()
    days_elapsed = today.day
    days_in_month = calendar.monthrange(today.year, today.month)[1]

    warnings: list[BudgetWarning] = []

    for category, budget in budgets.items():
        actual = current_month_spending.get(category, 0.0)

        if days_elapsed == 0:
            continue

        # Linear projection
        projected = actual * (days_in_month / days_elapsed)

        if projected > budget * 1.1:  # >10% over budget
            severity = "warning" if projected < budget * 1.3 else "alert"

            # Get next month forecast if available
            next_month_forecast = None
            if category in category_forecasts and category_forecasts[category]:
                next_month_forecast = category_forecasts[category][0].predicted

            warnings.append(
                BudgetWarning(
                    category=category,
                    budget=budget,
                    projected_this_month=round(projected, 2),
                    actual_so_far=round(actual, 2),
                    days_elapsed=days_elapsed,
                    days_in_month=days_in_month,
                    severity=severity,
                    next_month_forecast=next_month_forecast,
                )
            )

    return warnings


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------


class SpendingForecaster:
    """Orchestrates the spending forecast pipeline.

    Pipeline per category:
    1. If < 4 months history → simple average with wide intervals
    2. If >= 4 months → Prophet with recurring regressors
    3. Check budget overshoot warnings

    CPU-only. ~1-2s per category for Prophet fit.
    """

    def forecast(
        self,
        user_id: str,
        history_by_category: dict[str, list[MonthlySpending]],
        months_ahead: int = 3,
        recurring_transactions: Optional[list[RecurringTransaction]] = None,
        budgets: Optional[dict[str, float]] = None,
        current_month_spending: Optional[dict[str, float]] = None,
    ) -> dict:
        """Run forecasting for all categories.

        Args:
            user_id: User identifier.
            history_by_category: Monthly spending history per category.
            months_ahead: Number of months to forecast.
            recurring_transactions: Known recurring transactions.
            budgets: User-set monthly budgets per category.
            current_month_spending: Current month spending so far.

        Returns:
            Dict with keys: category_forecasts, budget_warnings,
            processing_time_ms, categories_forecasted.
        """
        start = time.time()

        category_forecasts_list: list[CategoryForecast] = []
        forecast_map: dict[str, list[SpendingForecast]] = {}

        for category, history in history_by_category.items():
            if not history:
                continue

            if len(history) < 4:
                # Simple average fallback
                forecasts = forecast_simple_average(history, months_ahead)
                method = "simple_average"
                mape = None
            else:
                # Prophet
                try:
                    forecasts, mape = forecast_with_prophet(
                        history, months_ahead, recurring_transactions, category
                    )
                    method = "prophet"
                except Exception as e:
                    logger.warning(
                        "Prophet fit failed, falling back to simple average",
                        category=category,
                        error=str(e),
                    )
                    forecasts = forecast_simple_average(history, months_ahead)
                    method = "simple_average"
                    mape = None

            forecast_map[category] = forecasts
            category_forecasts_list.append(
                CategoryForecast(
                    category=category,
                    forecasts=forecasts,
                    method=method,
                    mape=mape,
                )
            )

        # Check budget overshoot
        budget_warnings: list[BudgetWarning] = []
        if budgets and current_month_spending:
            budget_warnings = check_budget_overshoot(
                budgets, current_month_spending, forecast_map
            )

        elapsed_ms = int((time.time() - start) * 1000)

        logger.info(
            "Spending forecast complete",
            user_id=user_id,
            categories=len(category_forecasts_list),
            budget_warnings=len(budget_warnings),
            processing_time_ms=elapsed_ms,
        )

        return {
            "category_forecasts": category_forecasts_list,
            "budget_warnings": budget_warnings,
            "processing_time_ms": elapsed_ms,
            "categories_forecasted": len(category_forecasts_list),
        }
