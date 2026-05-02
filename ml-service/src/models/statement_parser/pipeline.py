"""Statement parsing pipeline: PDF → LayoutLMv3 → extraction heads → transactions.

Orchestrates the full extraction flow:
1. PDF text + bbox extraction
2. Bank format detection
3. LayoutLMv3 encoding
4. Extraction heads (boundary, date, description, amount, sign, balance)
5. Balance reconciliation validation
6. Confidence-based fallback routing
"""

import time
import uuid
from dataclasses import dataclass, field
from typing import Optional

from .bank_detector import BankDetector, BankDetectionResult, BankFormat
from .encoder import LayoutLMv3Encoder
from .extraction_heads import (
    ExtractionResult,
    StatementExtractionHeads,
    TransactionSpan,
)
from .lora_adapter import LoRAAdapterManager, LoRAConfig
from .pdf_processor import PDFProcessor


@dataclass
class ParsedTransaction:
    """A fully parsed transaction ready for API response."""

    id: str
    date: str
    description: str
    amount: float
    is_debit: bool
    balance: Optional[float] = None
    confidence: float = 0.0
    page: int = 0
    field_confidences: dict = field(default_factory=dict)


@dataclass
class StatementParseResult:
    """Result of parsing an entire bank statement."""

    transactions: list[ParsedTransaction]
    confidence: float
    bank_detected: str
    page_count: int
    processing_time_ms: int
    needs_fallback: bool = False
    fallback_reason: Optional[str] = None
    balance_reconciled: bool = False
    balance_discrepancy: Optional[float] = None
    warnings: list[str] = field(default_factory=list)


# Confidence threshold for triggering Gemini fallback
FALLBACK_CONFIDENCE_THRESHOLD = 0.5


class StatementParserPipeline:
    """End-to-end pipeline for parsing bank statements with LayoutLMv3."""

    def __init__(
        self,
        device: str = "cuda",
        boundary_threshold: float = 0.5,
        fallback_threshold: float = FALLBACK_CONFIDENCE_THRESHOLD,
    ):
        self.device = device
        self.boundary_threshold = boundary_threshold
        self.fallback_threshold = fallback_threshold

        self.pdf_processor = PDFProcessor(render_dpi=150)
        self.bank_detector = BankDetector()
        self.encoder = LayoutLMv3Encoder(device=device, use_image_features=False)
        self.heads = StatementExtractionHeads(
            encoder_dim=LayoutLMv3Encoder.HIDDEN_SIZE,
            hidden_dim=256,
        )
        self.adapter_manager: Optional[LoRAAdapterManager] = None

        self._loaded = False

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    def load(
        self,
        heads_path: Optional[str] = None,
        adapter_dir: Optional[str] = None,
    ) -> None:
        """Load the encoder, extraction heads, and optional LoRA adapters.

        Args:
            heads_path: Path to saved extraction head weights.
                       If None, heads start with random weights (for training).
            adapter_dir: Directory containing bank-specific LoRA adapters.
                        Expected files: {bank}_adapter.pt (e.g., cba_adapter.pt).
                        If None, no adapters are loaded and base encoder is used for all banks.
        """
        self.encoder.load()

        if heads_path:
            import torch
            state_dict = torch.load(heads_path, map_location=self.device, weights_only=True)
            if "heads_state_dict" in state_dict:
                self.heads.load_state_dict(state_dict["heads_state_dict"])
            else:
                self.heads.load_state_dict(state_dict)

        self.heads.to(self.device)

        # Load LoRA adapters if directory provided
        if adapter_dir:
            self.adapter_manager = LoRAAdapterManager(self.encoder._model)
            loaded = self.adapter_manager.load_all_from_directory(adapter_dir)
            if loaded > 0:
                import logging
                logging.getLogger(__name__).info(
                    f"Loaded {loaded} LoRA adapters from {adapter_dir}: "
                    f"{list(self.adapter_manager.adapters.keys())}"
                )

        self._loaded = True

    def parse_statement(
        self,
        pdf_bytes: bytes,
        bank_hint: Optional[str] = None,
        max_pages: Optional[int] = None,
    ) -> StatementParseResult:
        """Parse a bank statement PDF into structured transactions.

        Args:
            pdf_bytes: Raw PDF file content.
            bank_hint: Optional bank format hint (e.g., "cba", "westpac").
            max_pages: Maximum pages to process.

        Returns:
            StatementParseResult with transactions and metadata.
        """
        if not self._loaded:
            raise RuntimeError("Pipeline not loaded. Call load() first.")

        start_time = time.time()

        # Step 1: Check if this is a digital PDF
        if not self.pdf_processor.is_digital_pdf(pdf_bytes):
            return StatementParseResult(
                transactions=[],
                confidence=0.0,
                bank_detected="unknown",
                page_count=0,
                processing_time_ms=int((time.time() - start_time) * 1000),
                needs_fallback=True,
                fallback_reason="scanned_pdf_not_supported",
                warnings=["Scanned PDF detected — routing to Gemini/Donut pipeline"],
            )

        # Step 2: Extract text + bboxes
        pages = self.pdf_processor.extract_pages(
            pdf_bytes, render_images=False, max_pages=max_pages
        )

        if not pages:
            return StatementParseResult(
                transactions=[],
                confidence=0.0,
                bank_detected="unknown",
                page_count=0,
                processing_time_ms=int((time.time() - start_time) * 1000),
                needs_fallback=True,
                fallback_reason="empty_pdf",
            )

        # Step 3: Detect bank format
        page_texts = [p.raw_text for p in pages]
        bank_result = self.bank_detector.detect_from_pages(page_texts, bank_hint)

        # Step 3.5: Activate bank-specific LoRA adapter if available
        if self.adapter_manager and bank_result.bank != BankFormat.UNKNOWN:
            if bank_result.bank.value in self.adapter_manager.adapters:
                self.adapter_manager.activate(bank_result.bank.value)
            else:
                self.adapter_manager.deactivate()

        # Step 4: Process each page
        all_transactions: list[ParsedTransaction] = []
        page_confidences: list[float] = []
        warnings: list[str] = []

        for page in pages:
            if not page.tokens:
                warnings.append(f"Page {page.page_number + 1}: no extractable tokens")
                continue

            # Encode with LayoutLMv3
            encoded = self.encoder.encode_page(page)

            # Run extraction heads
            result = self.heads.extract_transactions(
                embeddings=encoded["embeddings"],
                attention_mask=encoded["attention_mask"],
                token_to_word_map=encoded["token_to_word_map"],
                word_texts=encoded["word_texts"],
                boundary_threshold=self.boundary_threshold,
            )

            # Convert to ParsedTransaction
            for txn in result.transactions:
                parsed = self._span_to_transaction(txn, page.page_number)
                all_transactions.append(parsed)

            page_confidences.append(result.overall_confidence)

        # Step 5: Calculate overall confidence
        if page_confidences:
            overall_confidence = sum(page_confidences) / len(page_confidences)
        else:
            overall_confidence = 0.0

        # Step 6: Balance reconciliation
        balance_ok, balance_discrepancy = self._validate_balances(all_transactions)

        # Step 7: Determine if fallback is needed
        needs_fallback = False
        fallback_reason = None

        if overall_confidence < self.fallback_threshold:
            needs_fallback = True
            fallback_reason = f"low_confidence:{overall_confidence:.2f}"
        elif not balance_ok and balance_discrepancy is not None:
            if abs(balance_discrepancy) > 0.01:
                needs_fallback = True
                fallback_reason = f"balance_mismatch:{balance_discrepancy:.2f}"
                warnings.append(
                    f"Balance reconciliation failed: discrepancy of ${balance_discrepancy:.2f}"
                )

        # Check per-transaction confidence
        low_conf_txns = [
            t for t in all_transactions if t.confidence < self.fallback_threshold
        ]
        if low_conf_txns and len(low_conf_txns) > len(all_transactions) * 0.3:
            needs_fallback = True
            fallback_reason = (
                f"too_many_low_confidence:{len(low_conf_txns)}/{len(all_transactions)}"
            )

        processing_time = int((time.time() - start_time) * 1000)

        return StatementParseResult(
            transactions=all_transactions,
            confidence=overall_confidence,
            bank_detected=bank_result.bank.value,
            page_count=len(pages),
            processing_time_ms=processing_time,
            needs_fallback=needs_fallback,
            fallback_reason=fallback_reason,
            balance_reconciled=balance_ok,
            balance_discrepancy=balance_discrepancy,
            warnings=warnings,
        )

    def _span_to_transaction(
        self, span: TransactionSpan, page_number: int
    ) -> ParsedTransaction:
        """Convert an extraction head TransactionSpan to a ParsedTransaction."""
        return ParsedTransaction(
            id=str(uuid.uuid4()),
            date=span.date,
            description=span.description,
            amount=span.amount,
            is_debit=span.is_debit,
            balance=span.balance,
            confidence=span.avg_confidence,
            page=page_number,
            field_confidences={
                "date": span.date_confidence,
                "description": span.description_confidence,
                "amount": span.amount_confidence,
                "sign": span.sign_confidence,
                "balance": span.balance_confidence,
            },
        )

    def _validate_balances(
        self, transactions: list[ParsedTransaction]
    ) -> tuple[bool, Optional[float]]:
        """Validate balance reconciliation across transactions.

        Checks if: prev_balance + amount * sign == next_balance for each pair.

        Returns (is_valid, max_discrepancy).
        """
        txns_with_balance = [t for t in transactions if t.balance is not None]

        if len(txns_with_balance) < 2:
            return True, None  # Can't validate without balances

        max_discrepancy = 0.0
        for i in range(len(txns_with_balance) - 1):
            curr = txns_with_balance[i]
            next_txn = txns_with_balance[i + 1]

            # Expected: curr.balance + next_txn.amount * sign = next_txn.balance
            sign = -1.0 if next_txn.is_debit else 1.0
            expected_balance = curr.balance + (next_txn.amount * sign)
            discrepancy = abs(expected_balance - next_txn.balance)
            max_discrepancy = max(max_discrepancy, discrepancy)

        is_valid = max_discrepancy <= 0.01
        return is_valid, max_discrepancy if max_discrepancy > 0.001 else None
