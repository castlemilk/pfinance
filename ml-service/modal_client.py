#!/usr/bin/env python3
"""
Modal API client for document extraction.

Calls the deployed Modal service for GPU-accelerated extraction.
Use this for local evaluations with fast GPU inference.
"""

import io
import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import httpx


# Default Modal endpoint
MODAL_ENDPOINT = "https://ben-ebsworth--pfinance-extraction-cheap-web-app.modal.run"


@dataclass
class ExtractionResult:
    """Result from extraction."""
    transactions: list[dict]
    errors: list[dict] | None
    page_count: int
    processing_time_s: float
    doc_type: str
    model: str = "Qwen2-VL-2B"
    gpu: str = "T4"


class ModalClient:
    """Client for Modal extraction API."""

    def __init__(self, endpoint: str = MODAL_ENDPOINT, timeout: float = 300.0):
        self.endpoint = endpoint.rstrip("/")
        self.timeout = timeout
        self.client = httpx.Client(timeout=timeout)

    def health_check(self) -> dict:
        """Check if the Modal service is healthy."""
        response = self.client.get(f"{self.endpoint}/health")
        response.raise_for_status()
        return response.json()

    def extract(
        self,
        file_path: Path,
        doc_type: str = "auto",
    ) -> ExtractionResult:
        """Extract from a file using Modal GPU."""
        start = time.time()

        with open(file_path, "rb") as f:
            files = {"file": (file_path.name, f)}
            data = {"doc_type": doc_type}

            response = self.client.post(
                f"{self.endpoint}/extract",
                files=files,
                data=data,
            )

        response.raise_for_status()
        result = response.json()

        processing_time = time.time() - start

        return ExtractionResult(
            transactions=result.get("transactions", []),
            errors=result.get("errors"),
            page_count=result.get("page_count", 1),
            processing_time_s=processing_time,
            doc_type=result.get("doc_type", doc_type),
            model=result.get("model", "Qwen2-VL-2B"),
            gpu=result.get("gpu", "T4"),
        )

    def extract_bytes(
        self,
        data: bytes,
        filename: str,
        doc_type: str = "auto",
    ) -> ExtractionResult:
        """Extract from bytes data."""
        start = time.time()

        files = {"file": (filename, io.BytesIO(data))}
        form_data = {"doc_type": doc_type}

        response = self.client.post(
            f"{self.endpoint}/extract",
            files=files,
            data=form_data,
        )

        response.raise_for_status()
        result = response.json()

        processing_time = time.time() - start

        return ExtractionResult(
            transactions=result.get("transactions", []),
            errors=result.get("errors"),
            page_count=result.get("page_count", 1),
            processing_time_s=processing_time,
            doc_type=result.get("doc_type", doc_type),
            model=result.get("model", "Qwen2-VL-2B"),
            gpu=result.get("gpu", "T4"),
        )


def main():
    """CLI interface."""
    import argparse

    parser = argparse.ArgumentParser(description="Extract documents via Modal API")
    parser.add_argument("file", help="Image or PDF file to extract from")
    parser.add_argument("--type", choices=["receipt", "receipt_items", "bank_statement", "auto"],
                       default="auto", help="Document type (receipt_items for line-item extraction)")
    parser.add_argument("--endpoint", default=MODAL_ENDPOINT,
                       help="Modal API endpoint")
    parser.add_argument("--output", "-o", help="Output JSON file")
    parser.add_argument("--health", action="store_true",
                       help="Check service health and exit")

    args = parser.parse_args()

    client = ModalClient(endpoint=args.endpoint)

    if args.health:
        try:
            health = client.health_check()
            print("Service is healthy:")
            print(json.dumps(health, indent=2))
            return 0
        except Exception as e:
            print(f"Service unhealthy: {e}")
            return 1

    path = Path(args.file)
    if not path.exists():
        print(f"File not found: {path}")
        return 1

    print(f"Extracting: {path.name}")
    print(f"Endpoint: {args.endpoint}")

    try:
        result = client.extract(path, args.type)
    except httpx.HTTPStatusError as e:
        print(f"HTTP error: {e.response.status_code}")
        print(e.response.text)
        return 1
    except Exception as e:
        print(f"Error: {e}")
        return 1

    print("\n" + "="*60)
    print(f"Transactions: {len(result.transactions)}")
    print(f"Errors: {len(result.errors) if result.errors else 0}")
    print(f"Pages: {result.page_count}")
    print(f"Time: {result.processing_time_s:.1f}s")
    print(f"Model: {result.model} on {result.gpu}")
    print("="*60)

    if args.output:
        output_data = {
            "transactions": result.transactions,
            "errors": result.errors,
            "page_count": result.page_count,
            "processing_time_s": result.processing_time_s,
            "doc_type": result.doc_type,
            "model": result.model,
            "gpu": result.gpu,
        }
        with open(args.output, 'w') as f:
            json.dump(output_data, f, indent=2)
        print(f"Saved to {args.output}")
    else:
        print("\nSample transactions:")
        for t in result.transactions[:15]:
            date = t.get('date', 'N/A')
            desc = str(t.get('description', t.get('merchant', 'N/A')))[:35]
            amt = t.get('amount', t.get('total', 'N/A'))
            print(f"  {date:12} | {desc:35} | {amt}")

    return 0


if __name__ == "__main__":
    exit(main())
