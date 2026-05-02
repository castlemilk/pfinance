"""Task-specific heads for SigLIP receipt extraction.

Each head is a lightweight 2-layer MLP that operates on the frozen SigLIP
encoder's output. Total additional parameters: ~500K across all four heads.

Heads:
  1. MerchantClassifier — top-100 AU merchants + "other" (softmax)
  2. AmountRegressor — attention-pooled patches → total amount float
  3. DateExtractor — attention-pooled patches → (day, month, year) regression
  4. LineItemDetector — per-patch binary classifier for line item regions
"""

import torch
import torch.nn as nn
import torch.nn.functional as F

from .encoder import SIGLIP_HIDDEN_DIM
from .merchants import NUM_MERCHANT_CLASSES


class AttentionPool(nn.Module):
    """Learnable attention pooling over patch embeddings.

    Learns a query vector that attends to relevant patches (e.g., the TOTAL
    region for amount extraction) and produces a weighted sum.
    """

    def __init__(self, hidden_dim: int):
        super().__init__()
        self.query = nn.Linear(hidden_dim, 1)

    def forward(self, patch_embeddings: torch.Tensor) -> torch.Tensor:
        """Pool patch embeddings via learned attention.

        Args:
            patch_embeddings: [B, num_patches, hidden_dim]

        Returns:
            Pooled representation [B, hidden_dim]
        """
        # [B, num_patches, 1]
        attn_weights = self.query(patch_embeddings)
        attn_weights = F.softmax(attn_weights, dim=1)
        # [B, hidden_dim]
        return (patch_embeddings * attn_weights).sum(dim=1)


class MerchantClassifier(nn.Module):
    """Classifies receipt merchant from top-100 AU merchants + "other".

    Uses the pooled CLS embedding (not patch-level) since merchant identity
    is a global image property.

    Parameters: ~100K
    """

    def __init__(
        self,
        hidden_dim: int = SIGLIP_HIDDEN_DIM,
        intermediate_dim: int = 256,
        num_classes: int = NUM_MERCHANT_CLASSES,
        dropout: float = 0.1,
    ):
        super().__init__()
        self.head = nn.Sequential(
            nn.Linear(hidden_dim, intermediate_dim),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(intermediate_dim, num_classes),
        )

    def forward(self, pooled: torch.Tensor) -> dict[str, torch.Tensor]:
        """Classify merchant from pooled features.

        Args:
            pooled: [B, hidden_dim] from encoder's pooled output.

        Returns:
            Dict with:
                - "logits": [B, num_classes] raw logits
                - "confidence": [B] max softmax probability
                - "predicted_class": [B] argmax class index
        """
        logits = self.head(pooled)
        probs = F.softmax(logits, dim=-1)
        confidence, predicted = probs.max(dim=-1)
        return {
            "logits": logits,
            "confidence": confidence,
            "predicted_class": predicted,
        }


class AmountRegressor(nn.Module):
    """Regresses the total amount from attention-pooled patch features.

    Learns to attend to the "TOTAL" / bottom region of the receipt where
    the final amount typically appears.

    Parameters: ~150K
    """

    def __init__(
        self,
        hidden_dim: int = SIGLIP_HIDDEN_DIM,
        intermediate_dim: int = 256,
        dropout: float = 0.1,
    ):
        super().__init__()
        self.attention_pool = AttentionPool(hidden_dim)
        self.head = nn.Sequential(
            nn.Linear(hidden_dim, intermediate_dim),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(intermediate_dim, 1),
            nn.Softplus(),  # amounts are always positive
        )

    def forward(self, patch_embeddings: torch.Tensor) -> dict[str, torch.Tensor]:
        """Regress total amount from patch features.

        Args:
            patch_embeddings: [B, num_patches, hidden_dim]

        Returns:
            Dict with:
                - "amount": [B] predicted amount in dollars
                - "attention_weights": [B, num_patches] learned attention
        """
        # Store attention weights for interpretability
        attn_weights = F.softmax(
            self.attention_pool.query(patch_embeddings), dim=1
        ).squeeze(-1)

        pooled = self.attention_pool(patch_embeddings)
        amount = self.head(pooled).squeeze(-1)

        return {
            "amount": amount,
            "attention_weights": attn_weights,
        }


class DateExtractor(nn.Module):
    """Extracts transaction date as (day, month, year) from patch features.

    Uses attention pooling to focus on the date region of the receipt,
    then regresses three values: day (1-31), month (1-12), year (2000-2099).

    Parameters: ~150K
    """

    def __init__(
        self,
        hidden_dim: int = SIGLIP_HIDDEN_DIM,
        intermediate_dim: int = 256,
        dropout: float = 0.1,
    ):
        super().__init__()
        self.attention_pool = AttentionPool(hidden_dim)
        self.head = nn.Sequential(
            nn.Linear(hidden_dim, intermediate_dim),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(intermediate_dim, 3),  # day, month, year
        )

    def forward(self, patch_embeddings: torch.Tensor) -> dict[str, torch.Tensor]:
        """Extract date components from patch features.

        Args:
            patch_embeddings: [B, num_patches, hidden_dim]

        Returns:
            Dict with:
                - "day": [B] predicted day (1-31)
                - "month": [B] predicted month (1-12)
                - "year": [B] predicted year (e.g. 2026)
                - "attention_weights": [B, num_patches]
        """
        attn_weights = F.softmax(
            self.attention_pool.query(patch_embeddings), dim=1
        ).squeeze(-1)

        pooled = self.attention_pool(patch_embeddings)
        raw = self.head(pooled)

        # Constrain to valid ranges using sigmoid scaling
        day = torch.sigmoid(raw[:, 0]) * 30 + 1  # [1, 31]
        month = torch.sigmoid(raw[:, 1]) * 11 + 1  # [1, 12]
        year = torch.sigmoid(raw[:, 2]) * 99 + 2000  # [2000, 2099]

        return {
            "day": day,
            "month": month,
            "year": year,
            "attention_weights": attn_weights,
        }


class LineItemDetector(nn.Module):
    """Per-patch binary classifier for line item region detection.

    Classifies each patch as belonging to a line item region or not.
    Used to crop line item regions for detailed OCR extraction.

    Parameters: ~100K
    """

    def __init__(
        self,
        hidden_dim: int = SIGLIP_HIDDEN_DIM,
        intermediate_dim: int = 128,
        dropout: float = 0.1,
    ):
        super().__init__()
        self.head = nn.Sequential(
            nn.Linear(hidden_dim, intermediate_dim),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(intermediate_dim, 1),
        )

    def forward(self, patch_embeddings: torch.Tensor) -> dict[str, torch.Tensor]:
        """Detect line item regions in patch features.

        Args:
            patch_embeddings: [B, num_patches, hidden_dim]

        Returns:
            Dict with:
                - "logits": [B, num_patches] raw logits per patch
                - "mask": [B, num_patches] binary mask (threshold=0.5)
                - "confidence": [B] mean confidence of positive patches
        """
        # [B, num_patches, 1] -> [B, num_patches]
        logits = self.head(patch_embeddings).squeeze(-1)
        probs = torch.sigmoid(logits)
        mask = (probs > 0.5).float()

        # Confidence: mean probability of detected line item patches
        # If no patches detected, confidence is 0
        pos_count = mask.sum(dim=-1).clamp(min=1)
        confidence = (probs * mask).sum(dim=-1) / pos_count

        return {
            "logits": logits,
            "mask": mask,
            "confidence": confidence,
        }
