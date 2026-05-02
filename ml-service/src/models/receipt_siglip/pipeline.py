"""SigLIP receipt extraction pipeline with confidence-based routing.

Three-tier routing:
  1. SigLIP heads (cost: ~$0.0003, latency: ~25ms) — confidence >= 0.7
  2. Qwen2-VL-7B (cost: ~$0.002-0.003, latency: ~200ms) — confidence >= 0.5
  3. Gemini Flash fallback (cost: ~$0.005, latency: ~1-3s)

Expected distribution: 70% SigLIP / 25% Qwen2-VL / 5% Gemini.
Blended cost: ~$0.0008/receipt (down from ~$0.0025).
"""

import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import torch
from PIL import Image

from .encoder import SigLIPEncoder
from .heads import AmountRegressor, DateExtractor, LineItemDetector, MerchantClassifier
from .merchants import label_to_merchant, OTHER_CLASS_INDEX

logger = logging.getLogger(__name__)

# Routing thresholds
SIGLIP_CONFIDENCE_THRESHOLD = 0.70
QWEN_CONFIDENCE_THRESHOLD = 0.50

# Minimum per-field confidence to trust SigLIP output
FIELD_CONFIDENCE_THRESHOLDS = {
    "merchant": 0.60,
    "amount": 0.65,
    "date": 0.60,
}


@dataclass
class FieldResult:
    """Result for a single extracted field."""
    value: str | float
    confidence: float
    source: str  # "siglip", "qwen2vl", "gemini"


@dataclass
class ReceiptExtractionResult:
    """Complete receipt extraction result with per-field confidence."""
    merchant: FieldResult
    amount: FieldResult
    date: FieldResult
    line_items_detected: bool
    line_item_count: int
    overall_confidence: float
    routing_tier: int  # 1=SigLIP, 2=Qwen2-VL, 3=Gemini
    processing_time_ms: int
    model_used: str
    warnings: list[str] = field(default_factory=list)


class SigLIPReceiptPipeline:
    """Orchestrates SigLIP-based receipt extraction with fallback routing.

    Loads the frozen SigLIP encoder and four task heads. On inference,
    runs all heads in parallel, computes per-field confidence, and decides
    whether to return SigLIP results or escalate to Qwen2-VL / Gemini.
    """

    def __init__(
        self,
        weights_dir: Optional[str] = None,
        device: Optional[str] = None,
        siglip_threshold: float = SIGLIP_CONFIDENCE_THRESHOLD,
        qwen_threshold: float = QWEN_CONFIDENCE_THRESHOLD,
    ):
        """Initialize the pipeline.

        Args:
            weights_dir: Directory containing trained head weights.
                         If None, heads are initialized randomly (for training).
            device: Device to run on ("cuda", "cpu", or None for auto-detect).
            siglip_threshold: Min overall confidence to accept SigLIP results.
            qwen_threshold: Min confidence to accept Qwen2-VL results.
        """
        self.siglip_threshold = siglip_threshold
        self.qwen_threshold = qwen_threshold
        self._device = device

        # Initialize encoder and heads
        self.encoder = SigLIPEncoder(device=device)
        self.merchant_head = MerchantClassifier()
        self.amount_head = AmountRegressor()
        self.date_head = DateExtractor()
        self.line_item_head = LineItemDetector()

        self._weights_dir = weights_dir
        self._loaded = False

    @property
    def device(self) -> torch.device:
        return self.encoder.device

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    def load(self) -> None:
        """Load encoder and head weights."""
        if self._loaded:
            return

        # Load frozen encoder
        self.encoder.load()

        # Move heads to device
        device = self.device
        self.merchant_head = self.merchant_head.to(device)
        self.amount_head = self.amount_head.to(device)
        self.date_head = self.date_head.to(device)
        self.line_item_head = self.line_item_head.to(device)

        # Load trained weights if available
        if self._weights_dir:
            self._load_head_weights(self._weights_dir)

        self._loaded = True

        total_head_params = sum(
            sum(p.numel() for p in head.parameters())
            for head in [
                self.merchant_head,
                self.amount_head,
                self.date_head,
                self.line_item_head,
            ]
        )
        logger.info(
            "SigLIP pipeline loaded: %.1fK head params on %s",
            total_head_params / 1e3,
            device,
        )

    def _load_head_weights(self, weights_dir: str) -> None:
        """Load pre-trained head weights from disk."""
        weights_path = Path(weights_dir)
        head_files = {
            "merchant": (self.merchant_head, "merchant_head.pt"),
            "amount": (self.amount_head, "amount_head.pt"),
            "date": (self.date_head, "date_head.pt"),
            "line_item": (self.line_item_head, "line_item_head.pt"),
        }

        for name, (head, filename) in head_files.items():
            path = weights_path / filename
            if path.exists():
                state_dict = torch.load(path, map_location=self.device, weights_only=True)
                head.load_state_dict(state_dict)
                logger.info("Loaded %s head weights from %s", name, path)
            else:
                logger.warning(
                    "No weights found for %s head at %s — using random init",
                    name,
                    path,
                )

    def save_head_weights(self, weights_dir: str) -> None:
        """Save trained head weights to disk."""
        weights_path = Path(weights_dir)
        weights_path.mkdir(parents=True, exist_ok=True)

        torch.save(self.merchant_head.state_dict(), weights_path / "merchant_head.pt")
        torch.save(self.amount_head.state_dict(), weights_path / "amount_head.pt")
        torch.save(self.date_head.state_dict(), weights_path / "date_head.pt")
        torch.save(self.line_item_head.state_dict(), weights_path / "line_item_head.pt")
        logger.info("Saved head weights to %s", weights_path)

    @torch.no_grad()
    def extract(self, image: Image.Image) -> ReceiptExtractionResult:
        """Run SigLIP extraction on a single receipt image.

        This only runs the SigLIP tier (Tier 1). The caller (or the
        FastAPI endpoint) is responsible for routing to Qwen2-VL / Gemini
        if confidence is below threshold.

        Args:
            image: PIL Image of receipt.

        Returns:
            ReceiptExtractionResult with per-field confidence scores.
        """
        if not self._loaded:
            raise RuntimeError("Pipeline not loaded. Call load() first.")

        start = time.monotonic()

        # Encode image
        features = self.encoder.encode_image(image)
        patch_emb = features["patch_embeddings"]
        pooled = features["pooled"]

        # Run all heads
        merchant_out = self.merchant_head(pooled)
        amount_out = self.amount_head(patch_emb)
        date_out = self.date_head(patch_emb)
        line_item_out = self.line_item_head(patch_emb)

        # Extract results
        merchant_idx = merchant_out["predicted_class"].item()
        merchant_conf = merchant_out["confidence"].item()
        merchant_name = label_to_merchant(merchant_idx)

        amount_val = amount_out["amount"].item()
        # Amount confidence: use attention entropy as proxy
        # Lower entropy = more focused attention = higher confidence
        attn = amount_out["attention_weights"]
        amount_entropy = -(attn * (attn + 1e-8).log()).sum().item()
        max_entropy = torch.log(torch.tensor(float(attn.shape[-1]))).item()
        amount_conf = max(0.0, 1.0 - (amount_entropy / max_entropy))

        day = round(date_out["day"].item())
        month = round(date_out["month"].item())
        year = round(date_out["year"].item())
        day = max(1, min(31, day))
        month = max(1, min(12, month))
        year = max(2000, min(2099, year))
        date_str = f"{year:04d}-{month:02d}-{day:02d}"
        # Date confidence: similar entropy-based approach
        date_attn = date_out["attention_weights"]
        date_entropy = -(date_attn * (date_attn + 1e-8).log()).sum().item()
        date_conf = max(0.0, 1.0 - (date_entropy / max_entropy))

        # Line items
        line_mask = line_item_out["mask"]
        line_count = int(line_mask.sum().item())
        line_detected = line_count > 0

        # Overall confidence: geometric mean of key fields, penalize "other" merchant
        if merchant_idx == OTHER_CLASS_INDEX:
            merchant_conf *= 0.5  # penalize unknown merchant

        overall_conf = (merchant_conf * amount_conf * date_conf) ** (1.0 / 3.0)

        elapsed_ms = int((time.monotonic() - start) * 1000)

        warnings = []
        if merchant_idx == OTHER_CLASS_INDEX:
            warnings.append("Merchant not in top-100 list — may need OCR fallback")
        if amount_conf < FIELD_CONFIDENCE_THRESHOLDS["amount"]:
            warnings.append(f"Low amount confidence: {amount_conf:.2f}")
        if date_conf < FIELD_CONFIDENCE_THRESHOLDS["date"]:
            warnings.append(f"Low date confidence: {date_conf:.2f}")

        return ReceiptExtractionResult(
            merchant=FieldResult(
                value=merchant_name,
                confidence=merchant_conf,
                source="siglip",
            ),
            amount=FieldResult(
                value=round(amount_val, 2),
                confidence=amount_conf,
                source="siglip",
            ),
            date=FieldResult(
                value=date_str,
                confidence=date_conf,
                source="siglip",
            ),
            line_items_detected=line_detected,
            line_item_count=line_count,
            overall_confidence=overall_conf,
            routing_tier=1,
            processing_time_ms=elapsed_ms,
            model_used="siglip-so400m-patch14-384",
            warnings=warnings,
        )

    def should_escalate(self, result: ReceiptExtractionResult) -> bool:
        """Check if the result should be escalated to a heavier model.

        Returns True if overall confidence is below the SigLIP threshold
        or if any critical field has very low confidence.
        """
        if result.overall_confidence < self.siglip_threshold:
            return True

        # Check individual field thresholds
        for field_name, threshold in FIELD_CONFIDENCE_THRESHOLDS.items():
            field_result = getattr(result, field_name)
            if field_result.confidence < threshold:
                return True

        return False

    def get_head_parameters(self) -> list[torch.nn.Parameter]:
        """Get all trainable parameters (heads only, encoder is frozen)."""
        params = []
        for head in [
            self.merchant_head,
            self.amount_head,
            self.date_head,
            self.line_item_head,
        ]:
            params.extend(head.parameters())
        return params
