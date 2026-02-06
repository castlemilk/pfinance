"""
Modal deployment using Qwen2-VL-7B for higher accuracy.

Deploy with:
    modal deploy modal_app_7b.py

Costs:
    - A10G: ~$1.10/hr (~$0.00031/sec)
    - Per request (5-10s): ~$0.002-0.003
    - 1000 receipts/month: ~$2-3

Uses 7B model which needs 24GB VRAM (A10G).
Higher accuracy than 2B, especially for amounts and dates.
"""

import modal

app = modal.App("pfinance-extraction-7b")

# Image with model pre-downloaded
image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch>=2.0",
        "torchvision",
        "transformers>=4.45,<5.0",
        "accelerate",
        "pillow",
        "fastapi",
        "python-multipart",
        "qwen-vl-utils",
        "pymupdf",
    )
    .run_commands(
        # Pre-download 7B model
        "python -c \"from transformers import Qwen2VLForConditionalGeneration, AutoProcessor; "
        "AutoProcessor.from_pretrained('Qwen/Qwen2-VL-7B-Instruct', trust_remote_code=True); "
        "Qwen2VLForConditionalGeneration.from_pretrained('Qwen/Qwen2-VL-7B-Instruct', trust_remote_code=True)\""
    )
)

# Prompts
RECEIPT_PROMPT = """Extract from this receipt:
- merchant: Store name
- date: YYYY-MM-DD format exactly
- total: Total amount as decimal number (e.g., 28.50 not 2850)

Return ONLY valid JSON: {"merchant": "Name", "date": "YYYY-MM-DD", "total": 0.00}"""

RECEIPT_ITEMS_PROMPT = """Extract ALL line items from this receipt.
For each item extract:
- description: item name
- quantity: number of items (default 1)
- amount: price as decimal number

Return ONLY a JSON array:
[{"description": "Item name", "quantity": 1, "amount": 10.00}]

Extract every item visible on the receipt."""

BANK_STATEMENT_PROMPT = """Extract ALL transactions from this bank statement page.
For each transaction extract:
- date: YYYY-MM-DD format exactly
- description: merchant/payee name
- amount: decimal number, negative for debits (e.g., -28.50 not -2850)

Return ONLY a JSON array:
[{"date": "YYYY-MM-DD", "description": "Merchant", "amount": -28.50}]"""


@app.function(
    image=image,
    gpu="A10G",  # 24GB VRAM for 7B model
    timeout=180,
    scaledown_window=120,
    max_containers=10,
)
def extract_pdf_page(pdf_bytes: bytes, page_num: int, prompt: str) -> dict:
    """Extract from a single PDF page using 7B model."""
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

    pil_image = Image.open(io.BytesIO(img_bytes)).convert("RGB")

    # Load model
    processor = AutoProcessor.from_pretrained(
        "Qwen/Qwen2-VL-7B-Instruct",
        trust_remote_code=True,
    )
    model = Qwen2VLForConditionalGeneration.from_pretrained(
        "Qwen/Qwen2-VL-7B-Instruct",
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

    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=1536,
            do_sample=False,
            pad_token_id=processor.tokenizer.pad_token_id,
        )

    generated_ids = outputs[:, inputs["input_ids"].shape[1]:]
    response = processor.batch_decode(generated_ids, skip_special_tokens=True)[0]

    # Parse JSON
    try:
        text = response.strip()
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0]
        elif "```" in text:
            text = text.split("```")[1].split("```")[0]

        start_bracket = text.find("[")
        start_brace = text.find("{")

        if start_bracket != -1 and (start_brace == -1 or start_bracket < start_brace):
            text = text[start_bracket:]
            if not text.rstrip().endswith("]"):
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


@app.function(image=image, timeout=600)
def extract_pdf_parallel(pdf_bytes: bytes, prompt: str) -> dict:
    """Extract from all PDF pages in parallel."""
    import fitz

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page_count = len(doc)
    doc.close()

    print(f"Processing {page_count} pages in parallel with 7B model...")

    results = list(extract_pdf_page.map(
        [pdf_bytes] * page_count,
        range(page_count),
        [prompt] * page_count,
    ))

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


@app.cls(
    image=image,
    gpu="A10G",
    timeout=120,
    scaledown_window=120,
)
class QwenExtractor7B:
    """7B model extractor for single images."""

    @modal.enter()
    def load_model(self):
        import torch
        from transformers import Qwen2VLForConditionalGeneration, AutoProcessor

        print("Loading Qwen2-VL-7B model...")

        self.processor = AutoProcessor.from_pretrained(
            "Qwen/Qwen2-VL-7B-Instruct",
            trust_remote_code=True,
        )

        self.model = Qwen2VLForConditionalGeneration.from_pretrained(
            "Qwen/Qwen2-VL-7B-Instruct",
            torch_dtype=torch.float16,
            device_map="auto",
            trust_remote_code=True,
        )

        print("7B Model loaded!")

    @modal.method()
    def extract_image(self, image_bytes: bytes, prompt: str) -> dict:
        """Extract from a single image."""
        import io
        import json
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
                max_new_tokens=2048,  # Increased for line-item extraction
                do_sample=False,
                pad_token_id=self.processor.tokenizer.pad_token_id,
            )

        generated_ids = outputs[:, inputs["input_ids"].shape[1]:]
        response = self.processor.batch_decode(generated_ids, skip_special_tokens=True)[0]

        # Parse JSON - handle both objects and arrays, including truncated output
        try:
            text = response.strip()
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0]
            elif "```" in text:
                text = text.split("```")[1].split("```")[0]

            start_bracket = text.find("[")
            start_brace = text.find("{")

            if start_bracket != -1 and (start_brace == -1 or start_bracket < start_brace):
                # JSON array - handle truncation
                text = text[start_bracket:]
                if not text.rstrip().endswith("]"):
                    # Truncated - salvage complete objects
                    last_complete = text.rfind("},")
                    if last_complete > 0:
                        text = text[:last_complete + 1] + "]"
                    else:
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


@app.function(image=image)
@modal.asgi_app()
def web_app():
    from fastapi import FastAPI, File, UploadFile, HTTPException, Form
    from fastapi.middleware.cors import CORSMiddleware
    from typing import Optional

    api = FastAPI(title="PFinance Extraction API (7B)")

    api.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @api.get("/health")
    async def health():
        return {
            "status": "healthy",
            "model": "Qwen2-VL-7B",
            "gpu": "A10G",
            "supports": ["image", "pdf"],
            "parallel": True,
        }

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

        if doc_type == "auto":
            doc_type = "bank_statement" if is_pdf else "receipt"

        # Select prompt based on doc_type
        if doc_type == "bank_statement":
            prompt = BANK_STATEMENT_PROMPT
        elif doc_type == "receipt_items":
            prompt = RECEIPT_ITEMS_PROMPT
        else:
            prompt = RECEIPT_PROMPT

        if is_pdf:
            result = extract_pdf_parallel.remote(content, prompt)

            return {
                "transactions": result["transactions"],
                "errors": result["errors"],
                "page_count": result["page_count"],
                "model": "Qwen2-VL-7B",
                "gpu": "A10G",
                "doc_type": doc_type,
                "parallel": True,
            }
        else:
            extractor = QwenExtractor7B()
            result = extractor.extract_image.remote(content, prompt)

            # Handle both array (line items) and object (summary) results
            if isinstance(result, list):
                transactions = result
            elif isinstance(result, dict) and "error" not in result:
                transactions = [result]
            else:
                transactions = []

            return {
                "transactions": transactions,
                "raw_result": result,
                "model": "Qwen2-VL-7B",
                "gpu": "A10G",
                "doc_type": doc_type,
            }

    return api


@app.local_entrypoint()
def main():
    from pathlib import Path

    test_image = Path(__file__).parent.parent / "web/testdata/real_receipt.jpg"

    if test_image.exists():
        print(f"Testing 7B model with: {test_image}")
        image_bytes = test_image.read_bytes()

        extractor = QwenExtractor7B()
        result = extractor.extract_image.remote(image_bytes, RECEIPT_PROMPT)

        print("\nResult:")
        print(f"  Merchant: {result.get('merchant', 'N/A')}")
        print(f"  Date: {result.get('date', 'N/A')}")
        print(f"  Total: {result.get('total', 'N/A')}")
    else:
        print(f"Test image not found: {test_image}")
