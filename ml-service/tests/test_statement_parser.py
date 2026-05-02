"""Tests for the LayoutLMv3 statement parser components.

Tests cover:
- PDF text + bbox extraction (PDFProcessor)
- Bank format detection (BankDetector)
- Extraction heads (individual and combined)
- Pipeline integration
- Balance reconciliation validation
"""

import io
import pytest
from unittest.mock import MagicMock, patch

# PDF processor tests (no GPU required)
from src.models.statement_parser.pdf_processor import PDFProcessor, PDFPage, TokenInfo
from src.models.statement_parser.bank_detector import BankDetector, BankFormat
from src.models.statement_parser.extraction_heads import (
    TransactionBoundaryHead,
    DateExtractorHead,
    AmountExtractorHead,
    SignClassifierHead,
    StatementExtractionHeads,
    ExtractionResult,
    TransactionSpan,
)


# --- PDF Processor Tests ---


class TestPDFProcessor:
    """Tests for PDF text and bounding box extraction."""

    def test_is_digital_pdf_with_text(self):
        """Digital PDFs with extractable text should return True."""
        # Create a simple PDF with text using fitz
        import fitz
        doc = fitz.open()
        page = doc.new_page(width=595, height=842)
        # Insert enough text to pass the 50-char threshold
        text = "Commonwealth Bank Statement\nAccount Number: 1234 5678\nDate Description Amount Balance"
        page.insert_text((72, 72), text, fontsize=12)
        pdf_bytes = doc.tobytes()
        doc.close()

        processor = PDFProcessor()
        assert processor.is_digital_pdf(pdf_bytes) is True

    def test_is_digital_pdf_empty(self):
        """Empty PDFs should return False."""
        import fitz
        doc = fitz.open()
        doc.new_page()
        pdf_bytes = doc.tobytes()
        doc.close()

        processor = PDFProcessor()
        assert processor.is_digital_pdf(pdf_bytes) is False

    def test_extract_pages_basic(self):
        """Should extract tokens with bounding boxes from a text PDF."""
        import fitz
        doc = fitz.open()
        page = doc.new_page(width=595, height=842)
        page.insert_text((72, 100), "01/03/2026 Woolworths 45.50 1234.50", fontsize=11)
        page.insert_text((72, 120), "02/03/2026 Coles 23.99 1210.51", fontsize=11)
        pdf_bytes = doc.tobytes()
        doc.close()

        processor = PDFProcessor()
        pages = processor.extract_pages(pdf_bytes)

        assert len(pages) == 1
        assert len(pages[0].tokens) > 0
        assert pages[0].width == 595
        assert pages[0].height == 842

        # Tokens should have normalized bounding boxes (0-1000)
        for token in pages[0].tokens:
            assert 0 <= token.x0 <= 1000
            assert 0 <= token.y0 <= 1000
            assert 0 <= token.x1 <= 1000
            assert 0 <= token.y1 <= 1000

    def test_extract_pages_multi_page(self):
        """Should handle multi-page PDFs."""
        import fitz
        doc = fitz.open()
        for i in range(3):
            page = doc.new_page()
            page.insert_text((72, 100), f"Page {i+1} transaction data here", fontsize=11)
        pdf_bytes = doc.tobytes()
        doc.close()

        processor = PDFProcessor()
        pages = processor.extract_pages(pdf_bytes)
        assert len(pages) == 3

    def test_extract_pages_max_pages(self):
        """max_pages should limit extraction."""
        import fitz
        doc = fitz.open()
        for i in range(5):
            page = doc.new_page()
            page.insert_text((72, 100), f"Page {i+1}", fontsize=11)
        pdf_bytes = doc.tobytes()
        doc.close()

        processor = PDFProcessor()
        pages = processor.extract_pages(pdf_bytes, max_pages=2)
        assert len(pages) == 2

    def test_token_texts_and_boxes(self):
        """PDFPage helper properties should work correctly."""
        page = PDFPage(
            page_number=0,
            tokens=[
                TokenInfo("Hello", 100, 200, 300, 250, 10, 20, 30, 25, 0, 0),
                TokenInfo("World", 350, 200, 500, 250, 35, 20, 50, 25, 0, 0),
            ],
            width=595,
            height=842,
        )
        assert page.token_texts == ["Hello", "World"]
        assert page.token_boxes == [[100, 200, 300, 250], [350, 200, 500, 250]]


# --- Bank Detector Tests ---


class TestBankDetector:
    """Tests for bank format detection."""

    def setup_method(self):
        self.detector = BankDetector()

    def test_detect_cba_by_name(self):
        """Should detect CBA from 'Commonwealth Bank' text."""
        result = self.detector.detect("Commonwealth Bank\nAccount Statement")
        assert result.bank == BankFormat.CBA
        assert result.confidence >= 0.9

    def test_detect_cba_by_abn(self):
        """Should detect CBA from ABN."""
        result = self.detector.detect("ABN 48 123 123 124\nTransaction Details")
        assert result.bank == BankFormat.CBA
        assert result.confidence >= 0.99

    def test_detect_westpac(self):
        """Should detect Westpac."""
        result = self.detector.detect("Westpac Banking Corporation\nStatement")
        assert result.bank == BankFormat.WESTPAC

    def test_detect_nab(self):
        """Should detect NAB."""
        result = self.detector.detect("National Australia Bank\nAccount Statement")
        assert result.bank == BankFormat.NAB

    def test_detect_anz(self):
        """Should detect ANZ."""
        result = self.detector.detect("ANZ\nTransaction History")
        assert result.bank == BankFormat.ANZ

    def test_detect_unknown(self):
        """Should return unknown for unrecognized text."""
        result = self.detector.detect("Random text with no bank identifiers")
        assert result.bank == BankFormat.UNKNOWN
        assert result.confidence == 0.0

    def test_detect_with_hint(self):
        """Bank hint should override text detection."""
        result = self.detector.detect("Some random text", bank_hint="westpac")
        assert result.bank == BankFormat.WESTPAC
        assert result.confidence == 1.0

    def test_detect_from_pages(self):
        """Should detect bank from multiple pages."""
        pages = [
            "Page 1 with no identifiers",
            "Commonwealth Bank Statement for March 2026",
            "Page 3",
        ]
        result = self.detector.detect_from_pages(pages)
        assert result.bank == BankFormat.CBA

    def test_detect_commbank_alias(self):
        """Should detect CBA from CommBank alias."""
        result = self.detector.detect("CommBank Smart Access\nYour Account Statement")
        assert result.bank == BankFormat.CBA

    def test_detect_ing(self):
        """Should detect ING."""
        result = self.detector.detect("ING Direct\nOrange Everyday")
        assert result.bank == BankFormat.ING

    def test_detect_st_george(self):
        """Should detect St George as Westpac group."""
        result = self.detector.detect("St George Bank\nTransaction Statement")
        assert result.bank == BankFormat.WESTPAC


# --- Extraction Heads Tests (CPU-only, no encoder needed) ---


class TestTransactionBoundaryHead:
    """Tests for the transaction boundary detector."""

    def test_output_shape(self):
        """Forward pass should produce correct output shape."""
        import torch
        head = TransactionBoundaryHead(encoder_dim=768, hidden_dim=256)
        embeddings = torch.randn(1, 50, 768)
        mask = torch.ones(1, 50, dtype=torch.long)

        logits = head(embeddings, mask)
        assert logits.shape == (1, 50, 2)

    def test_predict_spans_empty(self):
        """Should return empty list for empty input."""
        import torch
        head = TransactionBoundaryHead()
        embeddings = torch.randn(1, 10, 768)
        mask = torch.ones(1, 10, dtype=torch.long)

        spans = head.predict_spans(embeddings, mask, [])
        assert spans == []


class TestAmountExtractorHead:
    """Tests for amount parsing."""

    def test_parse_amount_basic(self):
        assert AmountExtractorHead._parse_amount("45.50") == 45.50

    def test_parse_amount_with_dollar(self):
        assert AmountExtractorHead._parse_amount("$1,234.56") == 1234.56

    def test_parse_amount_with_comma(self):
        assert AmountExtractorHead._parse_amount("1,234.56") == 1234.56

    def test_parse_amount_negative(self):
        """Should return absolute value."""
        assert AmountExtractorHead._parse_amount("-45.50") == 45.50

    def test_parse_amount_empty(self):
        assert AmountExtractorHead._parse_amount("") is None

    def test_parse_amount_invalid(self):
        assert AmountExtractorHead._parse_amount("abc") is None


class TestDateExtractorHead:
    """Tests for date extraction patterns."""

    def test_date_patterns_dd_mm_yyyy(self):
        """Should match DD/MM/YYYY dates."""
        import re
        patterns = DateExtractorHead.DATE_PATTERNS
        text = "01/03/2026 Some description"
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                assert match.group() in ["01/03/2026"]
                break


class TestSignClassifier:
    """Tests for credit/debit classification."""

    def test_output_shape(self):
        import torch
        head = SignClassifierHead()
        embeddings = torch.randn(1, 768)
        logits = head(embeddings)
        assert logits.shape == (1, 2)


class TestStatementExtractionHeads:
    """Tests for the combined extraction heads."""

    def test_initialization(self):
        """All heads should initialize correctly."""
        heads = StatementExtractionHeads(encoder_dim=768, hidden_dim=256)
        assert heads.boundary is not None
        assert heads.date is not None
        assert heads.description is not None
        assert heads.amount is not None
        assert heads.sign is not None
        assert heads.balance is not None

    def test_total_params(self):
        """Total head parameters should be approximately 1M."""
        heads = StatementExtractionHeads()
        total_params = sum(p.numel() for p in heads.parameters())
        # Should be roughly 1M params (5 heads × ~200K each)
        assert 500_000 < total_params < 3_000_000, f"Total params: {total_params}"


# --- TransactionSpan Tests ---


class TestTransactionSpan:
    def test_min_confidence(self):
        span = TransactionSpan(
            date_confidence=0.9,
            description_confidence=0.8,
            amount_confidence=0.7,
            sign_confidence=0.6,
        )
        assert span.min_confidence == 0.6

    def test_avg_confidence(self):
        span = TransactionSpan(
            date_confidence=0.8,
            description_confidence=0.8,
            amount_confidence=0.8,
            sign_confidence=0.8,
        )
        assert span.avg_confidence == 0.8


# --- Pipeline Balance Validation Tests ---


class TestBalanceValidation:
    """Tests for balance reconciliation logic."""

    def test_valid_balance_chain(self):
        """Transactions with matching balances should validate."""
        from src.models.statement_parser.pipeline import StatementParserPipeline, ParsedTransaction

        pipeline = StatementParserPipeline.__new__(StatementParserPipeline)
        txns = [
            ParsedTransaction(id="1", date="2026-03-01", description="Opening",
                            amount=0, is_debit=True, balance=1000.00, confidence=0.9),
            ParsedTransaction(id="2", date="2026-03-02", description="Woolworths",
                            amount=45.50, is_debit=True, balance=954.50, confidence=0.9),
            ParsedTransaction(id="3", date="2026-03-03", description="Salary",
                            amount=2000.00, is_debit=False, balance=2954.50, confidence=0.9),
        ]

        is_valid, discrepancy = pipeline._validate_balances(txns)
        assert is_valid is True

    def test_invalid_balance_chain(self):
        """Mismatched balances should fail validation."""
        from src.models.statement_parser.pipeline import StatementParserPipeline, ParsedTransaction

        pipeline = StatementParserPipeline.__new__(StatementParserPipeline)
        txns = [
            ParsedTransaction(id="1", date="2026-03-01", description="Opening",
                            amount=0, is_debit=True, balance=1000.00, confidence=0.9),
            ParsedTransaction(id="2", date="2026-03-02", description="Error",
                            amount=45.50, is_debit=True, balance=999.00, confidence=0.9),
        ]

        is_valid, discrepancy = pipeline._validate_balances(txns)
        assert is_valid is False
        assert discrepancy is not None
        assert discrepancy > 0.01

    def test_no_balances(self):
        """Transactions without balances should pass (can't validate)."""
        from src.models.statement_parser.pipeline import StatementParserPipeline, ParsedTransaction

        pipeline = StatementParserPipeline.__new__(StatementParserPipeline)
        txns = [
            ParsedTransaction(id="1", date="2026-03-01", description="Test",
                            amount=45.50, is_debit=True, balance=None, confidence=0.9),
        ]

        is_valid, discrepancy = pipeline._validate_balances(txns)
        assert is_valid is True
        assert discrepancy is None


# --- LoRA Adapter Tests ---

class TestLoRALinear:
    """Tests for LoRA linear layer wrapper."""

    def test_lora_output_shape(self):
        """LoRA layer should produce same output shape as original."""
        import torch
        import torch.nn as nn
        from src.models.statement_parser.lora_adapter import LoRALinear

        original = nn.Linear(768, 768)
        lora = LoRALinear(original, rank=8, alpha=16.0)

        x = torch.randn(2, 10, 768)
        out = lora(x)
        assert out.shape == (2, 10, 768)

    def test_lora_starts_as_identity(self):
        """LoRA output should match original at initialization (B initialized to zeros)."""
        import torch
        import torch.nn as nn
        from src.models.statement_parser.lora_adapter import LoRALinear

        original = nn.Linear(768, 768)
        lora = LoRALinear(original, rank=8)

        x = torch.randn(1, 5, 768)
        original_out = original(x)
        lora_out = lora(x)

        # Should be identical since B is initialized to zeros
        assert torch.allclose(original_out, lora_out, atol=1e-6)

    def test_lora_param_count(self):
        """LoRA params should be rank * (in + out) features."""
        import torch.nn as nn
        from src.models.statement_parser.lora_adapter import LoRALinear

        original = nn.Linear(768, 768)
        lora = LoRALinear(original, rank=8)

        # rank=8, in=768, out=768 → 8*768 + 8*768 = 12,288
        assert lora.lora_param_count == 8 * 768 + 8 * 768

    def test_original_weights_frozen(self):
        """Original weights should not require gradients."""
        import torch.nn as nn
        from src.models.statement_parser.lora_adapter import LoRALinear

        original = nn.Linear(768, 768)
        lora = LoRALinear(original, rank=8)

        assert not lora.original.weight.requires_grad
        assert lora.lora_A.weight.requires_grad
        assert lora.lora_B.weight.requires_grad


class TestLoRAAdapter:
    """Tests for bank-specific LoRA adapter."""

    def test_adapter_creation(self):
        """Should create adapter with correct bank and config."""
        from src.models.statement_parser.lora_adapter import LoRAAdapter, LoRAConfig
        from src.models.statement_parser.bank_detector import BankFormat

        config = LoRAConfig(rank=8, alpha=16.0)
        adapter = LoRAAdapter(BankFormat.NAB, config)

        assert adapter.bank == BankFormat.NAB
        assert adapter.config.rank == 8

    def test_adapter_size_under_2mb(self):
        """Each adapter should be < 2MB as per spec."""
        import torch.nn as nn
        from src.models.statement_parser.lora_adapter import (
            LoRAAdapter, LoRAConfig, LoRALinear
        )
        from src.models.statement_parser.bank_detector import BankFormat

        config = LoRAConfig(rank=8, alpha=16.0)
        adapter = LoRAAdapter(BankFormat.CBA, config)

        # Simulate adding LoRA layers for 12 attention layers
        # LayoutLMv3-base has 12 transformer layers × 3 attention projections = 36 layers
        for i in range(36):
            original = nn.Linear(768, 768)
            lora = LoRALinear(original, rank=8, alpha=16.0)
            adapter.add_layer(f"layer_{i}", lora)

        size_mb = adapter.size_bytes / (1024 * 1024)
        assert size_mb < 2.0, f"Adapter size {size_mb:.2f} MB exceeds 2MB limit"


class TestLoRAAdapterManager:
    """Tests for adapter management and switching."""

    def test_adapter_info(self):
        """Should return correct info about loaded adapters."""
        import torch.nn as nn
        from src.models.statement_parser.lora_adapter import LoRAAdapterManager
        from src.models.statement_parser.bank_detector import BankFormat

        # Create a simple mock encoder model
        model = nn.Sequential(
            nn.Linear(768, 768),  # not a target module
        )
        # Add a named module that matches target
        model.query = nn.Linear(768, 768)
        model.key = nn.Linear(768, 768)

        manager = LoRAAdapterManager(model)
        manager.create_adapter(BankFormat.NAB)

        info = manager.get_adapter_info()
        assert "nab" in info
        assert info["nab"]["active"] is False
        assert info["nab"]["param_count"] > 0


class TestDataset:
    """Tests for the training dataset."""

    def test_token_labels_defaults(self):
        """TokenLabels should initialize with empty lists."""
        from src.models.statement_parser.dataset import TokenLabels

        labels = TokenLabels()
        assert labels.boundary_labels == []
        assert labels.transaction_spans == []
        assert labels.sign_labels == []

    def test_page_sample_creation(self):
        """PageSample should store all fields."""
        from src.models.statement_parser.dataset import PageSample, TokenLabels

        sample = PageSample(
            pdf_path="/test/statement.pdf",
            page_number=0,
            bank="cba",
            token_texts=["15/01/2025", "WOOLWORTHS", "52.30"],
            token_boxes=[[100, 200, 200, 220], [250, 200, 500, 220], [600, 200, 700, 220]],
            labels=TokenLabels(
                boundary_labels=[1, 1, 1],
                date_bio=[0, 2, 2],
                description_bio=[2, 0, 2],
                amount_bio=[2, 2, 0],
                balance_bio=[2, 2, 2],
                sign_labels=[0],
                amount_values=[52.30],
                transaction_spans=[(0, 2)],
            ),
            source="gemini",
            source_confidence=0.85,
        )

        assert sample.bank == "cba"
        assert len(sample.labels.boundary_labels) == 3
        assert sample.labels.sign_labels == [0]  # debit
