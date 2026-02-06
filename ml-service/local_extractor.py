#!/usr/bin/env python3
"""
Local document extraction using Qwen2-VL-7B on Apple Silicon (MPS).

Supports:
- Single image extraction
- PDF extraction with parallel page processing
- Bank statements and receipts
"""

import gc
import io
import json
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import fitz  # PyMuPDF
import torch
from PIL import Image


# Prompts
RECEIPT_PROMPT = """Extract from this receipt:
- merchant: Store name
- date: YYYY-MM-DD format
- total: Total amount as number

Return ONLY valid JSON: {"merchant": "Name", "date": "YYYY-MM-DD", "total": 0.00}"""

BANK_STATEMENT_PROMPT = """Extract ALL transactions from this bank statement page.
For each transaction: date (YYYY-MM-DD), description, amount (negative for debits).

Return ONLY a JSON array:
[{"date": "YYYY-MM-DD", "description": "Merchant", "amount": -123.45}]"""


@dataclass
class ExtractionResult:
    """Result from extraction."""
    success: bool
    data: dict | list
    raw_response: str
    processing_time_s: float
    page: Optional[int] = None
    error: Optional[str] = None


class LocalExtractor:
    """Local extraction using Qwen2-VL-7B with MPS acceleration."""

    def __init__(self, model_size: str = "7B", device: str = "auto"):
        self.model = None
        self.processor = None
        self.device = self._select_device(device)
        self.model_id = f"Qwen/Qwen2-VL-{model_size}-Instruct"

    def _select_device(self, device: str) -> str:
        if device != "auto":
            return device
        if torch.backends.mps.is_available():
            return "mps"
        elif torch.cuda.is_available():
            return "cuda"
        return "cpu"

    def load_model(self):
        """Load the model into memory."""
        if self.model is not None:
            return

        from transformers import Qwen2VLForConditionalGeneration, AutoProcessor

        print(f"Loading {self.model_id} on {self.device}...")
        start = time.time()

        self.processor = AutoProcessor.from_pretrained(
            self.model_id, trust_remote_code=True
        )

        # MPS-compatible loading
        extra_kwargs = {}
        if self.device == "mps":
            extra_kwargs["attn_implementation"] = "eager"

        self.model = Qwen2VLForConditionalGeneration.from_pretrained(
            self.model_id,
            torch_dtype=torch.float16,
            low_cpu_mem_usage=True,
            trust_remote_code=True,
            **extra_kwargs,
        ).to(self.device)

        # Sync MPS
        if self.device == "mps":
            torch.mps.synchronize()

        elapsed = time.time() - start
        print(f"Model loaded in {elapsed:.1f}s")

        # Memory info
        try:
            import psutil
            mem = psutil.Process().memory_info().rss / (1024**3)
            print(f"Process memory: {mem:.1f} GB")
        except ImportError:
            pass

    def extract_image(self, image: Image.Image, prompt: str) -> ExtractionResult:
        """Extract from a single PIL Image."""
        self.load_model()

        start = time.time()

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
        )
        inputs = {k: v.to(self.device) for k, v in inputs.items()}

        with torch.no_grad():
            outputs = self.model.generate(
                **inputs,
                max_new_tokens=1536,
                do_sample=False,
                pad_token_id=self.processor.tokenizer.pad_token_id,
            )

        if self.device == "mps":
            torch.mps.synchronize()

        generated_ids = outputs[:, inputs["input_ids"].shape[1]:]
        response = self.processor.batch_decode(
            generated_ids, skip_special_tokens=True
        )[0]

        elapsed = time.time() - start

        # Parse JSON
        parsed, error = self._parse_json(response)

        return ExtractionResult(
            success=error is None,
            data=parsed if error is None else {},
            raw_response=response,
            processing_time_s=elapsed,
            error=error,
        )

    def extract_file(self, file_path: str | Path, doc_type: str = "auto") -> dict:
        """Extract from a file (image or PDF)."""
        path = Path(file_path)

        if path.suffix.lower() == ".pdf":
            return self.extract_pdf(path, doc_type)
        else:
            return self.extract_image_file(path, doc_type)

    def extract_image_file(self, path: Path, doc_type: str = "auto") -> dict:
        """Extract from an image file."""
        if doc_type == "auto":
            doc_type = "receipt"

        prompt = BANK_STATEMENT_PROMPT if doc_type == "bank_statement" else RECEIPT_PROMPT
        image = Image.open(path).convert("RGB")

        result = self.extract_image(image, prompt)

        return {
            "transactions": [result.data] if result.success and isinstance(result.data, dict) else
                           result.data if result.success else [],
            "errors": [{"error": result.error, "raw": result.raw_response[:500]}] if result.error else None,
            "page_count": 1,
            "processing_time_s": result.processing_time_s,
            "doc_type": doc_type,
        }

    def extract_pdf(self, path: Path, doc_type: str = "auto") -> dict:
        """Extract from a PDF file."""
        if doc_type == "auto":
            doc_type = "bank_statement"

        prompt = BANK_STATEMENT_PROMPT if doc_type == "bank_statement" else RECEIPT_PROMPT

        # Convert PDF pages to images
        doc = fitz.open(path)
        page_count = len(doc)

        print(f"Processing {page_count} pages...")

        all_transactions = []
        errors = []
        total_time = 0

        for page_num in range(page_count):
            page = doc[page_num]
            # Render at 150 DPI
            mat = fitz.Matrix(150/72, 150/72)
            pix = page.get_pixmap(matrix=mat)
            img_bytes = pix.tobytes("png")

            image = Image.open(io.BytesIO(img_bytes)).convert("RGB")

            print(f"  Page {page_num + 1}/{page_count}...", end=" ", flush=True)
            result = self.extract_image(image, prompt)
            print(f"{result.processing_time_s:.1f}s")

            total_time += result.processing_time_s

            if result.success:
                if isinstance(result.data, list):
                    for txn in result.data:
                        txn["page"] = page_num + 1
                    all_transactions.extend(result.data)
                else:
                    result.data["page"] = page_num + 1
                    all_transactions.append(result.data)
            else:
                errors.append({
                    "page": page_num + 1,
                    "error": result.error,
                    "raw": result.raw_response[:500],
                })

        doc.close()

        return {
            "transactions": all_transactions,
            "errors": errors if errors else None,
            "page_count": page_count,
            "processing_time_s": total_time,
            "doc_type": doc_type,
        }

    def _parse_json(self, response: str) -> tuple[dict | list, Optional[str]]:
        """Parse JSON from model response, handling truncation."""
        try:
            text = response.strip()

            # Strip markdown code blocks
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0]
            elif "```" in text:
                text = text.split("```")[1].split("```")[0]

            # Find JSON
            start_bracket = text.find("[")
            start_brace = text.find("{")

            if start_bracket != -1 and (start_brace == -1 or start_bracket < start_brace):
                # JSON array
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
                end = text.rfind("}") + 1
                if end > start_brace:
                    text = text[start_brace:end]

            return json.loads(text), None

        except Exception as e:
            return {}, str(e)


def pdf_page_to_image(pdf_bytes: bytes, page_num: int) -> bytes:
    """Convert a PDF page to PNG bytes."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page = doc[page_num]
    mat = fitz.Matrix(150/72, 150/72)
    pix = page.get_pixmap(matrix=mat)
    img_bytes = pix.tobytes("png")
    doc.close()
    return img_bytes


# For multiprocessing - each worker loads its own model
_worker_extractor: Optional[LocalExtractor] = None


def _init_worker(model_size: str, device: str):
    """Initialize worker process with model."""
    global _worker_extractor
    _worker_extractor = LocalExtractor(model_size=model_size, device=device)
    _worker_extractor.load_model()


def _extract_page(args: tuple) -> dict:
    """Extract from a single page (called in worker process)."""
    img_bytes, page_num, prompt = args
    image = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    result = _worker_extractor.extract_image(image, prompt)

    data = result.data
    if result.success:
        if isinstance(data, list):
            for txn in data:
                txn["page"] = page_num + 1
        else:
            data["page"] = page_num + 1

    return {
        "page": page_num + 1,
        "success": result.success,
        "data": data,
        "error": result.error,
        "raw": result.raw_response[:500] if result.error else None,
        "time_s": result.processing_time_s,
    }


class ParallelExtractor:
    """Parallel PDF extraction using multiple processes."""

    def __init__(self, model_size: str = "7B", device: str = "auto", workers: int = 1):
        self.model_size = model_size
        self.device = device
        self.workers = workers

    def extract_pdf_parallel(self, path: Path, doc_type: str = "bank_statement") -> dict:
        """Extract from PDF using parallel workers."""
        prompt = BANK_STATEMENT_PROMPT if doc_type == "bank_statement" else RECEIPT_PROMPT

        # Read PDF
        pdf_bytes = path.read_bytes()
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        page_count = len(doc)

        # Convert all pages to images first
        print(f"Converting {page_count} pages to images...")
        page_images = []
        for i in range(page_count):
            page = doc[i]
            mat = fitz.Matrix(150/72, 150/72)
            pix = page.get_pixmap(matrix=mat)
            page_images.append(pix.tobytes("png"))
        doc.close()

        print(f"Processing {page_count} pages with {self.workers} workers...")
        start = time.time()

        # Prepare args
        args = [(img, i, prompt) for i, img in enumerate(page_images)]

        if self.workers == 1:
            # Single process - simpler
            extractor = LocalExtractor(model_size=self.model_size, device=self.device)
            extractor.load_model()
            global _worker_extractor
            _worker_extractor = extractor
            results = [_extract_page(a) for a in args]
        else:
            # Multi-process
            with ProcessPoolExecutor(
                max_workers=self.workers,
                initializer=_init_worker,
                initargs=(self.model_size, self.device),
            ) as executor:
                results = list(executor.map(_extract_page, args))

        total_time = time.time() - start

        # Collect results
        all_transactions = []
        errors = []

        for r in sorted(results, key=lambda x: x["page"]):
            if r["success"]:
                if isinstance(r["data"], list):
                    all_transactions.extend(r["data"])
                else:
                    all_transactions.append(r["data"])
            else:
                errors.append({
                    "page": r["page"],
                    "error": r["error"],
                    "raw": r["raw"],
                })

        return {
            "transactions": all_transactions,
            "errors": errors if errors else None,
            "page_count": page_count,
            "processing_time_s": total_time,
            "doc_type": doc_type,
            "parallel": self.workers > 1,
            "workers": self.workers,
        }


def main():
    """CLI interface."""
    import argparse

    parser = argparse.ArgumentParser(description="Local document extraction")
    parser.add_argument("file", help="Image or PDF file to extract from")
    parser.add_argument("--type", choices=["receipt", "bank_statement", "auto"],
                       default="auto", help="Document type")
    parser.add_argument("--model", choices=["2B", "7B"], default="7B",
                       help="Model size")
    parser.add_argument("--device", default="auto",
                       help="Device (auto, mps, cuda, cpu)")
    parser.add_argument("--workers", type=int, default=1,
                       help="Number of parallel workers for PDF")
    parser.add_argument("--output", "-o", help="Output JSON file")

    args = parser.parse_args()

    path = Path(args.file)
    if not path.exists():
        print(f"File not found: {path}")
        return 1

    gc.collect()
    if torch.backends.mps.is_available():
        torch.mps.empty_cache()

    if path.suffix.lower() == ".pdf" and args.workers > 1:
        extractor = ParallelExtractor(
            model_size=args.model,
            device=args.device,
            workers=args.workers,
        )
        result = extractor.extract_pdf_parallel(path, args.type)
    else:
        extractor = LocalExtractor(model_size=args.model, device=args.device)
        result = extractor.extract_file(path, args.type)

    # Output
    print("\n" + "="*60)
    print(f"Transactions: {len(result['transactions'])}")
    print(f"Errors: {len(result.get('errors') or [])}")
    print(f"Pages: {result['page_count']}")
    print(f"Time: {result['processing_time_s']:.1f}s")
    print("="*60)

    if args.output:
        with open(args.output, 'w') as f:
            json.dump(result, f, indent=2)
        print(f"Saved to {args.output}")
    else:
        print("\nSample transactions:")
        for t in result['transactions'][:10]:
            date = t.get('date', 'N/A')
            desc = str(t.get('description', t.get('merchant', 'N/A')))[:35]
            amt = t.get('amount', t.get('total', 'N/A'))
            print(f"  {date:12} | {desc:35} | {amt}")

    return 0


if __name__ == "__main__":
    exit(main())
