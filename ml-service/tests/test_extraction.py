"""Tests for document extraction."""

import io
import json
from pathlib import Path

import pytest
from PIL import Image

from src.schemas.extraction import (
    DocumentType,
    ExpenseCategory,
    ExtractedTransaction,
    ExtractionResponse,
)
from src.models.paddleocr import normalize_merchant


class TestNormalizeMerchant:
    """Tests for merchant normalization."""

    def test_known_grocery_store(self):
        """Test normalizing a known grocery store."""
        name, category = normalize_merchant("WOOLWORTHS 1234 SYDNEY")
        assert "Woolworths" in name
        assert category == ExpenseCategory.FOOD

    def test_fast_food(self):
        """Test normalizing fast food merchants."""
        name, category = normalize_merchant("MCDONALD'S #12345")
        assert "Mcdonald" in name
        assert category == ExpenseCategory.FOOD

    def test_transport_rideshare(self):
        """Test normalizing rideshare transactions."""
        name, category = normalize_merchant("UBER *TRIP")
        assert "Uber" in name
        assert category == ExpenseCategory.TRANSPORTATION

    def test_streaming_service(self):
        """Test normalizing streaming services."""
        name, category = normalize_merchant("NETFLIX.COM 123456")
        assert "Netflix" in name
        assert category == ExpenseCategory.ENTERTAINMENT

    def test_unknown_merchant(self):
        """Test normalizing unknown merchants."""
        name, category = normalize_merchant("RANDOM STORE PTY LTD")
        assert name  # Should have some cleaned name
        assert category == ExpenseCategory.OTHER

    def test_removes_card_prefixes(self):
        """Test that card prefixes are removed."""
        name, category = normalize_merchant("VISA *AMAZON.COM")
        assert "Visa" not in name
        assert "Amazon" in name


class TestExtractedTransaction:
    """Tests for ExtractedTransaction schema."""

    def test_valid_transaction(self):
        """Test creating a valid transaction."""
        tx = ExtractedTransaction(
            id="test-123",
            date="2024-01-15",
            description="Coffee Shop",
            normalized_merchant="Coffee Shop",
            amount=5.50,
            suggested_category=ExpenseCategory.FOOD,
            confidence=0.95,
            is_debit=True,
        )
        assert tx.amount == 5.50
        assert tx.confidence == 0.95

    def test_amount_must_be_positive(self):
        """Test that amount must be positive."""
        with pytest.raises(ValueError):
            ExtractedTransaction(
                id="test-123",
                date="2024-01-15",
                description="Test",
                normalized_merchant="Test",
                amount=-5.50,  # Invalid
                suggested_category=ExpenseCategory.OTHER,
                confidence=0.8,
                is_debit=True,
            )

    def test_confidence_bounds(self):
        """Test that confidence is bounded 0-1."""
        with pytest.raises(ValueError):
            ExtractedTransaction(
                id="test-123",
                date="2024-01-15",
                description="Test",
                normalized_merchant="Test",
                amount=5.50,
                suggested_category=ExpenseCategory.OTHER,
                confidence=1.5,  # Invalid
                is_debit=True,
            )


class TestExtractionResponse:
    """Tests for ExtractionResponse schema."""

    def test_empty_response(self):
        """Test creating an empty response."""
        response = ExtractionResponse(
            transactions=[],
            overall_confidence=0.0,
            model_used="test-model",
            processing_time_ms=100,
            warnings=[],
            document_type=DocumentType.RECEIPT,
            page_count=1,
        )
        assert len(response.transactions) == 0
        assert response.model_used == "test-model"

    def test_response_with_transactions(self):
        """Test response with transactions."""
        tx = ExtractedTransaction(
            id="test-123",
            date="2024-01-15",
            description="Coffee",
            normalized_merchant="Starbucks",
            amount=5.50,
            suggested_category=ExpenseCategory.FOOD,
            confidence=0.95,
            is_debit=True,
        )
        response = ExtractionResponse(
            transactions=[tx],
            overall_confidence=0.95,
            model_used="test-model",
            processing_time_ms=500,
            warnings=[],
            document_type=DocumentType.RECEIPT,
            page_count=1,
        )
        assert len(response.transactions) == 1
        assert response.transactions[0].amount == 5.50


class TestDocumentType:
    """Tests for DocumentType enum."""

    def test_receipt_type(self):
        assert DocumentType.RECEIPT.value == "receipt"

    def test_bank_statement_type(self):
        assert DocumentType.BANK_STATEMENT.value == "bank_statement"

    def test_invalid_type(self):
        with pytest.raises(ValueError):
            DocumentType("invalid_type")


# Integration tests (require model to be loaded)
@pytest.mark.skipif(
    not Path("testdata/sample_receipt.jpg").exists(),
    reason="Test data not available",
)
class TestModelIntegration:
    """Integration tests that require the model."""

    @pytest.fixture
    def sample_image(self):
        """Load sample receipt image."""
        return Image.open("testdata/sample_receipt.jpg")

    @pytest.mark.asyncio
    async def test_extract_from_image(self, sample_image):
        """Test extracting from a sample image."""
        from src.models.paddleocr import PaddleOCRModel

        model = PaddleOCRModel(device="cpu")
        transactions, confidence = await model.extract_from_image(
            sample_image, DocumentType.RECEIPT
        )

        assert isinstance(transactions, list)
        assert 0.0 <= confidence <= 1.0
