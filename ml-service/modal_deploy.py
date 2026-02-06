"""Modal serverless deployment for ML extraction service.

Deploy with:
    modal deploy modal_deploy.py

Test locally:
    modal serve modal_deploy.py

Pricing: ~$0.35/hr for A100 GPU, 3-5s cold start
"""

import io
import os
from typing import Optional

import modal

# Define the Modal app
app = modal.App("pfinance-ml-extraction")

# Define the container image
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install(
        "libgl1-mesa-glx",
        "libglib2.0-0",
        "libsm6",
        "libxext6",
        "libxrender1",
        "poppler-utils",  # For pdf2image
    )
    .pip_install(
        "fastapi>=0.104.0",
        "uvicorn[standard]>=0.24.0",
        "python-multipart>=0.0.6",
        "transformers>=4.36.0",
        "torch>=2.1.0",
        "accelerate>=0.25.0",
        "Pillow>=10.0.0",
        "opencv-python-headless>=4.8.0",
        "pydantic>=2.5.0",
        "structlog>=23.2.0",
        "pdf2image>=1.16.0",
    )
)

# Volume for caching model weights
model_cache = modal.Volume.from_name("pfinance-model-cache", create_if_missing=True)


@app.cls(
    image=image,
    gpu="A10G",  # Options: "T4", "A10G", "A100", "H100"
    timeout=600,
    container_idle_timeout=300,  # Keep warm for 5 minutes
    volumes={"/models": model_cache},
    secrets=[modal.Secret.from_name("huggingface-secret", required=False)],
)
class MLExtractionService:
    """Modal-deployed ML extraction service."""

    model: Optional["PaddleOCRModel"] = None

    @modal.enter()
    def load_model(self):
        """Load the model when container starts."""
        import os
        import sys

        # Add src to path for imports
        sys.path.insert(0, "/root")

        # Set cache directory
        os.environ["HF_HOME"] = "/models"
        os.environ["TRANSFORMERS_CACHE"] = "/models"

        from src.models.paddleocr import PaddleOCRModel

        self.model = PaddleOCRModel(device="cuda")
        # Note: Model will be loaded lazily on first request
        print("ML Extraction Service initialized")

    @modal.method()
    async def extract_from_image(
        self,
        image_bytes: bytes,
        document_type: str = "receipt",
    ) -> dict:
        """Extract transactions from an image."""
        from PIL import Image

        from src.schemas.extraction import DocumentType

        image = Image.open(io.BytesIO(image_bytes))
        if image.mode != "RGB":
            image = image.convert("RGB")

        doc_type = DocumentType(document_type)

        transactions, confidence = await self.model.extract_from_image(image, doc_type)

        return {
            "transactions": [t.model_dump() for t in transactions],
            "overall_confidence": confidence,
            "model_used": self.model.model_name,
        }

    @modal.method()
    async def extract_from_pdf(
        self,
        pdf_bytes: bytes,
        document_type: str = "bank_statement",
    ) -> dict:
        """Extract transactions from a PDF."""
        from src.schemas.extraction import DocumentType

        doc_type = DocumentType(document_type)

        transactions, confidence, page_count = await self.model.extract_from_pdf(
            pdf_bytes, doc_type
        )

        return {
            "transactions": [t.model_dump() for t in transactions],
            "overall_confidence": confidence,
            "model_used": self.model.model_name,
            "page_count": page_count,
        }

    @modal.web_endpoint(method="POST")
    async def extract(self, request: dict) -> dict:
        """Web endpoint for extraction."""
        import base64

        file_data = request.get("file")
        document_type = request.get("document_type", "receipt")
        is_pdf = request.get("is_pdf", False)

        if not file_data:
            return {"error": "No file data provided"}

        # Decode base64 file
        try:
            file_bytes = base64.b64decode(file_data)
        except Exception as e:
            return {"error": f"Invalid base64 data: {e}"}

        if is_pdf:
            return await self.extract_from_pdf(file_bytes, document_type)
        else:
            return await self.extract_from_image(file_bytes, document_type)

    @modal.web_endpoint(method="GET")
    def health(self) -> dict:
        """Health check endpoint."""
        return {
            "status": "healthy",
            "model_loaded": self.model is not None and self.model.is_loaded,
            "model_name": self.model.model_name if self.model else "not_loaded",
        }


# Copy source files to the container
@app.function(image=image)
def copy_source():
    """Helper to verify source is available."""
    import os

    return os.listdir("/root/src") if os.path.exists("/root/src") else []


# Local entrypoint for testing
@app.local_entrypoint()
def main():
    """Local entrypoint for testing."""
    import base64
    from pathlib import Path

    # Test with a sample image
    test_image_path = Path("testdata/sample_receipt.jpg")
    if test_image_path.exists():
        with open(test_image_path, "rb") as f:
            image_bytes = f.read()

        service = MLExtractionService()
        result = service.extract_from_image.remote(image_bytes, "receipt")
        print(f"Extracted {len(result['transactions'])} transactions")
        print(f"Confidence: {result['overall_confidence']:.2%}")
    else:
        print("No test image found. Run health check instead.")
        service = MLExtractionService()
        print(service.health.remote())


# Alternative: Simpler function-based deployment
@app.function(
    image=image,
    gpu="T4",  # Cheaper GPU for lighter workloads
    timeout=120,
    volumes={"/models": model_cache},
)
async def extract_document(
    file_bytes: bytes,
    document_type: str = "receipt",
    is_pdf: bool = False,
) -> dict:
    """Simple function endpoint for extraction."""
    import os

    os.environ["HF_HOME"] = "/models"

    from src.models.paddleocr import PaddleOCRModel
    from src.schemas.extraction import DocumentType

    model = PaddleOCRModel(device="cuda")
    doc_type = DocumentType(document_type)

    if is_pdf:
        transactions, confidence, page_count = await model.extract_from_pdf(
            file_bytes, doc_type
        )
        return {
            "transactions": [t.model_dump() for t in transactions],
            "overall_confidence": confidence,
            "page_count": page_count,
        }
    else:
        from PIL import Image

        image = Image.open(io.BytesIO(file_bytes))
        if image.mode != "RGB":
            image = image.convert("RGB")

        transactions, confidence = await model.extract_from_image(image, doc_type)
        return {
            "transactions": [t.model_dump() for t in transactions],
            "overall_confidence": confidence,
        }
