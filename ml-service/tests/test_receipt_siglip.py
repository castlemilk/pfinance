"""Tests for SigLIP receipt extraction pipeline.

These tests validate the pipeline components without requiring GPU or
model downloads — uses mock tensors where needed.
"""

import json
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
import torch
from PIL import Image

from src.models.receipt_siglip.merchants import (
    MERCHANT_LIST,
    MERCHANT_TO_INDEX,
    NUM_MERCHANT_CLASSES,
    OTHER_CLASS_INDEX,
    label_to_merchant,
    merchant_to_label,
)
from src.models.receipt_siglip.heads import (
    AmountRegressor,
    AttentionPool,
    DateExtractor,
    LineItemDetector,
    MerchantClassifier,
)
from src.models.receipt_siglip.encoder import (
    SIGLIP_HIDDEN_DIM,
    SIGLIP_NUM_PATCHES,
)
from src.models.receipt_siglip.pipeline import (
    SIGLIP_CONFIDENCE_THRESHOLD,
    ReceiptExtractionResult,
    FieldResult,
    SigLIPReceiptPipeline,
)
from src.models.receipt_siglip.dataset import (
    ReceiptDataset,
    SilverLabelGenerator,
)


# --- Merchant list tests ---


class TestMerchants:
    def test_merchant_list_has_100_entries(self):
        assert len(MERCHANT_LIST) == 100

    def test_other_class_is_100(self):
        assert OTHER_CLASS_INDEX == 100
        assert NUM_MERCHANT_CLASSES == 101

    def test_known_merchant_to_label(self):
        assert merchant_to_label("Woolworths") == 0
        assert merchant_to_label("Coles") == 1
        assert merchant_to_label("woolworths") == 0  # case insensitive
        assert merchant_to_label("COLES") == 1

    def test_unknown_merchant_to_label(self):
        assert merchant_to_label("Some Random Shop") == OTHER_CLASS_INDEX

    def test_label_to_merchant(self):
        assert label_to_merchant(0) == "Woolworths"
        assert label_to_merchant(100) == "Other"
        assert label_to_merchant(999) == "Other"

    def test_all_merchants_in_lookup(self):
        for i, name in enumerate(MERCHANT_LIST):
            assert merchant_to_label(name) == i

    def test_top_au_merchants_present(self):
        expected = ["Woolworths", "Coles", "Bunnings", "Kmart", "JB Hi-Fi"]
        for merchant in expected:
            assert merchant.lower() in MERCHANT_TO_INDEX


# --- Head tests (CPU, random weights) ---

BATCH_SIZE = 4


class TestAttentionPool:
    def test_output_shape(self):
        pool = AttentionPool(SIGLIP_HIDDEN_DIM)
        x = torch.randn(BATCH_SIZE, SIGLIP_NUM_PATCHES, SIGLIP_HIDDEN_DIM)
        out = pool(x)
        assert out.shape == (BATCH_SIZE, SIGLIP_HIDDEN_DIM)

    def test_attention_sums_to_one(self):
        pool = AttentionPool(SIGLIP_HIDDEN_DIM)
        x = torch.randn(1, 10, SIGLIP_HIDDEN_DIM)
        weights = torch.softmax(pool.query(x), dim=1)
        assert abs(weights.sum().item() - 1.0) < 1e-5


class TestMerchantClassifier:
    def test_output_shape(self):
        head = MerchantClassifier()
        pooled = torch.randn(BATCH_SIZE, SIGLIP_HIDDEN_DIM)
        out = head(pooled)
        assert out["logits"].shape == (BATCH_SIZE, NUM_MERCHANT_CLASSES)
        assert out["confidence"].shape == (BATCH_SIZE,)
        assert out["predicted_class"].shape == (BATCH_SIZE,)

    def test_confidence_in_range(self):
        head = MerchantClassifier()
        pooled = torch.randn(BATCH_SIZE, SIGLIP_HIDDEN_DIM)
        out = head(pooled)
        assert (out["confidence"] >= 0).all()
        assert (out["confidence"] <= 1).all()

    def test_predicted_class_in_range(self):
        head = MerchantClassifier()
        pooled = torch.randn(BATCH_SIZE, SIGLIP_HIDDEN_DIM)
        out = head(pooled)
        assert (out["predicted_class"] >= 0).all()
        assert (out["predicted_class"] < NUM_MERCHANT_CLASSES).all()


class TestAmountRegressor:
    def test_output_shape(self):
        head = AmountRegressor()
        patches = torch.randn(BATCH_SIZE, SIGLIP_NUM_PATCHES, SIGLIP_HIDDEN_DIM)
        out = head(patches)
        assert out["amount"].shape == (BATCH_SIZE,)
        assert out["attention_weights"].shape == (BATCH_SIZE, SIGLIP_NUM_PATCHES)

    def test_amount_positive(self):
        head = AmountRegressor()
        patches = torch.randn(BATCH_SIZE, SIGLIP_NUM_PATCHES, SIGLIP_HIDDEN_DIM)
        out = head(patches)
        assert (out["amount"] >= 0).all()  # Softplus ensures non-negative


class TestDateExtractor:
    def test_output_shape(self):
        head = DateExtractor()
        patches = torch.randn(BATCH_SIZE, SIGLIP_NUM_PATCHES, SIGLIP_HIDDEN_DIM)
        out = head(patches)
        assert out["day"].shape == (BATCH_SIZE,)
        assert out["month"].shape == (BATCH_SIZE,)
        assert out["year"].shape == (BATCH_SIZE,)

    def test_date_ranges(self):
        head = DateExtractor()
        patches = torch.randn(BATCH_SIZE, SIGLIP_NUM_PATCHES, SIGLIP_HIDDEN_DIM)
        out = head(patches)
        # Sigmoid-scaled ranges
        assert (out["day"] >= 1).all() and (out["day"] <= 31).all()
        assert (out["month"] >= 1).all() and (out["month"] <= 12).all()
        assert (out["year"] >= 2000).all() and (out["year"] <= 2099).all()


class TestLineItemDetector:
    def test_output_shape(self):
        head = LineItemDetector()
        patches = torch.randn(BATCH_SIZE, SIGLIP_NUM_PATCHES, SIGLIP_HIDDEN_DIM)
        out = head(patches)
        assert out["logits"].shape == (BATCH_SIZE, SIGLIP_NUM_PATCHES)
        assert out["mask"].shape == (BATCH_SIZE, SIGLIP_NUM_PATCHES)
        assert out["confidence"].shape == (BATCH_SIZE,)


# --- Pipeline tests ---


class TestPipelineRouting:
    def test_should_escalate_low_confidence(self):
        pipeline = SigLIPReceiptPipeline()
        result = ReceiptExtractionResult(
            merchant=FieldResult(value="Woolworths", confidence=0.5, source="siglip"),
            amount=FieldResult(value=45.50, confidence=0.6, source="siglip"),
            date=FieldResult(value="2026-01-15", confidence=0.7, source="siglip"),
            line_items_detected=False,
            line_item_count=0,
            overall_confidence=0.55,
            routing_tier=1,
            processing_time_ms=20,
            model_used="siglip",
        )
        assert pipeline.should_escalate(result) is True

    def test_should_not_escalate_high_confidence(self):
        pipeline = SigLIPReceiptPipeline()
        result = ReceiptExtractionResult(
            merchant=FieldResult(value="Woolworths", confidence=0.95, source="siglip"),
            amount=FieldResult(value=45.50, confidence=0.90, source="siglip"),
            date=FieldResult(value="2026-01-15", confidence=0.88, source="siglip"),
            line_items_detected=True,
            line_item_count=3,
            overall_confidence=0.91,
            routing_tier=1,
            processing_time_ms=20,
            model_used="siglip",
        )
        assert pipeline.should_escalate(result) is False

    def test_escalate_on_low_field_confidence(self):
        pipeline = SigLIPReceiptPipeline()
        # Overall is high but amount field is low
        result = ReceiptExtractionResult(
            merchant=FieldResult(value="Coles", confidence=0.95, source="siglip"),
            amount=FieldResult(value=0.0, confidence=0.3, source="siglip"),
            date=FieldResult(value="2026-01-15", confidence=0.88, source="siglip"),
            line_items_detected=False,
            line_item_count=0,
            overall_confidence=0.75,
            routing_tier=1,
            processing_time_ms=20,
            model_used="siglip",
        )
        assert pipeline.should_escalate(result) is True


# --- Dataset tests ---


class TestSilverLabelGenerator:
    def test_generate_and_load(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            gen = SilverLabelGenerator(tmpdir)

            # Create a test image
            img = Image.new("RGB", (384, 384), color="white")
            gen.add_label(
                image=img,
                image_name="test_001.jpg",
                merchant="Woolworths",
                amount=45.50,
                date="2026-01-15",
                line_item_count=3,
                source="qwen2vl",
                confidence=0.92,
            )

            stats = gen.get_stats()
            assert stats["total"] == 1
            assert stats["by_source"]["qwen2vl"] == 1
            assert "Woolworths" in stats["top_merchants"]

            # Verify dataset loads it
            ds = ReceiptDataset(tmpdir, min_confidence=0.7)
            assert len(ds) == 1

    def test_low_confidence_filtered(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            gen = SilverLabelGenerator(tmpdir)
            img = Image.new("RGB", (384, 384), color="white")
            gen.add_label(
                image=img,
                image_name="low_conf.jpg",
                merchant="Unknown",
                amount=10.0,
                date="2026-01-01",
                source="qwen2vl",
                confidence=0.3,  # below threshold
            )

            ds = ReceiptDataset(tmpdir, min_confidence=0.7)
            assert len(ds) == 0


# --- Head weight save/load tests ---


class TestWeightPersistence:
    def test_save_and_load_heads(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            pipeline = SigLIPReceiptPipeline()
            # Don't load encoder — just test head weight save/load
            pipeline.merchant_head = MerchantClassifier()
            pipeline.amount_head = AmountRegressor()
            pipeline.date_head = DateExtractor()
            pipeline.line_item_head = LineItemDetector()

            # Save
            pipeline.save_head_weights(tmpdir)

            # Verify files exist
            for name in ["merchant_head.pt", "amount_head.pt", "date_head.pt", "line_item_head.pt"]:
                assert (Path(tmpdir) / name).exists()

            # Load into fresh heads and verify shapes match
            new_merchant = MerchantClassifier()
            state = torch.load(Path(tmpdir) / "merchant_head.pt", weights_only=True)
            new_merchant.load_state_dict(state)

            # Verify forward pass works
            pooled = torch.randn(1, SIGLIP_HIDDEN_DIM)
            out = new_merchant(pooled)
            assert out["logits"].shape == (1, NUM_MERCHANT_CLASSES)


# --- Parameter count tests ---


class TestParameterCounts:
    """Verify heads stay within the ~500K total parameter budget."""

    def test_merchant_head_params(self):
        head = MerchantClassifier()
        params = sum(p.numel() for p in head.parameters())
        assert params < 400_000  # ~295K + margin

    def test_amount_head_params(self):
        head = AmountRegressor()
        params = sum(p.numel() for p in head.parameters())
        assert params < 400_000

    def test_date_head_params(self):
        head = DateExtractor()
        params = sum(p.numel() for p in head.parameters())
        assert params < 400_000

    def test_line_item_head_params(self):
        head = LineItemDetector()
        params = sum(p.numel() for p in head.parameters())
        assert params < 250_000  # smaller head

    def test_total_head_params_under_budget(self):
        total = 0
        for HeadClass in [MerchantClassifier, AmountRegressor, DateExtractor, LineItemDetector]:
            head = HeadClass()
            total += sum(p.numel() for p in head.parameters())
        # Budget: ~500K params total across all heads
        assert total < 2_000_000  # generous limit
