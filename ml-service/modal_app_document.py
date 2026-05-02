"""Modal serverless deployment for LayoutLMv3 bank statement parsing.

Deploy with:
    modal deploy modal_app_document.py

Test locally:
    modal run modal_app_document.py

Estimated costs:
    - A10G: ~$1.10/hr (~$0.0003/sec)
    - Per page (< 500ms): ~$0.0002
    - 1000 statement pages/month: ~$0.20
    - 95-98% cheaper than Gemini API per page
"""

import modal

app = modal.App("pfinance-document-parser")

# Container image with LayoutLMv3 and dependencies
image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch>=2.1",
        "transformers>=4.40",
        "accelerate",
        "pillow",
        "fastapi",
        "python-multipart",
        "pymupdf>=1.24.0",
        "pydantic>=2.5.0",
        "structlog",
    )
    .run_commands(
        # Pre-download LayoutLMv3 during build for fast cold starts
        'python -c "'
        "from transformers import LayoutLMv3Model, LayoutLMv3TokenizerFast; "
        "LayoutLMv3TokenizerFast.from_pretrained('microsoft/layoutlmv3-base'); "
        "LayoutLMv3Model.from_pretrained('microsoft/layoutlmv3-base')"
        '"'
    )
)

model_cache = modal.Volume.from_name("layoutlmv3-model-cache", create_if_missing=True)


@app.cls(
    image=image,
    gpu="A10G",
    timeout=300,
    container_idle_timeout=60,
    volumes={"/root/.cache": model_cache},
    mounts=[
        modal.Mount.from_local_dir(
            "src/models/statement_parser",
            remote_path="/app/statement_parser",
        ),
    ],
)
class StatementParser:
    """Serverless LayoutLMv3 statement parsing service."""

    @modal.enter()
    def load_model(self):
        """Load LayoutLMv3 encoder and extraction heads when container starts."""
        import sys
        sys.path.insert(0, "/app")

        from statement_parser.pipeline import StatementParserPipeline

        print("Loading LayoutLMv3 statement parser...")
        self.pipeline = StatementParserPipeline(device="cuda")

        # Load trained heads and LoRA adapters from volume if available
        import os
        heads_path = "/root/.cache/extraction_heads/best_heads.pt"
        adapter_dir = "/root/.cache/lora_adapters"

        self.pipeline.load(
            heads_path=heads_path if os.path.exists(heads_path) else None,
            adapter_dir=adapter_dir if os.path.exists(adapter_dir) else None,
        )
        print("Statement parser loaded!")

    @modal.method()
    def parse(self, pdf_bytes: bytes, bank_hint: str | None = None) -> dict:
        """Parse a bank statement PDF into structured transactions."""
        result = self.pipeline.parse_statement(pdf_bytes, bank_hint=bank_hint)

        return {
            "transactions": [
                {
                    "id": t.id,
                    "date": t.date,
                    "description": t.description,
                    "amount": t.amount,
                    "is_debit": t.is_debit,
                    "balance": t.balance,
                    "confidence": t.confidence,
                    "page": t.page,
                    "field_confidences": t.field_confidences,
                }
                for t in result.transactions
            ],
            "confidence": result.confidence,
            "bank_detected": result.bank_detected,
            "page_count": result.page_count,
            "processing_time_ms": result.processing_time_ms,
            "needs_fallback": result.needs_fallback,
            "fallback_reason": result.fallback_reason,
            "balance_reconciled": result.balance_reconciled,
            "warnings": result.warnings,
        }


@app.function(image=image)
@modal.asgi_app()
def web_app():
    """FastAPI web endpoint for statement parsing."""
    import json
    from fastapi import FastAPI, File, Form, HTTPException, UploadFile
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel
    from typing import Optional

    api = FastAPI(title="PFinance Statement Parser API")

    api.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    class ParseRequest(BaseModel):
        pdf_url: Optional[str] = None
        bank_hint: Optional[str] = None

    @api.get("/health")
    async def health():
        return {
            "status": "healthy",
            "model": "LayoutLMv3-base",
            "endpoint": "/v1/parse-statement",
        }

    @api.post("/v1/parse-statement")
    async def parse_statement(
        file: UploadFile = File(None),
        bank_hint: str = Form(None),
    ):
        """Parse a bank statement PDF.

        Input: PDF file upload or JSON body with pdf_url.
        Output: Structured transactions with confidence scores.
        """
        if file is None:
            raise HTTPException(400, "PDF file required")

        content_type = file.content_type or ""
        if not content_type.startswith("application/pdf") and not file.filename.endswith(".pdf"):
            raise HTTPException(400, "File must be a PDF")

        pdf_bytes = await file.read()
        if len(pdf_bytes) == 0:
            raise HTTPException(400, "Empty PDF file")

        parser = StatementParser()
        result = parser.parse.remote(pdf_bytes, bank_hint=bank_hint)

        return result

    return api


@app.local_entrypoint()
def main():
    """Test the statement parsing service."""
    from pathlib import Path

    test_dir = Path(__file__).parent / "tests" / "testdata"
    test_pdfs = list(test_dir.glob("*.pdf")) if test_dir.exists() else []

    if test_pdfs:
        print(f"Testing with: {test_pdfs[0]}")
        pdf_bytes = test_pdfs[0].read_bytes()

        parser = StatementParser()
        result = parser.parse.remote(pdf_bytes)

        print(f"\nBank detected: {result['bank_detected']}")
        print(f"Confidence: {result['confidence']:.2f}")
        print(f"Pages: {result['page_count']}")
        print(f"Transactions: {len(result['transactions'])}")
        print(f"Processing time: {result['processing_time_ms']}ms")
        print(f"Needs fallback: {result['needs_fallback']}")

        for txn in result["transactions"][:5]:
            print(f"  {txn['date']} | {txn['description'][:40]} | "
                  f"{'DR' if txn['is_debit'] else 'CR'} ${txn['amount']:.2f} "
                  f"(conf: {txn['confidence']:.2f})")
    else:
        print("No test PDFs found in tests/testdata/")
        print("Run: modal run modal_app_document.py")
