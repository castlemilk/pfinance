"""
CHEAPEST Modal deployment using T4 GPU + 2B model.

Deploy with:
    modal deploy modal_app_cheap.py

Costs:
    - T4: ~$0.40/hr (~$0.00011/sec)
    - Per request (3-5s): ~$0.0003-0.0006
    - 1000 receipts/month: ~$0.30-0.60

This uses the 2B model which fits easily on T4's 16GB VRAM.
Supports both images and PDFs with parallel page processing.
"""

import modal

app = modal.App("pfinance-extraction-cheap")

# Image with model pre-downloaded for fast cold starts
image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch>=2.0",
        "torchvision",
        "transformers>=4.45,<5.0",  # Pin to 4.x for Qwen2-VL compatibility
        "accelerate",
        "pillow",
        "fastapi",
        "python-multipart",
        "qwen-vl-utils",
        "pymupdf",  # For PDF support
    )
    .run_commands(
        # Pre-download model during image build (baked into the image)
        "python -c \"from transformers import Qwen2VLForConditionalGeneration, AutoProcessor; "
        "AutoProcessor.from_pretrained('Qwen/Qwen2-VL-2B-Instruct', trust_remote_code=True); "
        "Qwen2VLForConditionalGeneration.from_pretrained('Qwen/Qwen2-VL-2B-Instruct', trust_remote_code=True)\""
    )
)


# Prompts for different document types
RECEIPT_PROMPT = """Analyze this receipt and extract:
1. Merchant name
2. Date (YYYY-MM-DD format)
3. Total amount

Return ONLY valid JSON:
{"merchant": "Name", "date": "YYYY-MM-DD", "total": 0.00}"""

BANK_STATEMENT_PROMPT = """Extract transactions from this bank statement page.
For each transaction extract: date (YYYY-MM-DD), description, amount (negative for debits).

Return ONLY a JSON array, no other text:
[{"date": "YYYY-MM-DD", "description": "Name", "amount": -123.45}]"""


@app.cls(
    image=image,
    gpu="T4",  # Cheapest GPU: ~$0.40/hr
    timeout=120,  # Single page should complete in <60s
    scaledown_window=60,  # Keep warm longer for parallel requests
    max_containers=10,  # Allow parallel scaling for PDF pages
)
class QwenExtractor2B:
    """Cheap extraction using Qwen2-VL-2B on T4."""

    @modal.enter()
    def load_model(self):
        import torch
        from transformers import Qwen2VLForConditionalGeneration, AutoProcessor

        print("Loading Qwen2-VL-2B model...")

        self.processor = AutoProcessor.from_pretrained(
            "Qwen/Qwen2-VL-2B-Instruct",
            trust_remote_code=True,
        )

        self.model = Qwen2VLForConditionalGeneration.from_pretrained(
            "Qwen/Qwen2-VL-2B-Instruct",
            torch_dtype=torch.float16,
            device_map="auto",
            trust_remote_code=True,
        )

        print("Model loaded!")

    def _parse_json_response(self, response: str):
        """Parse JSON from model response, handling truncated output."""
        import json
        import re

        try:
            text = response.strip()
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0]
            elif "```" in text:
                text = text.split("```")[1].split("```")[0]

            # Find JSON array or object
            start_bracket = text.find("[")
            start_brace = text.find("{")

            if start_bracket != -1 and (start_brace == -1 or start_bracket < start_brace):
                # JSON array - try to parse complete items even if truncated
                text = text[start_bracket:]
                # Try to find a valid closing point
                if not text.rstrip().endswith("]"):
                    # Truncated - try to salvage complete objects
                    # Find the last complete object (ends with },)
                    last_complete = text.rfind("},")
                    if last_complete > 0:
                        text = text[:last_complete + 1] + "]"
                    else:
                        # Try just the last }
                        last_brace = text.rfind("}")
                        if last_brace > 0:
                            text = text[:last_brace + 1] + "]"
            elif start_brace != -1:
                # JSON object
                end = text.rfind("}") + 1
                if end > start_brace:
                    text = text[start_brace:end]

            return json.loads(text)
        except Exception as e:
            return {"error": str(e), "raw": response[:500]}

    @modal.method()
    def extract_image(self, image_bytes: bytes, prompt: str) -> dict:
        """Extract from a single image with given prompt."""
        import io
        import torch
        from PIL import Image

        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": image},
                    {"type": "text", "text": prompt},
                ],
            }
        ]

        text = self.processor.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )

        inputs = self.processor(
            text=[text],
            images=[image],
            padding=True,
            return_tensors="pt",
        ).to("cuda")

        with torch.no_grad():
            outputs = self.model.generate(
                **inputs,
                max_new_tokens=1024,
                do_sample=False,
                pad_token_id=self.processor.tokenizer.pad_token_id,
            )

        generated_ids = outputs[:, inputs["input_ids"].shape[1]:]
        response = self.processor.batch_decode(generated_ids, skip_special_tokens=True)[0]

        return self._parse_json_response(response)


# Function to extract from a single PDF page (combines PDF->image and extraction)
@app.function(
    image=image,
    gpu="T4",
    timeout=120,
    scaledown_window=60,
    max_containers=10,
)
def extract_pdf_page(pdf_bytes: bytes, page_num: int, prompt: str) -> dict:
    """Extract from a single PDF page."""
    import fitz
    import io
    import json
    import torch
    from PIL import Image
    from transformers import Qwen2VLForConditionalGeneration, AutoProcessor

    # Convert PDF page to image
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page = doc[page_num]
    mat = fitz.Matrix(150/72, 150/72)
    pix = page.get_pixmap(matrix=mat)
    img_bytes = pix.tobytes("png")
    doc.close()

    # Load image
    pil_image = Image.open(io.BytesIO(img_bytes)).convert("RGB")

    # Load model (will be cached after first call)
    processor = AutoProcessor.from_pretrained(
        "Qwen/Qwen2-VL-2B-Instruct",
        trust_remote_code=True,
    )
    model = Qwen2VLForConditionalGeneration.from_pretrained(
        "Qwen/Qwen2-VL-2B-Instruct",
        torch_dtype=torch.float16,
        device_map="auto",
        trust_remote_code=True,
    )

    # Prepare input
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "image", "image": pil_image},
                {"type": "text", "text": prompt},
            ],
        }
    ]

    text = processor.apply_chat_template(
        messages, tokenize=False, add_generation_prompt=True
    )

    inputs = processor(
        text=[text],
        images=[pil_image],
        padding=True,
        return_tensors="pt",
    ).to("cuda")

    # Generate
    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=1024,
            do_sample=False,
            pad_token_id=processor.tokenizer.pad_token_id,
        )

    generated_ids = outputs[:, inputs["input_ids"].shape[1]:]
    response = processor.batch_decode(generated_ids, skip_special_tokens=True)[0]

    # Parse JSON - handle truncated output gracefully
    try:
        text = response.strip()
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0]
        elif "```" in text:
            text = text.split("```")[1].split("```")[0]

        start_bracket = text.find("[")
        start_brace = text.find("{")

        if start_bracket != -1 and (start_brace == -1 or start_bracket < start_brace):
            # JSON array - try to salvage truncated output
            text = text[start_bracket:]
            if not text.rstrip().endswith("]"):
                # Truncated - find last complete object
                last_complete = text.rfind("},")
                if last_complete > 0:
                    text = text[:last_complete + 1] + "]"
                else:
                    last_brace = text.rfind("}")
                    if last_brace > 0:
                        text = text[:last_brace + 1] + "]"
        elif start_brace != -1:
            end = text.rfind("}") + 1
            if end > start_brace:
                text = text[start_brace:end]

        result = json.loads(text)
        if isinstance(result, list):
            for txn in result:
                txn["page"] = page_num + 1
        else:
            result["page"] = page_num + 1
        return result
    except Exception as e:
        return {"error": str(e), "raw": response[:500], "page": page_num + 1}


@app.function(image=image, timeout=60)
def get_pdf_page_count(pdf_bytes: bytes) -> int:
    """Get the number of pages in a PDF."""
    import fitz
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    count = len(doc)
    doc.close()
    return count


# Orchestrator function that runs parallel extraction
@app.function(image=image, timeout=600)
def extract_pdf_parallel(pdf_bytes: bytes, prompt: str) -> dict:
    """Extract from all PDF pages in parallel."""
    import fitz

    # Get page count
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page_count = len(doc)
    doc.close()

    print(f"Processing {page_count} pages in parallel...")

    # Process all pages in parallel using .map()
    results = list(extract_pdf_page.map(
        [pdf_bytes] * page_count,
        range(page_count),
        [prompt] * page_count,
    ))

    # Collect results
    all_transactions = []
    errors = []

    for result in results:
        if isinstance(result, list):
            all_transactions.extend(result)
        elif isinstance(result, dict) and "error" not in result:
            all_transactions.append(result)
        else:
            errors.append(result)

    return {
        "transactions": all_transactions,
        "errors": errors if errors else None,
        "page_count": page_count,
    }


@app.function(image=image)
@modal.asgi_app()
def web_app():
    from fastapi import FastAPI, File, UploadFile, HTTPException, Form
    from fastapi.middleware.cors import CORSMiddleware
    from typing import Optional

    api = FastAPI(title="PFinance Extraction API (Cheap)")

    api.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @api.get("/health")
    async def health():
        return {"status": "healthy", "model": "Qwen2-VL-2B", "gpu": "T4", "supports": ["image", "pdf"], "parallel": True}

    @api.post("/extract")
    async def extract(
        file: UploadFile = File(...),
        doc_type: Optional[str] = Form(default="auto")
    ):
        content = await file.read()
        content_type = file.content_type or ""
        filename = file.filename or ""

        is_pdf = content_type == "application/pdf" or filename.lower().endswith(".pdf")
        is_image = content_type.startswith("image/") or any(
            filename.lower().endswith(ext) for ext in [".jpg", ".jpeg", ".png", ".webp", ".gif"]
        )

        if not is_pdf and not is_image:
            raise HTTPException(400, "File must be an image or PDF")

        # Auto-detect document type
        if doc_type == "auto":
            doc_type = "bank_statement" if is_pdf else "receipt"

        prompt = BANK_STATEMENT_PROMPT if doc_type == "bank_statement" else RECEIPT_PROMPT

        if is_pdf:
            # Use the parallel orchestrator function
            result = extract_pdf_parallel.remote(content, prompt)

            return {
                "transactions": result["transactions"],
                "errors": result["errors"],
                "page_count": result["page_count"],
                "model": "Qwen2-VL-2B",
                "gpu": "T4",
                "doc_type": doc_type,
                "parallel": True,
            }
        else:
            # Single image extraction
            extractor = QwenExtractor2B()
            result = extractor.extract_image.remote(content, prompt)

            return {
                "transactions": [result] if "error" not in result else [],
                "raw_result": result,
                "model": "Qwen2-VL-2B",
                "gpu": "T4",
                "doc_type": doc_type,
            }

    return api


@app.local_entrypoint()
def main():
    from pathlib import Path

    test_image = Path(__file__).parent.parent / "web/testdata/real_receipt.jpg"

    if test_image.exists():
        print(f"Testing with: {test_image}")
        image_bytes = test_image.read_bytes()

        extractor = QwenExtractor2B()
        result = extractor.extract_image.remote(image_bytes, RECEIPT_PROMPT)

        print("\nResult:")
        print(f"  Merchant: {result.get('merchant', 'N/A')}")
        print(f"  Date: {result.get('date', 'N/A')}")
        print(f"  Total: {result.get('total', 'N/A')}")
    else:
        print(f"Test image not found: {test_image}")
