"""ML Service FastAPI Application.

Self-hosted document extraction service using Qwen2-VL or DeepSeek-OCR models,
plus lightweight SigLIP-based receipt extraction with confidence-based routing.
"""

import io
import os
import time
from contextlib import asynccontextmanager
from typing import Annotated, Optional, Union

import structlog
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

from .models.base import BaseOCRModel

# Try to import MLX model first (best for Mac), fall back to PyTorch
try:
    from .models.qwen_vl_mlx import Qwen2VLMLXModel
    HAS_MLX = True
except ImportError:
    HAS_MLX = False

from .models.qwen_vl import Qwen2VLModel
from .schemas import (
    DocumentType,
    ExtractionResponse,
    HealthResponse,
)
from .schemas.receipt_lightweight import (
    FieldConfidence,
    LightweightReceiptResponse,
)
from .schemas.recurring import (
    RecurringRequest,
    RecurringResponse,
    RecurringPattern,
)
from .schemas.anomaly import (
    AnomalyDetectionRequest,
    AnomalyDetectionResponse,
)
from .schemas.forecast import (
    ForecastRequest,
    ForecastResponse,
)

# Configure structured logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()

# Global model instances
_model: BaseOCRModel | None = None
_siglip_pipeline = None  # SigLIPReceiptPipeline, lazy import
_recurring_detector = None  # RecurringDetector, lazy import
_anomaly_detector = None  # AnomalyDetector, lazy import
_spending_forecaster = None  # SpendingForecaster, lazy import


def get_model() -> BaseOCRModel:
    """Get the loaded model instance."""
    global _model
    if _model is None:
        raise RuntimeError("Model not loaded")
    return _model


def get_siglip_pipeline():
    """Get the loaded SigLIP pipeline instance."""
    global _siglip_pipeline
    if _siglip_pipeline is None:
        raise RuntimeError("SigLIP pipeline not loaded")
    return _siglip_pipeline


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager - load model on startup."""
    global _model

    logger.info("Starting ML service...")

    # Get configuration from environment
    use_mlx = os.getenv("USE_MLX", "auto").lower()  # auto, true, false
    model_size = os.getenv("MODEL_SIZE", "7b")  # 2b or 7b

    # Auto-detect best backend
    if use_mlx == "auto":
        # Use MLX on Mac if available (much faster and more accurate for 7B)
        import platform
        use_mlx = HAS_MLX and platform.system() == "Darwin"
    else:
        use_mlx = use_mlx == "true"

    if use_mlx and HAS_MLX:
        logger.info("Using MLX backend (Apple Silicon native)")
        _model = Qwen2VLMLXModel(
            model_id=f"Qwen/Qwen2-VL-{model_size.upper()}-Instruct"
        )
    else:
        logger.info("Using PyTorch backend")
        _model = Qwen2VLModel(model_size=model_size)

    # Optionally preload model on startup
    if os.getenv("PRELOAD_MODEL", "false").lower() == "true":
        logger.info("Preloading model on startup...")
        await _model.load()

    logger.info("ML service started", backend="mlx" if use_mlx else "pytorch")

    # Load SigLIP lightweight pipeline if enabled
    global _siglip_pipeline
    if os.getenv("ENABLE_SIGLIP", "false").lower() == "true":
        try:
            from .models.receipt_siglip import SigLIPReceiptPipeline

            weights_dir = os.getenv("SIGLIP_WEIGHTS_DIR", None)
            _siglip_pipeline = SigLIPReceiptPipeline(weights_dir=weights_dir)
            _siglip_pipeline.load()
            logger.info("SigLIP receipt pipeline loaded", weights_dir=weights_dir)
        except Exception as e:
            logger.error("Failed to load SigLIP pipeline", error=str(e))
            _siglip_pipeline = None

    # Load recurring transaction detector if enabled
    global _recurring_detector
    if os.getenv("ENABLE_RECURRING", "true").lower() == "true":
        try:
            from .models.recurring_detector import RecurringDetector

            _recurring_detector = RecurringDetector()
            _recurring_detector.load()
            logger.info("Recurring transaction detector loaded")
        except Exception as e:
            logger.error("Failed to load recurring detector", error=str(e))
            _recurring_detector = None

    # Load anomaly detector (CPU-only, always available)
    global _anomaly_detector
    try:
        from .models.anomaly_detector import AnomalyDetector

        _anomaly_detector = AnomalyDetector()
        logger.info("Anomaly detector loaded")
    except Exception as e:
        logger.error("Failed to load anomaly detector", error=str(e))
        _anomaly_detector = None

    # Load spending forecaster (CPU-only, requires prophet)
    global _spending_forecaster
    if os.getenv("ENABLE_FORECASTER", "true").lower() == "true":
        try:
            from .models.spending_forecaster import SpendingForecaster

            _spending_forecaster = SpendingForecaster()
            logger.info("Spending forecaster loaded")
        except Exception as e:
            logger.error("Failed to load spending forecaster", error=str(e))
            _spending_forecaster = None

    yield

    # Cleanup on shutdown
    logger.info("Shutting down ML service...")
    _model = None
    _siglip_pipeline = None
    _recurring_detector = None
    _anomaly_detector = None
    _spending_forecaster = None


# Create FastAPI application
app = FastAPI(
    title="PFinance ML Extraction Service",
    description="Self-hosted document extraction using open-source OCR/VLM models",
    version="0.1.0",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Health check endpoint."""
    model = get_model()
    return HealthResponse(
        status="healthy",
        model_loaded=model.is_loaded,
        model_name=model.model_name,
        version="0.1.0",
    )


@app.post("/extract", response_model=ExtractionResponse)
async def extract_document(
    file: Annotated[UploadFile, File(description="Document file (image or PDF)")],
    document_type: Annotated[
        str, Form(description="Document type: receipt, bank_statement, invoice")
    ] = "receipt",
) -> ExtractionResponse:
    """
    Extract transactions from a document.

    Supports:
    - Image files (JPEG, PNG, WebP)
    - PDF documents

    Returns extracted transactions with confidence scores.
    """
    start_time = time.time()

    # Validate document type
    try:
        doc_type = DocumentType(document_type)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid document type: {document_type}. Must be one of: receipt, bank_statement, invoice",
        )

    # Read file content
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file uploaded")

    logger.info(
        "Processing document",
        filename=file.filename,
        content_type=file.content_type,
        size_bytes=len(content),
        document_type=doc_type.value,
    )

    model = get_model()
    warnings: list[str] = []

    try:
        # Determine if PDF or image
        content_type = file.content_type or ""
        filename = file.filename or ""

        if content_type == "application/pdf" or filename.lower().endswith(".pdf"):
            # Process PDF
            transactions, confidence, page_count = await model.extract_from_pdf(
                content, doc_type
            )
        else:
            # Process as image
            try:
                image = Image.open(io.BytesIO(content))
                # Convert to RGB if necessary
                if image.mode != "RGB":
                    image = image.convert("RGB")
            except Exception as e:
                raise HTTPException(
                    status_code=400, detail=f"Invalid image file: {e}"
                )

            transactions, confidence = await model.extract_from_image(image, doc_type)
            page_count = 1

        processing_time_ms = int((time.time() - start_time) * 1000)

        logger.info(
            "Extraction complete",
            transaction_count=len(transactions),
            confidence=confidence,
            processing_time_ms=processing_time_ms,
        )

        return ExtractionResponse(
            transactions=transactions,
            overall_confidence=confidence,
            model_used=model.model_name,
            processing_time_ms=processing_time_ms,
            warnings=warnings,
            document_type=doc_type,
            page_count=page_count,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Extraction failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"Extraction failed: {e}")


@app.post("/extract/batch")
async def extract_batch(
    files: Annotated[list[UploadFile], File(description="Multiple document files")],
    document_type: Annotated[str, Form()] = "receipt",
) -> list[ExtractionResponse]:
    """
    Extract transactions from multiple documents.

    Processes files sequentially and returns results for each.
    """
    results: list[ExtractionResponse] = []

    for file in files:
        try:
            result = await extract_document(file, document_type)
            results.append(result)
        except HTTPException as e:
            # Add error result for this file
            results.append(
                ExtractionResponse(
                    transactions=[],
                    overall_confidence=0.0,
                    model_used=get_model().model_name,
                    processing_time_ms=0,
                    warnings=[f"Failed to process {file.filename}: {e.detail}"],
                    document_type=DocumentType(document_type),
                    page_count=0,
                )
            )

    return results


@app.post("/v1/parse-receipt-lightweight", response_model=LightweightReceiptResponse)
async def parse_receipt_lightweight(
    file: Annotated[UploadFile, File(description="Receipt image file")],
    force_tier: Annotated[
        Optional[int], Form(description="Force routing tier (1-3) for testing")
    ] = None,
    ab_test_group: Annotated[
        Optional[str], Form(description="A/B test group identifier")
    ] = None,
) -> LightweightReceiptResponse:
    """Lightweight receipt extraction with confidence-based routing.

    Three-tier routing:
      Tier 1 — SigLIP heads (~25ms, ~$0.0003/receipt)
      Tier 2 — Qwen2-VL-7B (~200ms, ~$0.002-0.003/receipt)
      Tier 3 — Gemini Flash (~1-3s, ~$0.005/receipt)

    Returns structured receipt data with per-field confidence scores.
    """
    start_time = time.time()

    # Read and validate image
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file uploaded")

    try:
        image = Image.open(io.BytesIO(content)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image file: {e}")

    logger.info(
        "Lightweight receipt extraction",
        filename=file.filename,
        size_bytes=len(content),
        force_tier=force_tier,
        ab_test_group=ab_test_group,
    )

    # Tier 1: SigLIP lightweight extraction
    siglip_result = None
    if _siglip_pipeline is not None and force_tier in (None, 1):
        try:
            siglip_result = _siglip_pipeline.extract(image)

            if not _siglip_pipeline.should_escalate(siglip_result) or force_tier == 1:
                processing_time_ms = int((time.time() - start_time) * 1000)
                return LightweightReceiptResponse(
                    merchant=FieldConfidence(
                        value=str(siglip_result.merchant.value),
                        confidence=siglip_result.merchant.confidence,
                        source="siglip",
                    ),
                    amount=FieldConfidence(
                        value=str(siglip_result.amount.value),
                        confidence=siglip_result.amount.confidence,
                        source="siglip",
                    ),
                    date=FieldConfidence(
                        value=str(siglip_result.date.value),
                        confidence=siglip_result.date.confidence,
                        source="siglip",
                    ),
                    line_items_detected=siglip_result.line_items_detected,
                    line_item_count=siglip_result.line_item_count,
                    overall_confidence=siglip_result.overall_confidence,
                    routing_tier=1,
                    processing_time_ms=processing_time_ms,
                    model_used="siglip-so400m-patch14-384",
                    warnings=siglip_result.warnings,
                    escalated=False,
                )
        except Exception as e:
            logger.warning("SigLIP extraction failed, escalating", error=str(e))

    # Tier 2: Qwen2-VL (existing pipeline)
    if force_tier in (None, 2):
        try:
            model = get_model()
            transactions, confidence = await model.extract_from_image(
                image, DocumentType.RECEIPT
            )

            if transactions and (confidence >= 0.5 or force_tier == 2):
                txn = transactions[0]
                processing_time_ms = int((time.time() - start_time) * 1000)
                return LightweightReceiptResponse(
                    merchant=FieldConfidence(
                        value=txn.normalized_merchant or txn.description,
                        confidence=confidence,
                        source="qwen2vl",
                    ),
                    amount=FieldConfidence(
                        value=str(txn.amount),
                        confidence=confidence,
                        source="qwen2vl",
                    ),
                    date=FieldConfidence(
                        value=txn.date,
                        confidence=confidence,
                        source="qwen2vl",
                    ),
                    line_items_detected=bool(txn.line_items),
                    line_item_count=len(txn.line_items) if txn.line_items else 0,
                    overall_confidence=confidence,
                    routing_tier=2,
                    processing_time_ms=processing_time_ms,
                    model_used=model.model_name,
                    warnings=["Escalated from SigLIP due to low confidence"]
                    if siglip_result
                    else [],
                    escalated=siglip_result is not None,
                )
        except Exception as e:
            logger.warning("Qwen2-VL extraction failed, escalating", error=str(e))

    # Tier 3: Return low-confidence placeholder (Gemini handled by Go backend)
    processing_time_ms = int((time.time() - start_time) * 1000)
    return LightweightReceiptResponse(
        merchant=FieldConfidence(value="", confidence=0.0, source="none"),
        amount=FieldConfidence(value="0.0", confidence=0.0, source="none"),
        date=FieldConfidence(value="", confidence=0.0, source="none"),
        line_items_detected=False,
        line_item_count=0,
        overall_confidence=0.0,
        routing_tier=3,
        processing_time_ms=processing_time_ms,
        model_used="none",
        warnings=["All self-hosted tiers failed — use Gemini fallback"],
        escalated=True,
    )


@app.post("/v1/detect-recurring", response_model=RecurringResponse)
async def detect_recurring(request: RecurringRequest) -> RecurringResponse:
    """Detect recurring transaction patterns from user transaction history.

    Uses sentence-transformer embeddings + HDBSCAN clustering to group similar
    transactions, then detects periodicity and classifies recurring types.

    CPU-only. ~5ms per transaction for embedding, ~5s for 1000 transactions.
    """
    if _recurring_detector is None or not _recurring_detector.is_loaded:
        raise HTTPException(
            status_code=503,
            detail="Recurring detector not loaded. Set ENABLE_RECURRING=true.",
        )

    # Convert Pydantic models to dicts for the detector
    transactions = [
        {
            "id": t.id,
            "description": t.description,
            "amount": t.amount,
            "date": t.date,
            "is_debit": t.is_debit,
            "category": t.category,
        }
        for t in request.transactions
    ]

    result = _recurring_detector.detect(
        transactions=transactions,
        cached_embeddings=request.cached_embeddings,
        min_occurrences=request.min_occurrences,
        return_embeddings=request.cached_embeddings is not None,
    )

    # Convert pattern dicts to Pydantic models
    patterns = [RecurringPattern(**p) for p in result["patterns"]]

    return RecurringResponse(
        patterns=patterns,
        embeddings=result["embeddings"],
        processing_time_ms=result["processing_time_ms"],
        transactions_analyzed=result["transactions_analyzed"],
        clusters_found=result["clusters_found"],
    )


@app.post("/v1/detect-anomalies", response_model=AnomalyDetectionResponse)
async def detect_anomalies_endpoint(
    request: AnomalyDetectionRequest,
) -> AnomalyDetectionResponse:
    """Detect spending anomalies for new transactions.

    Builds a per-user spending profile from historical transactions and checks
    new transactions for z-score anomalies (single transaction, monthly spending,
    new categories, merchant-level).

    CPU-only. ~10ms for profile build + ~0.1ms per transaction check.
    """
    if _anomaly_detector is None:
        raise HTTPException(
            status_code=503,
            detail="Anomaly detector not loaded.",
        )

    result = _anomaly_detector.detect(
        user_id=request.user_id,
        transactions=request.transactions,
        history=request.history,
        current_month_spending=request.current_month_spending,
    )

    return AnomalyDetectionResponse(
        anomalies=result["anomalies"],
        profile=result["profile"],
        processing_time_ms=result["processing_time_ms"],
        transactions_checked=result["transactions_checked"],
    )


@app.post("/v1/forecast-spending", response_model=ForecastResponse)
async def forecast_spending_endpoint(
    request: ForecastRequest,
) -> ForecastResponse:
    """Forecast spending per category using Prophet (>=4 months) or simple average.

    Also checks budget overshoot warnings if budgets are provided.

    CPU-only. ~1-2s per category for Prophet fit. ~15s for full user refresh.
    """
    if _spending_forecaster is None:
        raise HTTPException(
            status_code=503,
            detail="Spending forecaster not loaded. Set ENABLE_FORECASTER=true.",
        )

    result = _spending_forecaster.forecast(
        user_id=request.user_id,
        history_by_category=request.history_by_category,
        months_ahead=request.months_ahead,
        recurring_transactions=request.recurring_transactions,
        budgets=request.budgets,
        current_month_spending=request.current_month_spending,
    )

    return ForecastResponse(
        category_forecasts=result["category_forecasts"],
        budget_warnings=result["budget_warnings"],
        processing_time_ms=result["processing_time_ms"],
        categories_forecasted=result["categories_forecasted"],
    )


def run():
    """Run the service using uvicorn."""
    import uvicorn

    port = int(os.getenv("PORT", "8080"))
    host = os.getenv("HOST", "0.0.0.0")

    uvicorn.run(
        "src.main:app",
        host=host,
        port=port,
        reload=os.getenv("DEV_MODE", "false").lower() == "true",
    )


if __name__ == "__main__":
    run()
