"""Silver label generator using Gemini API.

Processes bank statement PDFs through Gemini to produce per-page
transaction labels in the format required by the training pipeline.

Usage:
    python -m src.models.statement_parser.label_generator \
        --input-dir data/raw_statements \
        --output-dir data/labeled_statements \
        --gemini-api-key $GEMINI_API_KEY

Input directory structure:
    raw_statements/
        cba/
            statement_001.pdf
        westpac/
            statement_002.pdf

Output: copies PDFs and generates per-page JSON labels alongside them.
"""

import argparse
import base64
import json
import os
import sys
import time
from pathlib import Path
from typing import Optional

import fitz  # PyMuPDF

# Optional import for API calls
try:
    import google.generativeai as genai

    HAS_GENAI = True
except ImportError:
    HAS_GENAI = False


EXTRACTION_PROMPT = """You are a precise bank statement parser. Extract ALL transactions from this bank statement page.

For each transaction, return:
- date: the transaction date exactly as shown (e.g., "15/01/2025" or "15 Jan 25")
- description: the full transaction description/narrative
- amount: the numeric amount (positive number, no currency symbol)
- is_debit: true if money was taken out, false if money was deposited
- balance: the running balance after this transaction (if shown), null if not visible

Also extract:
- opening_balance: the opening/starting balance if shown on this page
- closing_balance: the closing/ending balance if shown on this page

Return ONLY valid JSON in this exact format:
{
    "transactions": [
        {
            "date": "15/01/2025",
            "description": "WOOLWORTHS 1234 MELBOURNE",
            "amount": 52.30,
            "is_debit": true,
            "balance": 1234.56
        }
    ],
    "opening_balance": 1286.86,
    "closing_balance": 1234.56
}

If there are no transactions on this page, return {"transactions": [], "opening_balance": null, "closing_balance": null}.
Do NOT include any markdown formatting or code blocks. Return ONLY the JSON object."""


class GeminiLabelGenerator:
    """Generates silver labels for bank statement pages using Gemini."""

    def __init__(
        self,
        api_key: str,
        model: str = "gemini-2.0-flash",
        requests_per_minute: int = 15,
    ):
        if not HAS_GENAI:
            raise ImportError(
                "google-generativeai package required. "
                "Install with: pip install google-generativeai"
            )

        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel(model)
        self.min_interval = 60.0 / requests_per_minute
        self._last_request_time = 0.0

    def generate_labels(
        self,
        input_dir: str,
        output_dir: str,
        bank_filter: Optional[str] = None,
        max_pages_per_pdf: int = 20,
        skip_existing: bool = True,
    ) -> dict:
        """Generate silver labels for all PDFs in input directory.

        Returns summary stats.
        """
        input_path = Path(input_dir)
        output_path = Path(output_dir)

        stats = {
            "pdfs_processed": 0,
            "pages_labeled": 0,
            "transactions_found": 0,
            "errors": 0,
            "skipped": 0,
        }

        for bank_dir in sorted(input_path.iterdir()):
            if not bank_dir.is_dir():
                continue

            bank = bank_dir.name
            if bank_filter and bank != bank_filter:
                continue

            out_bank_dir = output_path / bank
            out_bank_dir.mkdir(parents=True, exist_ok=True)

            for pdf_file in sorted(bank_dir.glob("*.pdf")):
                print(f"Processing: {bank}/{pdf_file.name}")

                # Copy PDF to output directory
                out_pdf = out_bank_dir / pdf_file.name
                if not out_pdf.exists():
                    import shutil

                    shutil.copy2(pdf_file, out_pdf)

                # Process each page
                try:
                    pdf_bytes = pdf_file.read_bytes()
                    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
                    n_pages = min(len(doc), max_pages_per_pdf)

                    for page_idx in range(n_pages):
                        stem = pdf_file.stem
                        label_file = out_bank_dir / f"{stem}_page{page_idx}.json"

                        if skip_existing and label_file.exists():
                            stats["skipped"] += 1
                            continue

                        # Render page as image for Gemini
                        page = doc[page_idx]
                        page_image = self._render_page(page)

                        # Call Gemini
                        result = self._extract_page(page_image, bank)

                        if result is not None:
                            result["bank"] = bank
                            result["source"] = "gemini"
                            result["confidence"] = 0.85  # Gemini silver label confidence
                            result["page_number"] = page_idx
                            result["pdf_file"] = pdf_file.name

                            with open(label_file, "w") as f:
                                json.dump(result, f, indent=2)

                            n_txns = len(result.get("transactions", []))
                            stats["transactions_found"] += n_txns
                            stats["pages_labeled"] += 1
                            print(f"  Page {page_idx}: {n_txns} transactions")
                        else:
                            stats["errors"] += 1

                    doc.close()
                    stats["pdfs_processed"] += 1

                except Exception as e:
                    print(f"  Error processing {pdf_file.name}: {e}")
                    stats["errors"] += 1

        return stats

    def _extract_page(self, page_image: bytes, bank: str) -> Optional[dict]:
        """Extract transactions from a single page image using Gemini."""
        # Rate limiting
        elapsed = time.time() - self._last_request_time
        if elapsed < self.min_interval:
            time.sleep(self.min_interval - elapsed)

        try:
            response = self.model.generate_content(
                [
                    EXTRACTION_PROMPT,
                    {"mime_type": "image/png", "data": base64.b64encode(page_image).decode()},
                ],
                generation_config=genai.GenerationConfig(
                    temperature=0.1,
                    max_output_tokens=4096,
                ),
            )
            self._last_request_time = time.time()

            # Parse JSON response
            text = response.text.strip()
            # Remove markdown code blocks if present
            if text.startswith("```"):
                text = text.split("\n", 1)[1]
                if text.endswith("```"):
                    text = text[:-3]
                text = text.strip()

            result = json.loads(text)

            # Validate structure
            if "transactions" not in result:
                result = {"transactions": [], "opening_balance": None, "closing_balance": None}

            # Validate each transaction
            valid_txns = []
            for txn in result["transactions"]:
                if self._validate_transaction(txn):
                    valid_txns.append(txn)

            result["transactions"] = valid_txns
            return result

        except json.JSONDecodeError as e:
            print(f"  JSON parse error: {e}")
            return None
        except Exception as e:
            print(f"  Gemini API error: {e}")
            return None

    def _validate_transaction(self, txn: dict) -> bool:
        """Validate a transaction has required fields with reasonable values."""
        required = ["date", "description", "amount", "is_debit"]
        if not all(k in txn for k in required):
            return False

        # Amount must be a positive number
        try:
            amount = float(txn["amount"])
            if amount <= 0:
                return False
            txn["amount"] = amount
        except (ValueError, TypeError):
            return False

        # is_debit must be boolean
        if not isinstance(txn["is_debit"], bool):
            return False

        # Date must be non-empty string
        if not isinstance(txn["date"], str) or not txn["date"].strip():
            return False

        # Description must be non-empty
        if not isinstance(txn["description"], str) or not txn["description"].strip():
            return False

        # Balance is optional but must be numeric if present
        if "balance" in txn and txn["balance"] is not None:
            try:
                txn["balance"] = float(txn["balance"])
            except (ValueError, TypeError):
                txn["balance"] = None

        return True

    def _render_page(self, page: fitz.Page, dpi: int = 200) -> bytes:
        """Render a PDF page as a PNG image."""
        mat = fitz.Matrix(dpi / 72, dpi / 72)
        pix = page.get_pixmap(matrix=mat)
        return pix.tobytes("png")


def main():
    parser = argparse.ArgumentParser(
        description="Generate silver labels for bank statement training"
    )
    parser.add_argument(
        "--input-dir",
        required=True,
        help="Directory with raw PDFs organized by bank",
    )
    parser.add_argument(
        "--output-dir",
        required=True,
        help="Output directory for labeled data",
    )
    parser.add_argument(
        "--gemini-api-key",
        default=os.environ.get("GEMINI_API_KEY"),
        help="Gemini API key (or set GEMINI_API_KEY env var)",
    )
    parser.add_argument(
        "--bank",
        default=None,
        help="Process only this bank (e.g., 'cba')",
    )
    parser.add_argument(
        "--max-pages",
        type=int,
        default=20,
        help="Max pages per PDF to process",
    )
    parser.add_argument(
        "--rpm",
        type=int,
        default=15,
        help="Gemini API requests per minute",
    )
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        default=True,
        help="Skip pages that already have labels",
    )

    args = parser.parse_args()

    if not args.gemini_api_key:
        print("Error: GEMINI_API_KEY required (env var or --gemini-api-key)")
        sys.exit(1)

    generator = GeminiLabelGenerator(
        api_key=args.gemini_api_key,
        requests_per_minute=args.rpm,
    )

    stats = generator.generate_labels(
        input_dir=args.input_dir,
        output_dir=args.output_dir,
        bank_filter=args.bank,
        max_pages_per_pdf=args.max_pages,
        skip_existing=args.skip_existing,
    )

    print("\n=== Label Generation Summary ===")
    for k, v in stats.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
