"""
Modal serverless deployment for CPU-only ML services:
- Spending anomaly detection (z-score)
- Spending forecasting (Prophet)

Deploy with:
    modal deploy modal_app_cpu.py

Test locally:
    modal run modal_app_cpu.py

Estimated costs:
    - CPU container: ~$0.03/hr
    - Per anomaly detection request: ~$0.00001
    - Per forecast request (10 categories): ~$0.0001
    - Nightly batch (100 users): ~$0.05
"""

import modal

app = modal.App("pfinance-ml-cpu")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "fastapi>=0.104.0",
        "uvicorn[standard]>=0.24.0",
        "pydantic>=2.5.0",
        "numpy>=1.24.0",
        "scikit-learn>=1.3.0",
        "prophet>=1.1.0",
        "pandas>=2.0.0",
        "structlog>=23.2.0",
    )
    .run_commands(
        # Pre-compile Prophet's Stan model during build
        "python -c \"from prophet import Prophet; m = Prophet(); print('Prophet ready')\""
    )
)


@app.cls(
    image=image,
    cpu=2,  # 2 vCPUs for Prophet fitting
    memory=2048,  # 2GB RAM
    timeout=60,
    container_idle_timeout=300,  # Keep warm for 5 min (CPU containers are cheap)
    allow_concurrent_inputs=10,  # Handle multiple requests
)
class MLCPUService:
    """CPU-only ML service for anomaly detection and forecasting."""

    @modal.enter()
    def setup(self):
        """Initialize models on container start."""
        from src.models.anomaly_detector import AnomalyDetector
        from src.models.spending_forecaster import SpendingForecaster

        self.anomaly_detector = AnomalyDetector()
        self.spending_forecaster = SpendingForecaster()
        print("CPU ML models loaded")

    @modal.web_endpoint(method="POST", label="detect-anomalies")
    def detect_anomalies(self, request: dict):
        """Detect spending anomalies."""
        from src.schemas.anomaly import AnomalyDetectionRequest

        req = AnomalyDetectionRequest(**request)
        result = self.anomaly_detector.detect(
            user_id=req.user_id,
            transactions=req.transactions,
            history=req.history,
            current_month_spending=req.current_month_spending,
        )

        return {
            "anomalies": [a.model_dump() for a in result["anomalies"]],
            "profile": result["profile"].model_dump(),
            "processing_time_ms": result["processing_time_ms"],
            "transactions_checked": result["transactions_checked"],
        }

    @modal.web_endpoint(method="POST", label="forecast-spending")
    def forecast_spending(self, request: dict):
        """Forecast spending per category."""
        from src.schemas.forecast import ForecastRequest

        req = ForecastRequest(**request)
        result = self.spending_forecaster.forecast(
            user_id=req.user_id,
            history_by_category=req.history_by_category,
            months_ahead=req.months_ahead,
            recurring_transactions=req.recurring_transactions,
            budgets=req.budgets,
            current_month_spending=req.current_month_spending,
        )

        return {
            "category_forecasts": [f.model_dump() for f in result["category_forecasts"]],
            "budget_warnings": [w.model_dump() for w in result["budget_warnings"]],
            "processing_time_ms": result["processing_time_ms"],
            "categories_forecasted": result["categories_forecasted"],
        }

    @modal.web_endpoint(method="GET", label="health")
    def health(self):
        """Health check."""
        return {
            "status": "healthy",
            "models": ["anomaly_detector", "spending_forecaster"],
            "version": "0.1.0",
        }
