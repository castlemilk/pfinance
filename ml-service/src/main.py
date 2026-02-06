"""ML Service FastAPI Application.

Self-hosted document extraction service using Qwen2-VL or DeepSeek-OCR models.
"""

import io
import os
import time
from contextlib import asynccontextmanager
from typing import Annotated, Union

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

# Global model instance
_model: BaseOCRModel | None = None


def get_model() -> BaseOCRModel:
    """Get the loaded model instance."""
    global _model
    if _model is None:
        raise RuntimeError("Model not loaded")
    return _model


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

    yield

    # Cleanup on shutdown
    logger.info("Shutting down ML service...")
    _model = None


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
