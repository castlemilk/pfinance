"""Qwen2-VL model wrapper using MLX for Apple Silicon."""

import json
import re
import time
import uuid
from typing import Any, Optional

import structlog
from PIL import Image

from ..schemas.extraction import (
    DocumentType,
    ExpenseCategory,
    ExtractedTransaction,
)
from .base import BaseOCRModel

logger = structlog.get_logger()


# Merchant to category mapping
MERCHANT_CATEGORIES: dict[str, ExpenseCategory] = {
    "woolworths": ExpenseCategory.FOOD,
    "coles": ExpenseCategory.FOOD,
    "aldi": ExpenseCategory.FOOD,
    "mcdonalds": ExpenseCategory.FOOD,
    "starbucks": ExpenseCategory.FOOD,
    "berghotel": ExpenseCategory.FOOD,
    "restaurant": ExpenseCategory.FOOD,
    "cafe": ExpenseCategory.FOOD,
    "uber eats": ExpenseCategory.FOOD,
    "uber": ExpenseCategory.TRANSPORTATION,
    "shell": ExpenseCategory.TRANSPORTATION,
    "netflix": ExpenseCategory.ENTERTAINMENT,
    "spotify": ExpenseCategory.ENTERTAINMENT,
    "amazon": ExpenseCategory.SHOPPING,
    "pharmacy": ExpenseCategory.HEALTHCARE,
    "hotel": ExpenseCategory.TRAVEL,
    "airbnb": ExpenseCategory.TRAVEL,
}


def normalize_merchant(raw_merchant: str) -> tuple[str, ExpenseCategory]:
    """Normalize a merchant name and determine its category."""
    lower = raw_merchant.lower().strip()

    for key, category in MERCHANT_CATEGORIES.items():
        if key in lower:
            name = " ".join(word.capitalize() for word in raw_merchant.split())
            return name[:50], category

    name = " ".join(word.capitalize() for word in raw_merchant.split() if len(word) > 1)
    return name[:50] or raw_merchant[:50], ExpenseCategory.OTHER


class Qwen2VLMLXModel(BaseOCRModel):
    """Qwen2-VL model using MLX for native Apple Silicon acceleration.

    This provides significantly faster inference on Mac compared to PyTorch MPS.
    - Load time: ~2.6s (vs 37-174s with PyTorch)
    - Inference: ~4.3s (vs 16-130s with PyTorch)
    - Correct results (PyTorch MPS had accuracy issues with 7B)
    """

    def __init__(
        self,
        model_id: str = "Qwen/Qwen2-VL-7B-Instruct",
        quantized: bool = False,
    ):
        """Initialize the MLX Qwen2-VL model.

        Args:
            model_id: HuggingFace model ID
            quantized: Use 4-bit quantized version (smaller, slightly less accurate)
        """
        if quantized:
            self._model_id = "mlx-community/Qwen2-VL-7B-Instruct-4bit"
        else:
            self._model_id = model_id
        self._model: Any = None
        self._processor: Any = None
        self._config: Any = None
        self._is_loaded = False

    @property
    def model_name(self) -> str:
        if "4bit" in self._model_id:
            return "Qwen2-VL-7B-MLX-4bit"
        return "Qwen2-VL-7B-MLX"

    @property
    def is_loaded(self) -> bool:
        return self._is_loaded

    async def load(self) -> None:
        """Load the MLX model."""
        if self._is_loaded:
            return

        try:
            from mlx_vlm import load
            from mlx_vlm.utils import load_config
        except ImportError:
            raise RuntimeError(
                "mlx-vlm not installed. Install with: pip install mlx-vlm"
            )

        logger.info("Loading Qwen2-VL with MLX", model_id=self._model_id)
        start_time = time.time()

        try:
            self._model, self._processor = load(self._model_id)
            self._config = load_config(self._model_id)
            self._is_loaded = True

            load_time = time.time() - start_time
            logger.info(
                "MLX model loaded successfully",
                load_time_s=f"{load_time:.1f}",
            )

        except Exception as e:
            logger.error("Failed to load MLX model", error=str(e))
            raise RuntimeError(f"Failed to load MLX model: {e}")

    async def extract_from_image(
        self,
        image: Image.Image,
        document_type: DocumentType,
    ) -> tuple[list[ExtractedTransaction], float]:
        """Extract transactions from an image using MLX."""
        if not self._is_loaded:
            await self.load()

        from mlx_vlm import generate
        from mlx_vlm.prompt_utils import apply_chat_template

        # Save image temporarily (mlx-vlm needs file path)
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
            image.save(f, format="JPEG")
            image_path = f.name

        logger.info(
            "Processing image with MLX",
            document_type=document_type.value,
            image_size=image.size,
        )

        start_time = time.time()

        try:
            # Create prompt based on document type
            if document_type == DocumentType.RECEIPT:
                prompt = self._get_receipt_prompt()
            else:
                prompt = self._get_bank_statement_prompt()

            # Apply chat template
            formatted_prompt = apply_chat_template(
                self._processor, self._config, prompt, num_images=1
            )

            # Generate response
            result = generate(
                self._model,
                self._processor,
                formatted_prompt,
                [image_path],
                max_tokens=512,
                temp=0.0,
                verbose=False,
            )

            response = result.text if hasattr(result, 'text') else str(result)
            processing_time = time.time() - start_time

            # Parse response
            transactions, confidence = self._parse_response(response, document_type)

            logger.info(
                "MLX extraction complete",
                transaction_count=len(transactions),
                confidence=confidence,
                processing_time_s=f"{processing_time:.1f}",
                tokens_per_sec=f"{result.generation_tps:.1f}" if hasattr(result, 'generation_tps') else "N/A",
            )

            return transactions, confidence

        except Exception as e:
            logger.error("MLX extraction failed", error=str(e))
            raise

        finally:
            # Cleanup temp file
            import os
            try:
                os.unlink(image_path)
            except:
                pass

    async def extract_from_pdf(
        self,
        pdf_bytes: bytes,
        document_type: DocumentType,
    ) -> tuple[list[ExtractedTransaction], float, int]:
        """Extract transactions from a PDF."""
        if not self._is_loaded:
            await self.load()

        try:
            from pdf2image import convert_from_bytes

            images = convert_from_bytes(pdf_bytes, dpi=200)
            page_count = len(images)

            logger.info("Processing PDF with MLX", page_count=page_count)

            all_transactions: list[ExtractedTransaction] = []
            total_confidence = 0.0

            for i, image in enumerate(images):
                logger.info(f"Processing page {i + 1}/{page_count}")
                transactions, confidence = await self.extract_from_image(image, document_type)
                all_transactions.extend(transactions)
                total_confidence += confidence

            avg_confidence = total_confidence / page_count if page_count > 0 else 0.0

            return all_transactions, avg_confidence, page_count

        except ImportError:
            raise RuntimeError("PDF processing requires pdf2image and poppler")

    def _get_receipt_prompt(self) -> str:
        return """Analyze this receipt and extract:
1. Merchant name
2. Date (YYYY-MM-DD format)
3. Total amount

Return ONLY valid JSON:
{"merchant": "Name", "date": "YYYY-MM-DD", "total": 0.00, "confidence": 0.95}"""

    def _get_bank_statement_prompt(self) -> str:
        return """Extract all transactions from this bank statement.

Return a JSON array:
[{"date": "YYYY-MM-DD", "description": "Merchant", "amount": 0.00, "is_debit": true}]

Return ONLY valid JSON."""

    def _parse_response(
        self,
        response: str,
        document_type: DocumentType,
    ) -> tuple[list[ExtractedTransaction], float]:
        """Parse the model response."""
        transactions: list[ExtractedTransaction] = []

        try:
            # Clean response
            text = response.strip()

            # Remove markdown code blocks
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0]
            elif "```" in text:
                parts = text.split("```")
                if len(parts) > 1:
                    text = parts[1]

            # Find JSON
            start_idx = text.find("{")
            end_idx = text.rfind("}") + 1
            if start_idx == -1 or end_idx <= start_idx:
                start_idx = text.find("[")
                end_idx = text.rfind("]") + 1

            if start_idx == -1 or end_idx <= start_idx:
                logger.warning("No JSON found in MLX response")
                return [], 0.0

            json_str = text[start_idx:end_idx]
            data = json.loads(json_str)

            if isinstance(data, dict):
                transactions = self._parse_receipt_response(data)
                confidence = data.get("confidence", 0.95)
            elif isinstance(data, list):
                transactions = self._parse_array_response(data)
                confidence = 0.9

            return transactions, confidence

        except json.JSONDecodeError as e:
            logger.error("Failed to parse MLX JSON response", error=str(e))
            return [], 0.0

    def _parse_receipt_response(self, data: dict) -> list[ExtractedTransaction]:
        """Parse receipt response."""
        transactions: list[ExtractedTransaction] = []

        merchant = data.get("merchant", "Unknown")
        normalized_merchant, category = normalize_merchant(merchant)
        date_str = data.get("date", "")
        confidence = data.get("confidence", 0.95)

        if data.get("total"):
            transactions.append(
                ExtractedTransaction(
                    id=str(uuid.uuid4()),
                    date=date_str,
                    description=merchant,
                    normalized_merchant=normalized_merchant,
                    amount=float(data["total"]),
                    suggested_category=category,
                    confidence=confidence,
                    is_debit=True,
                )
            )

        return transactions

    def _parse_array_response(self, data: list) -> list[ExtractedTransaction]:
        """Parse array response (bank statements)."""
        transactions: list[ExtractedTransaction] = []

        for item in data:
            if not isinstance(item, dict):
                continue

            description = item.get("description", "")
            amount = item.get("amount")

            if not description or amount is None:
                continue

            if isinstance(amount, str):
                amount = float(re.sub(r"[^0-9.-]", "", amount))

            if amount <= 0:
                continue

            normalized_merchant, category = normalize_merchant(description)

            transactions.append(
                ExtractedTransaction(
                    id=str(uuid.uuid4()),
                    date=item.get("date", ""),
                    description=description,
                    normalized_merchant=normalized_merchant,
                    amount=float(amount),
                    suggested_category=category,
                    confidence=0.9,
                    is_debit=item.get("is_debit", True),
                )
            )

        return transactions
