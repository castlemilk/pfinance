"""Training loop for SigLIP receipt task heads.

Trains the four lightweight heads on silver labels from Qwen2-VL outputs.
The SigLIP encoder remains frozen — only head parameters are updated.

Usage:
    python -m src.models.receipt_siglip.trainer \
        --data-dir /path/to/training_data \
        --output-dir /path/to/weights \
        --epochs 20 \
        --batch-size 32
"""

import argparse
import logging
import time
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, random_split

from .dataset import ReceiptDataset
from .merchants import NUM_MERCHANT_CLASSES
from .pipeline import SigLIPReceiptPipeline

logger = logging.getLogger(__name__)


class HeadTrainer:
    """Trains all four task heads jointly with multi-task loss."""

    def __init__(
        self,
        pipeline: SigLIPReceiptPipeline,
        lr: float = 1e-3,
        weight_decay: float = 1e-4,
        merchant_loss_weight: float = 1.0,
        amount_loss_weight: float = 1.0,
        date_loss_weight: float = 1.0,
        line_item_loss_weight: float = 0.5,
    ):
        self.pipeline = pipeline
        self.loss_weights = {
            "merchant": merchant_loss_weight,
            "amount": amount_loss_weight,
            "date": date_loss_weight,
            "line_item": line_item_loss_weight,
        }

        # Only optimize head parameters
        self.optimizer = torch.optim.AdamW(
            pipeline.get_head_parameters(),
            lr=lr,
            weight_decay=weight_decay,
        )
        self.scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
            self.optimizer, T_max=50, eta_min=1e-5
        )

    def compute_loss(
        self,
        batch: dict,
        features: dict[str, torch.Tensor],
    ) -> tuple[torch.Tensor, dict[str, float]]:
        """Compute multi-task loss for all heads.

        Args:
            batch: Dict from ReceiptDataset.__getitem__.
            features: Dict with patch_embeddings and pooled from encoder.

        Returns:
            Tuple of (total_loss, per_head_losses dict).
        """
        device = features["pooled"].device
        losses = {}

        # 1. Merchant classification loss (cross-entropy)
        merchant_out = self.pipeline.merchant_head(features["pooled"])
        merchant_labels = batch["merchant_label"].to(device)
        losses["merchant"] = F.cross_entropy(
            merchant_out["logits"], merchant_labels
        )

        # 2. Amount regression loss (smooth L1)
        amount_out = self.pipeline.amount_head(features["patch_embeddings"])
        amount_labels = batch["amount_label"].to(device).float()
        losses["amount"] = F.smooth_l1_loss(amount_out["amount"], amount_labels)

        # 3. Date regression loss (smooth L1 on each component)
        date_out = self.pipeline.date_head(features["patch_embeddings"])
        day_labels = batch["date_day"].to(device).float()
        month_labels = batch["date_month"].to(device).float()
        year_labels = batch["date_year"].to(device).float()

        losses["date"] = (
            F.smooth_l1_loss(date_out["day"], day_labels)
            + F.smooth_l1_loss(date_out["month"], month_labels)
            + F.smooth_l1_loss(date_out["year"], year_labels) * 0.01  # scale year
        )

        # 4. Line item detection loss (binary cross-entropy)
        # We use has_line_items as a weak label for the whole image
        line_out = self.pipeline.line_item_head(features["patch_embeddings"])
        line_labels = batch["has_line_items"].to(device).float()
        # Mean of patch predictions should match has_line_items
        mean_line_pred = torch.sigmoid(line_out["logits"]).mean(dim=-1)
        losses["line_item"] = F.binary_cross_entropy(
            mean_line_pred, line_labels
        )

        # Weighted total
        total = sum(
            self.loss_weights[k] * v for k, v in losses.items()
        )

        return total, {k: v.item() for k, v in losses.items()}

    @torch.no_grad()
    def compute_metrics(
        self,
        batch: dict,
        features: dict[str, torch.Tensor],
    ) -> dict[str, float]:
        """Compute evaluation metrics for a batch."""
        device = features["pooled"].device

        # Merchant accuracy
        merchant_out = self.pipeline.merchant_head(features["pooled"])
        merchant_labels = batch["merchant_label"].to(device)
        merchant_acc = (
            merchant_out["predicted_class"] == merchant_labels
        ).float().mean().item()

        # Amount MAE (mean absolute error)
        amount_out = self.pipeline.amount_head(features["patch_embeddings"])
        amount_labels = batch["amount_label"].to(device).float()
        amount_mae = (amount_out["amount"] - amount_labels).abs().mean().item()

        # Date accuracy (exact match for day, month, year separately)
        date_out = self.pipeline.date_head(features["patch_embeddings"])
        day_acc = (date_out["day"].round() == batch["date_day"].to(device).float()).float().mean().item()
        month_acc = (date_out["month"].round() == batch["date_month"].to(device).float()).float().mean().item()

        return {
            "merchant_acc": merchant_acc,
            "amount_mae": amount_mae,
            "day_acc": day_acc,
            "month_acc": month_acc,
        }

    def train_epoch(
        self,
        dataloader: DataLoader,
    ) -> dict[str, float]:
        """Run one training epoch."""
        self.pipeline.merchant_head.train()
        self.pipeline.amount_head.train()
        self.pipeline.date_head.train()
        self.pipeline.line_item_head.train()

        total_loss = 0.0
        per_head_totals: dict[str, float] = {}
        num_batches = 0

        for batch in dataloader:
            pixel_values = batch["pixel_values"].to(self.pipeline.device)

            # Encode with frozen SigLIP (no grad)
            with torch.no_grad():
                features = self.pipeline.encoder(pixel_values)

            # Compute loss on heads
            loss, head_losses = self.compute_loss(batch, features)

            # Backward pass (only updates head parameters)
            self.optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(
                self.pipeline.get_head_parameters(), max_norm=1.0
            )
            self.optimizer.step()

            total_loss += loss.item()
            for k, v in head_losses.items():
                per_head_totals[k] = per_head_totals.get(k, 0) + v
            num_batches += 1

        self.scheduler.step()

        return {
            "total_loss": total_loss / max(num_batches, 1),
            **{
                f"{k}_loss": v / max(num_batches, 1)
                for k, v in per_head_totals.items()
            },
        }

    @torch.no_grad()
    def evaluate(self, dataloader: DataLoader) -> dict[str, float]:
        """Evaluate on a dataset."""
        self.pipeline.merchant_head.eval()
        self.pipeline.amount_head.eval()
        self.pipeline.date_head.eval()
        self.pipeline.line_item_head.eval()

        all_metrics: dict[str, list[float]] = {}
        total_loss = 0.0
        num_batches = 0

        for batch in dataloader:
            pixel_values = batch["pixel_values"].to(self.pipeline.device)
            features = self.pipeline.encoder(pixel_values)

            loss, _ = self.compute_loss(batch, features)
            total_loss += loss.item()

            metrics = self.compute_metrics(batch, features)
            for k, v in metrics.items():
                all_metrics.setdefault(k, []).append(v)
            num_batches += 1

        return {
            "eval_loss": total_loss / max(num_batches, 1),
            **{
                k: sum(v) / len(v) for k, v in all_metrics.items()
            },
        }


def train(
    data_dir: str,
    output_dir: str,
    epochs: int = 20,
    batch_size: int = 32,
    lr: float = 1e-3,
    val_split: float = 0.15,
    device: str | None = None,
) -> dict[str, float]:
    """Full training run for SigLIP receipt heads.

    Args:
        data_dir: Path to dataset (images/ + labels.jsonl).
        output_dir: Path to save trained weights.
        epochs: Number of training epochs.
        batch_size: Training batch size.
        lr: Learning rate.
        val_split: Fraction of data for validation.
        device: Device override.

    Returns:
        Final evaluation metrics.
    """
    # Initialize pipeline
    pipeline = SigLIPReceiptPipeline(device=device)
    pipeline.load()

    # Create dataset
    dataset = ReceiptDataset(data_dir, encoder=pipeline.encoder)
    if len(dataset) == 0:
        raise ValueError(f"No training samples found in {data_dir}")

    # Train/val split
    val_size = max(1, int(len(dataset) * val_split))
    train_size = len(dataset) - val_size
    train_ds, val_ds = random_split(dataset, [train_size, val_size])

    train_loader = DataLoader(
        train_ds, batch_size=batch_size, shuffle=True, num_workers=2,
    )
    val_loader = DataLoader(
        val_ds, batch_size=batch_size, shuffle=False, num_workers=2,
    )

    logger.info(
        "Training: %d samples, Validation: %d samples",
        len(train_ds),
        len(val_ds),
    )

    # Train
    trainer = HeadTrainer(pipeline, lr=lr)
    best_eval_loss = float("inf")

    for epoch in range(epochs):
        start = time.monotonic()
        train_metrics = trainer.train_epoch(train_loader)
        eval_metrics = trainer.evaluate(val_loader)
        elapsed = time.monotonic() - start

        logger.info(
            "Epoch %d/%d (%.1fs): train_loss=%.4f eval_loss=%.4f "
            "merchant_acc=%.3f amount_mae=%.2f",
            epoch + 1,
            epochs,
            elapsed,
            train_metrics["total_loss"],
            eval_metrics["eval_loss"],
            eval_metrics.get("merchant_acc", 0),
            eval_metrics.get("amount_mae", 0),
        )

        # Save best weights
        if eval_metrics["eval_loss"] < best_eval_loss:
            best_eval_loss = eval_metrics["eval_loss"]
            pipeline.save_head_weights(output_dir)
            logger.info("Saved best weights (eval_loss=%.4f)", best_eval_loss)

    # Final evaluation
    final_metrics = trainer.evaluate(val_loader)
    logger.info("Final metrics: %s", final_metrics)
    return final_metrics


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    parser = argparse.ArgumentParser(description="Train SigLIP receipt heads")
    parser.add_argument("--data-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--device", default=None)
    args = parser.parse_args()

    train(
        data_dir=args.data_dir,
        output_dir=args.output_dir,
        epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
        device=args.device,
    )
