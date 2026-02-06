"""PaddleOCR-VL model wrapper for document extraction."""

import io
import json
import re
import uuid
from typing import Any, Optional

import structlog
from PIL import Image

from ..schemas.extraction import (
    DocumentType,
    ExpenseCategory,
    ExtractedTransaction,
)
from ..prompts.receipt import get_receipt_extraction_prompt
from ..prompts.bank_statement import get_bank_statement_extraction_prompt
from .base import BaseOCRModel

logger = structlog.get_logger()


# Merchant to category mapping
MERCHANT_CATEGORIES: dict[str, ExpenseCategory] = {
    # Grocery stores
    "woolworths": ExpenseCategory.FOOD,
    "coles": ExpenseCategory.FOOD,
    "aldi": ExpenseCategory.FOOD,
    "costco": ExpenseCategory.FOOD,
    "whole foods": ExpenseCategory.FOOD,
    "trader joe": ExpenseCategory.FOOD,
    # Fast food & restaurants
    "mcdonalds": ExpenseCategory.FOOD,
    "starbucks": ExpenseCategory.FOOD,
    "subway": ExpenseCategory.FOOD,
    "dominos": ExpenseCategory.FOOD,
    "kfc": ExpenseCategory.FOOD,
    "burger king": ExpenseCategory.FOOD,
    # Food delivery
    "uber eats": ExpenseCategory.FOOD,
    "doordash": ExpenseCategory.FOOD,
    "deliveroo": ExpenseCategory.FOOD,
    "menulog": ExpenseCategory.FOOD,
    # Transportation
    "uber": ExpenseCategory.TRANSPORTATION,
    "lyft": ExpenseCategory.TRANSPORTATION,
    "shell": ExpenseCategory.TRANSPORTATION,
    "bp": ExpenseCategory.TRANSPORTATION,
    "caltex": ExpenseCategory.TRANSPORTATION,
    "7-eleven": ExpenseCategory.TRANSPORTATION,
    "opal": ExpenseCategory.TRANSPORTATION,
    # Entertainment
    "netflix": ExpenseCategory.ENTERTAINMENT,
    "spotify": ExpenseCategory.ENTERTAINMENT,
    "disney": ExpenseCategory.ENTERTAINMENT,
    "hulu": ExpenseCategory.ENTERTAINMENT,
    "cinema": ExpenseCategory.ENTERTAINMENT,
    # Shopping
    "amazon": ExpenseCategory.SHOPPING,
    "ebay": ExpenseCategory.SHOPPING,
    "target": ExpenseCategory.SHOPPING,
    "walmart": ExpenseCategory.SHOPPING,
    "ikea": ExpenseCategory.SHOPPING,
    "jb hi-fi": ExpenseCategory.SHOPPING,
    # Healthcare
    "pharmacy": ExpenseCategory.HEALTHCARE,
    "chemist": ExpenseCategory.HEALTHCARE,
    "cvs": ExpenseCategory.HEALTHCARE,
    "walgreens": ExpenseCategory.HEALTHCARE,
    # Utilities
    "telstra": ExpenseCategory.UTILITIES,
    "optus": ExpenseCategory.UTILITIES,
    "vodafone": ExpenseCategory.UTILITIES,
    "origin energy": ExpenseCategory.UTILITIES,
    # Travel
    "airbnb": ExpenseCategory.TRAVEL,
    "booking.com": ExpenseCategory.TRAVEL,
    "qantas": ExpenseCategory.TRAVEL,
    "hotel": ExpenseCategory.TRAVEL,
}


def normalize_merchant(raw_merchant: str) -> tuple[str, ExpenseCategory]:
    """
    Normalize a merchant name and determine its category.

    Returns:
        Tuple of (normalized name, suggested category)
    """
    lower = raw_merchant.lower().strip()

    # Remove common prefixes/suffixes
    cleaned = re.sub(
        r"^(pos |eftpos |visa |mastercard |amex |paypal \*)", "", lower, flags=re.IGNORECASE
    )
    cleaned = re.sub(r"\s+(pty|ltd|inc|corp|llc|au|us|uk|nz)\.?$", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\d{6,}", "", cleaned)  # Remove long numbers
    cleaned = re.sub(r"[*#]+", "", cleaned)
    cleaned = cleaned.strip()

    # Check for known merchants
    for key, category in MERCHANT_CATEGORIES.items():
        if key in cleaned:
            # Title case the merchant name
            name = " ".join(word.capitalize() for word in raw_merchant.split())
            return name[:50], category

    # Default: clean the name, mark as Other
    name = " ".join(word.capitalize() for word in raw_merchant.split() if len(word) > 1)
    return name[:50] or raw_merchant[:50], ExpenseCategory.OTHER


class PaddleOCRModel(BaseOCRModel):
    """PaddleOCR-VL model for document extraction."""

    def __init__(self, model_path: Optional[str] = None, device: str = "cpu"):
        """
        Initialize the PaddleOCR model.

        Args:
            model_path: Optional path to local model weights
            device: Device to run on ('cpu' or 'cuda')
        """
        self._model_path = model_path
        self._device = device
        self._model: Any = None
        self._processor: Any = None
        self._is_loaded = False

    @property
    def model_name(self) -> str:
        return "PaddleOCR-VL-1.5"

    @property
    def is_loaded(self) -> bool:
        return self._is_loaded

    async def load(self) -> None:
        """Load the PaddleOCR model."""
        if self._is_loaded:
            return

        logger.info("Loading PaddleOCR-VL model", device=self._device)

        try:
            # For PaddleOCR-VL, we use the transformers library
            from transformers import AutoModelForCausalLM, AutoProcessor
            import torch

            model_id = self._model_path or "PaddlePaddle/PaddleOCR-VL-1.5"

            self._processor = AutoProcessor.from_pretrained(
                model_id,
                trust_remote_code=True,
            )

            device_map = "auto" if self._device == "cuda" else "cpu"
            torch_dtype = torch.float16 if self._device == "cuda" else torch.float32

            self._model = AutoModelForCausalLM.from_pretrained(
                model_id,
                torch_dtype=torch_dtype,
                device_map=device_map,
                trust_remote_code=True,
            )

            self._is_loaded = True
            logger.info("PaddleOCR-VL model loaded successfully")

        except Exception as e:
            logger.error("Failed to load PaddleOCR-VL model", error=str(e))
            raise RuntimeError(f"Failed to load model: {e}")

    async def extract_from_image(
        self,
        image: Image.Image,
        document_type: DocumentType,
    ) -> tuple[list[ExtractedTransaction], float]:
        """Extract transactions from an image."""
        if not self._is_loaded:
            await self.load()

        # Get the appropriate prompt
        if document_type == DocumentType.RECEIPT:
            prompt = get_receipt_extraction_prompt()
        else:
            prompt = get_bank_statement_extraction_prompt()

        logger.info(
            "Processing image",
            document_type=document_type.value,
            image_size=image.size,
        )

        try:
            # Process with the model
            inputs = self._processor(
                images=image,
                text=prompt,
                return_tensors="pt",
            )

            if self._device == "cuda":
                inputs = {k: v.to("cuda") for k, v in inputs.items()}

            # Generate response
            import torch

            with torch.no_grad():
                outputs = self._model.generate(
                    **inputs,
                    max_new_tokens=4096,
                    do_sample=False,
                    temperature=0.1,
                )

            # Decode response
            response = self._processor.decode(outputs[0], skip_special_tokens=True)

            # Parse the JSON response
            transactions, confidence = self._parse_response(response, document_type)

            logger.info(
                "Image extraction complete",
                transaction_count=len(transactions),
                confidence=confidence,
            )

            return transactions, confidence

        except Exception as e:
            logger.error("Image extraction failed", error=str(e))
            raise

    async def extract_from_pdf(
        self,
        pdf_bytes: bytes,
        document_type: DocumentType,
    ) -> tuple[list[ExtractedTransaction], float, int]:
        """Extract transactions from a PDF."""
        if not self._is_loaded:
            await self.load()

        try:
            # Convert PDF to images
            from pdf2image import convert_from_bytes

            images = convert_from_bytes(pdf_bytes, dpi=200)
            page_count = len(images)

            logger.info("Processing PDF", page_count=page_count, document_type=document_type.value)

            all_transactions: list[ExtractedTransaction] = []
            total_confidence = 0.0

            for i, image in enumerate(images):
                logger.info(f"Processing page {i + 1}/{page_count}")
                transactions, confidence = await self.extract_from_image(image, document_type)
                all_transactions.extend(transactions)
                total_confidence += confidence

            avg_confidence = total_confidence / page_count if page_count > 0 else 0.0

            logger.info(
                "PDF extraction complete",
                transaction_count=len(all_transactions),
                avg_confidence=avg_confidence,
            )

            return all_transactions, avg_confidence, page_count

        except ImportError:
            logger.error("pdf2image not installed")
            raise RuntimeError("PDF processing requires pdf2image and poppler")
        except Exception as e:
            logger.error("PDF extraction failed", error=str(e))
            raise

    def _parse_response(
        self,
        response: str,
        document_type: DocumentType,
    ) -> tuple[list[ExtractedTransaction], float]:
        """Parse the model response into structured transactions."""
        transactions: list[ExtractedTransaction] = []

        try:
            # Find JSON in response
            json_match = re.search(r"\{[\s\S]*\}|\[[\s\S]*\]", response)
            if not json_match:
                logger.warning("No JSON found in response")
                return [], 0.0

            json_str = json_match.group()
            data = json.loads(json_str)

            # Handle receipt format (object with merchant/total)
            if isinstance(data, dict):
                if "error" in data:
                    logger.warning("Model returned error", error=data["error"])
                    return [], 0.0

                transactions = self._parse_receipt_response(data)
                confidence = data.get("confidence", 0.85)

            # Handle array format (bank statements)
            elif isinstance(data, list):
                transactions = self._parse_array_response(data)
                confidence = (
                    sum(t.confidence for t in transactions) / len(transactions)
                    if transactions
                    else 0.0
                )

            return transactions, confidence

        except json.JSONDecodeError as e:
            logger.error("Failed to parse JSON response", error=str(e))
            return [], 0.0

    def _parse_receipt_response(self, data: dict) -> list[ExtractedTransaction]:
        """Parse receipt-format response."""
        transactions: list[ExtractedTransaction] = []

        merchant = data.get("merchant", "Unknown")
        normalized_merchant, category = normalize_merchant(merchant)
        date_str = data.get("date", "")
        confidence = data.get("confidence", 0.85)

        # Add main total transaction
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

        # Add line items if present
        items = data.get("items", [])
        if items:
            for item in items:
                item_name = item.get("description", "")
                item_amount = item.get("amount", 0)
                item_qty = item.get("quantity", 1)

                if item_amount and item_amount > 0:
                    # Get category from item if specified, otherwise use merchant category
                    item_category_str = item.get("category", "")
                    try:
                        item_category = ExpenseCategory(item_category_str) if item_category_str else category
                    except ValueError:
                        item_category = category

                    transactions.append(
                        ExtractedTransaction(
                            id=str(uuid.uuid4()),
                            date=date_str,
                            description=f"{normalized_merchant} - {item_name}",
                            normalized_merchant=normalized_merchant,
                            amount=float(item_amount) * item_qty,
                            suggested_category=item_category,
                            confidence=confidence * 0.9,  # Slightly lower for line items
                            is_debit=True,
                        )
                    )

        return transactions

    def _parse_array_response(self, data: list) -> list[ExtractedTransaction]:
        """Parse array-format response (bank statements)."""
        transactions: list[ExtractedTransaction] = []

        for item in data:
            if not isinstance(item, dict):
                continue

            description = item.get("description", "")
            amount = item.get("amount")

            if not description or amount is None:
                continue

            # Parse amount
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
                    confidence=item.get("confidence", 0.8),
                    is_debit=item.get("is_debit", True),
                    reference=item.get("reference"),
                )
            )

        return transactions
