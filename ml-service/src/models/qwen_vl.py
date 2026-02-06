"""Qwen2-VL model wrapper for document extraction."""

import json
import re
import time
import uuid
from typing import Any, Optional

import structlog
import torch
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
    "berghotel": ExpenseCategory.FOOD,
    "restaurant": ExpenseCategory.FOOD,
    "cafe": ExpenseCategory.FOOD,
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
    """Normalize a merchant name and determine its category."""
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


def get_device_and_dtype():
    """Determine the best device and dtype for the current system."""
    if torch.cuda.is_available():
        return "cuda", torch.float16
    elif torch.backends.mps.is_available():
        return "mps", torch.float32  # MPS works best with float32
    else:
        return "cpu", torch.float32


class Qwen2VLModel(BaseOCRModel):
    """Qwen2-VL model for document extraction.

    Uses:
    - 2B model on MPS (Apple Silicon) - reliable and fast
    - 7B model on CUDA (GPU) - better accuracy
    - 2B model on CPU - fallback
    """

    def __init__(
        self,
        model_size: str = "auto",  # "auto", "2b", or "7b"
        device: Optional[str] = None,
    ):
        """Initialize the Qwen2-VL model."""
        self._model_size = model_size
        self._requested_device = device
        self._model: Any = None
        self._processor: Any = None
        self._is_loaded = False
        self._actual_device: str = "cpu"
        self._actual_dtype = torch.float32

    @property
    def model_name(self) -> str:
        if self._is_loaded:
            return f"Qwen2-VL-{self._model_size.upper()}"
        return "Qwen2-VL"

    @property
    def is_loaded(self) -> bool:
        return self._is_loaded

    def _select_model(self) -> tuple[str, str, torch.dtype]:
        """Select the appropriate model based on device and preferences."""
        device, dtype = get_device_and_dtype()

        # Override device if specified
        if self._requested_device:
            device = self._requested_device

        # Select model size
        if self._model_size == "auto":
            if device == "cuda":
                # Use 7B on CUDA for better accuracy
                model_id = "Qwen/Qwen2-VL-7B-Instruct"
                size = "7b"
            else:
                # Use 2B on MPS/CPU for reliability
                model_id = "Qwen/Qwen2-VL-2B-Instruct"
                size = "2b"
        elif self._model_size == "7b":
            model_id = "Qwen/Qwen2-VL-7B-Instruct"
            size = "7b"
            if device == "mps":
                logger.warning(
                    "7B model on MPS may have accuracy issues. Consider using 2B or CUDA."
                )
        else:
            model_id = "Qwen/Qwen2-VL-2B-Instruct"
            size = "2b"

        return model_id, size, device, dtype

    async def load(self) -> None:
        """Load the Qwen2-VL model."""
        if self._is_loaded:
            return

        from transformers import Qwen2VLForConditionalGeneration, AutoProcessor

        model_id, size, device, dtype = self._select_model()

        logger.info(
            "Loading Qwen2-VL model",
            model_id=model_id,
            device=device,
            dtype=str(dtype),
        )

        start_time = time.time()

        try:
            # Load processor
            self._processor = AutoProcessor.from_pretrained(
                model_id,
                trust_remote_code=True,
            )

            # Load model
            self._model = Qwen2VLForConditionalGeneration.from_pretrained(
                model_id,
                torch_dtype=dtype,
                low_cpu_mem_usage=True,
                trust_remote_code=True,
            )

            # Move to device
            if device == "mps":
                self._model = self._model.to(device)
                torch.mps.synchronize()
            elif device == "cuda":
                self._model = self._model.to(device)

            self._actual_device = device
            self._actual_dtype = dtype
            self._model_size = size
            self._is_loaded = True

            load_time = time.time() - start_time
            logger.info(
                "Qwen2-VL model loaded successfully",
                load_time_s=f"{load_time:.1f}",
                device=device,
            )

        except Exception as e:
            logger.error("Failed to load Qwen2-VL model", error=str(e))
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
            model=self.model_name,
        )

        start_time = time.time()

        try:
            # Prepare messages in Qwen2-VL format
            messages = [
                {
                    "role": "user",
                    "content": [
                        {"type": "image", "image": image},
                        {"type": "text", "text": prompt},
                    ],
                }
            ]

            # Apply chat template
            text = self._processor.apply_chat_template(
                messages, tokenize=False, add_generation_prompt=True
            )

            # Process inputs
            inputs = self._processor(
                text=[text],
                images=[image],
                padding=True,
                return_tensors="pt",
            )

            # Move to device
            inputs = {k: v.to(self._actual_device) for k, v in inputs.items()}

            # Generate response
            with torch.no_grad():
                outputs = self._model.generate(
                    **inputs,
                    max_new_tokens=2048,
                    do_sample=False,
                    pad_token_id=self._processor.tokenizer.pad_token_id,
                )

            # Synchronize if needed
            if self._actual_device == "mps":
                torch.mps.synchronize()

            # Decode response
            generated_ids = outputs[:, inputs["input_ids"].shape[1]:]
            response = self._processor.batch_decode(
                generated_ids, skip_special_tokens=True, clean_up_tokenization_spaces=False
            )[0]

            processing_time = time.time() - start_time

            # Parse the JSON response
            transactions, confidence = self._parse_response(response, document_type)

            logger.info(
                "Image extraction complete",
                transaction_count=len(transactions),
                confidence=confidence,
                processing_time_s=f"{processing_time:.1f}",
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
            # Clean response and find JSON
            text = response.strip()

            # Remove markdown code blocks
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0]
            elif "```" in text:
                parts = text.split("```")
                if len(parts) > 1:
                    text = parts[1]

            # Find JSON object or array
            start_idx = text.find("{")
            end_idx = text.rfind("}") + 1
            if start_idx == -1 or end_idx <= start_idx:
                # Try array
                start_idx = text.find("[")
                end_idx = text.rfind("]") + 1

            if start_idx == -1 or end_idx <= start_idx:
                logger.warning("No JSON found in response", response=response[:200])
                return [], 0.0

            json_str = text[start_idx:end_idx]
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
            logger.error("Failed to parse JSON response", error=str(e), response=response[:200])
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
