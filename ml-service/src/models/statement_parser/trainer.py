"""Multi-task trainer for extraction head fine-tuning.

Trains the 6 extraction heads on top of frozen LayoutLMv3 embeddings:
- TransactionBoundary: binary cross-entropy
- Date/Description/Amount/Balance: BIO cross-entropy
- Sign: binary cross-entropy per transaction span
- Amount regression: L1 loss on float values

Supports:
- Independent head training or joint multi-task training
- Per-bank evaluation metrics
- Checkpoint saving with best-model selection
- Weights & Biases logging (optional)
"""

import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, random_split

from .dataset import StatementDataset
from .encoder import LayoutLMv3Encoder
from .extraction_heads import StatementExtractionHeads


@dataclass
class TrainingConfig:
    """Configuration for extraction head training."""

    data_dir: str = "data/labeled_statements"
    output_dir: str = "checkpoints/extraction_heads"
    device: str = "cuda"

    # Training hyperparameters
    learning_rate: float = 1e-3
    batch_size: int = 4
    num_epochs: int = 30
    weight_decay: float = 1e-4
    warmup_steps: int = 100
    max_grad_norm: float = 1.0

    # Loss weights for multi-task training
    boundary_weight: float = 2.0  # higher: boundary detection is critical
    date_weight: float = 1.0
    description_weight: float = 1.0
    amount_bio_weight: float = 1.5
    amount_reg_weight: float = 0.5  # L1 regression loss weight
    sign_weight: float = 1.0
    balance_weight: float = 0.8

    # Data
    val_split: float = 0.15
    min_label_confidence: float = 0.7
    max_seq_length: int = 512

    # Checkpointing
    save_every_epochs: int = 5
    early_stopping_patience: int = 10

    # Encoder
    encoder_dim: int = 768
    hidden_dim: int = 256


@dataclass
class TrainingMetrics:
    """Metrics from a training or evaluation epoch."""

    epoch: int = 0
    loss: float = 0.0
    boundary_f1: float = 0.0
    date_f1: float = 0.0
    description_f1: float = 0.0
    amount_f1: float = 0.0
    balance_f1: float = 0.0
    sign_accuracy: float = 0.0
    amount_mae: float = 0.0
    overall_f1: float = 0.0
    per_bank: dict = field(default_factory=dict)


class ExtractionHeadTrainer:
    """Trains extraction heads on labeled bank statement data."""

    def __init__(self, config: TrainingConfig):
        self.config = config
        self.device = torch.device(config.device if torch.cuda.is_available() else "cpu")

        # Initialize encoder (frozen)
        self.encoder = LayoutLMv3Encoder(device=str(self.device), use_image_features=False)
        self.encoder.load()

        # Initialize trainable heads
        self.heads = StatementExtractionHeads(
            encoder_dim=config.encoder_dim,
            hidden_dim=config.hidden_dim,
        ).to(self.device)

        # Optimizer only updates head parameters
        self.optimizer = torch.optim.AdamW(
            self.heads.parameters(),
            lr=config.learning_rate,
            weight_decay=config.weight_decay,
        )

        # Loss functions
        self.boundary_loss_fn = nn.CrossEntropyLoss(ignore_index=-100)
        self.bio_loss_fn = nn.CrossEntropyLoss(ignore_index=-100)
        self.sign_loss_fn = nn.CrossEntropyLoss()
        self.amount_reg_loss_fn = nn.L1Loss()

        self.best_val_f1 = 0.0
        self.patience_counter = 0

    def train(self) -> TrainingMetrics:
        """Run the full training loop.

        Returns final validation metrics.
        """
        output_dir = Path(self.config.output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        # Load dataset
        dataset = StatementDataset(
            data_dir=self.config.data_dir,
            encoder_tokenizer=self.encoder._tokenizer,
            max_seq_length=self.config.max_seq_length,
            min_confidence=self.config.min_label_confidence,
        )

        if len(dataset) == 0:
            raise ValueError(
                f"No valid samples found in {self.config.data_dir}. "
                "Run label_generator.py first to create training data."
            )

        # Split into train/val
        val_size = max(1, int(len(dataset) * self.config.val_split))
        train_size = len(dataset) - val_size
        train_dataset, val_dataset = random_split(dataset, [train_size, val_size])

        train_loader = DataLoader(
            train_dataset,
            batch_size=self.config.batch_size,
            shuffle=True,
            collate_fn=self._collate_fn,
        )
        val_loader = DataLoader(
            val_dataset,
            batch_size=self.config.batch_size,
            shuffle=False,
            collate_fn=self._collate_fn,
        )

        print(f"Training samples: {train_size}, Validation samples: {val_size}")
        print(f"Bank distribution: {dataset.get_bank_distribution()}")
        print(f"Source distribution: {dataset.get_source_distribution()}")

        # Learning rate scheduler
        scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
            self.optimizer,
            T_max=self.config.num_epochs * len(train_loader),
        )

        best_metrics = TrainingMetrics()

        for epoch in range(self.config.num_epochs):
            # Train
            train_loss = self._train_epoch(train_loader, scheduler)

            # Evaluate
            val_metrics = self._evaluate(val_loader, epoch)
            val_metrics.loss = train_loss

            print(
                f"Epoch {epoch + 1}/{self.config.num_epochs} | "
                f"Loss: {train_loss:.4f} | "
                f"Boundary F1: {val_metrics.boundary_f1:.3f} | "
                f"Date F1: {val_metrics.date_f1:.3f} | "
                f"Amount F1: {val_metrics.amount_f1:.3f} | "
                f"Sign Acc: {val_metrics.sign_accuracy:.3f} | "
                f"Overall F1: {val_metrics.overall_f1:.3f}"
            )

            # Save best model
            if val_metrics.overall_f1 > self.best_val_f1:
                self.best_val_f1 = val_metrics.overall_f1
                self.patience_counter = 0
                best_metrics = val_metrics
                self._save_checkpoint(output_dir / "best_heads.pt", val_metrics)
                print(f"  → New best model (F1: {val_metrics.overall_f1:.3f})")
            else:
                self.patience_counter += 1

            # Periodic save
            if (epoch + 1) % self.config.save_every_epochs == 0:
                self._save_checkpoint(
                    output_dir / f"heads_epoch{epoch + 1}.pt", val_metrics
                )

            # Early stopping
            if self.patience_counter >= self.config.early_stopping_patience:
                print(f"Early stopping at epoch {epoch + 1}")
                break

        # Save final model
        self._save_checkpoint(output_dir / "final_heads.pt", best_metrics)

        # Save training config and metrics
        with open(output_dir / "training_config.json", "w") as f:
            json.dump(
                {
                    "config": {
                        k: v
                        for k, v in self.config.__dict__.items()
                        if not k.startswith("_")
                    },
                    "best_metrics": {
                        "overall_f1": best_metrics.overall_f1,
                        "boundary_f1": best_metrics.boundary_f1,
                        "date_f1": best_metrics.date_f1,
                        "description_f1": best_metrics.description_f1,
                        "amount_f1": best_metrics.amount_f1,
                        "balance_f1": best_metrics.balance_f1,
                        "sign_accuracy": best_metrics.sign_accuracy,
                        "amount_mae": best_metrics.amount_mae,
                    },
                    "dataset_size": len(dataset),
                    "bank_distribution": dataset.get_bank_distribution(),
                },
                f,
                indent=2,
            )

        return best_metrics

    def _train_epoch(self, loader: DataLoader, scheduler) -> float:
        """Run one training epoch. Returns average loss."""
        self.heads.train()
        total_loss = 0.0
        n_batches = 0

        for batch in loader:
            self.optimizer.zero_grad()

            # Get frozen encoder embeddings
            input_ids = batch["input_ids"].to(self.device)
            attention_mask = batch["attention_mask"].to(self.device)
            bbox = batch["bbox"].to(self.device)

            with torch.no_grad():
                outputs = self.encoder._model(
                    input_ids=input_ids,
                    attention_mask=attention_mask,
                    bbox=bbox,
                )
                embeddings = outputs.last_hidden_state

            # Compute multi-task loss
            loss = self._compute_loss(batch, embeddings, attention_mask)

            loss.backward()
            torch.nn.utils.clip_grad_norm_(
                self.heads.parameters(), self.config.max_grad_norm
            )
            self.optimizer.step()
            scheduler.step()

            total_loss += loss.item()
            n_batches += 1

        return total_loss / max(n_batches, 1)

    def _compute_loss(
        self,
        batch: dict,
        embeddings: torch.Tensor,
        attention_mask: torch.Tensor,
    ) -> torch.Tensor:
        """Compute multi-task loss across all extraction heads."""
        cfg = self.config
        loss = torch.tensor(0.0, device=self.device)

        # 1. Boundary loss (binary CE)
        boundary_logits = self.heads.boundary(embeddings, attention_mask)
        boundary_labels = batch["boundary_labels"].to(self.device)
        boundary_loss = self.boundary_loss_fn(
            boundary_logits.view(-1, 2), boundary_labels.view(-1)
        )
        loss = loss + cfg.boundary_weight * boundary_loss

        # 2. Date BIO loss
        date_logits = self.heads.date(embeddings)
        date_labels = batch["date_bio"].to(self.device)
        date_loss = self.bio_loss_fn(date_logits.view(-1, 3), date_labels.view(-1))
        loss = loss + cfg.date_weight * date_loss

        # 3. Description BIO loss
        desc_logits = self.heads.description(embeddings)
        desc_labels = batch["description_bio"].to(self.device)
        desc_loss = self.bio_loss_fn(desc_logits.view(-1, 3), desc_labels.view(-1))
        loss = loss + cfg.description_weight * desc_loss

        # 4. Amount BIO loss
        amount_bio_logits = self.heads.amount.bio_head(embeddings)
        amount_labels = batch["amount_bio"].to(self.device)
        amount_bio_loss = self.bio_loss_fn(
            amount_bio_logits.view(-1, 3), amount_labels.view(-1)
        )
        loss = loss + cfg.amount_bio_weight * amount_bio_loss

        # 5. Balance BIO loss
        balance_logits = self.heads.balance(embeddings)
        balance_labels = batch["balance_bio"].to(self.device)
        balance_loss = self.bio_loss_fn(
            balance_logits.view(-1, 3), balance_labels.view(-1)
        )
        loss = loss + cfg.balance_weight * balance_loss

        # 6. Sign loss (per transaction span)
        # Handle variable-length per-sample lists
        for i in range(embeddings.shape[0]):
            spans = batch["transaction_spans"][i]
            signs = batch["sign_labels"][i]
            amounts = batch["amount_values"][i]

            if not spans:
                continue

            for (start, end), sign, amount_val in zip(spans, signs, amounts):
                if start >= embeddings.shape[1] or end >= embeddings.shape[1]:
                    continue

                # Sign classification
                span_emb = embeddings[i, start : end + 1].mean(dim=0, keepdim=True)
                sign_logits = self.heads.sign(span_emb)
                sign_target = torch.tensor([sign], device=self.device, dtype=torch.long)
                sign_loss = self.sign_loss_fn(sign_logits, sign_target)
                loss = loss + cfg.sign_weight * sign_loss / max(len(spans), 1)

                # Amount regression
                amount_pred = self.heads.amount.regressor(span_emb)
                amount_target = torch.tensor(
                    [[amount_val]], device=self.device, dtype=torch.float
                )
                reg_loss = self.amount_reg_loss_fn(amount_pred, amount_target)
                loss = loss + cfg.amount_reg_weight * reg_loss / max(len(spans), 1)

        return loss

    @torch.no_grad()
    def _evaluate(self, loader: DataLoader, epoch: int) -> TrainingMetrics:
        """Evaluate on validation set. Returns per-field metrics."""
        self.heads.eval()

        # Accumulators for F1 computation
        boundary_tp, boundary_fp, boundary_fn = 0, 0, 0
        date_tp, date_fp, date_fn = 0, 0, 0
        desc_tp, desc_fp, desc_fn = 0, 0, 0
        amount_tp, amount_fp, amount_fn = 0, 0, 0
        balance_tp, balance_fp, balance_fn = 0, 0, 0
        sign_correct, sign_total = 0, 0
        amount_abs_error, amount_count = 0.0, 0

        for batch in loader:
            input_ids = batch["input_ids"].to(self.device)
            attention_mask = batch["attention_mask"].to(self.device)
            bbox = batch["bbox"].to(self.device)

            outputs = self.encoder._model(
                input_ids=input_ids,
                attention_mask=attention_mask,
                bbox=bbox,
            )
            embeddings = outputs.last_hidden_state

            # Boundary F1
            boundary_logits = self.heads.boundary(embeddings, attention_mask)
            boundary_preds = boundary_logits.argmax(dim=-1)
            boundary_labels = batch["boundary_labels"].to(self.device)
            tp, fp, fn = self._token_f1_counts(
                boundary_preds, boundary_labels, positive_label=1
            )
            boundary_tp += tp
            boundary_fp += fp
            boundary_fn += fn

            # Date BIO F1
            date_logits = self.heads.date(embeddings)
            date_preds = date_logits.argmax(dim=-1)
            date_labels = batch["date_bio"].to(self.device)
            tp, fp, fn = self._bio_f1_counts(date_preds, date_labels)
            date_tp += tp
            date_fp += fp
            date_fn += fn

            # Description BIO F1
            desc_logits = self.heads.description(embeddings)
            desc_preds = desc_logits.argmax(dim=-1)
            desc_labels = batch["description_bio"].to(self.device)
            tp, fp, fn = self._bio_f1_counts(desc_preds, desc_labels)
            desc_tp += tp
            desc_fp += fp
            desc_fn += fn

            # Amount BIO F1
            amount_logits = self.heads.amount.bio_head(embeddings)
            amount_preds = amount_logits.argmax(dim=-1)
            amount_labels = batch["amount_bio"].to(self.device)
            tp, fp, fn = self._bio_f1_counts(amount_preds, amount_labels)
            amount_tp += tp
            amount_fp += fp
            amount_fn += fn

            # Balance BIO F1
            balance_logits = self.heads.balance(embeddings)
            balance_preds = balance_logits.argmax(dim=-1)
            balance_labels = batch["balance_bio"].to(self.device)
            tp, fp, fn = self._bio_f1_counts(balance_preds, balance_labels)
            balance_tp += tp
            balance_fp += fp
            balance_fn += fn

            # Sign accuracy and amount MAE
            for i in range(embeddings.shape[0]):
                spans = batch["transaction_spans"][i]
                signs = batch["sign_labels"][i]
                amounts = batch["amount_values"][i]

                for (start, end), sign, amount_val in zip(spans, signs, amounts):
                    if start >= embeddings.shape[1]:
                        continue

                    span_emb = embeddings[i, start : end + 1].mean(dim=0, keepdim=True)

                    # Sign
                    sign_logits = self.heads.sign(span_emb)
                    pred_sign = sign_logits.argmax(dim=-1).item()
                    if pred_sign == sign:
                        sign_correct += 1
                    sign_total += 1

                    # Amount MAE
                    amount_pred = self.heads.amount.regressor(span_emb).item()
                    amount_abs_error += abs(amount_pred - amount_val)
                    amount_count += 1

        def f1(tp, fp, fn):
            precision = tp / max(tp + fp, 1)
            recall = tp / max(tp + fn, 1)
            return 2 * precision * recall / max(precision + recall, 1e-8)

        metrics = TrainingMetrics(
            epoch=epoch,
            boundary_f1=f1(boundary_tp, boundary_fp, boundary_fn),
            date_f1=f1(date_tp, date_fp, date_fn),
            description_f1=f1(desc_tp, desc_fp, desc_fn),
            amount_f1=f1(amount_tp, amount_fp, amount_fn),
            balance_f1=f1(balance_tp, balance_fp, balance_fn),
            sign_accuracy=sign_correct / max(sign_total, 1),
            amount_mae=amount_abs_error / max(amount_count, 1),
        )

        # Overall F1 = weighted average of field F1s
        metrics.overall_f1 = (
            metrics.boundary_f1 * 0.25
            + metrics.date_f1 * 0.20
            + metrics.description_f1 * 0.10
            + metrics.amount_f1 * 0.25
            + metrics.balance_f1 * 0.10
            + metrics.sign_accuracy * 0.10
        )

        return metrics

    def _token_f1_counts(
        self,
        preds: torch.Tensor,
        labels: torch.Tensor,
        positive_label: int = 1,
    ) -> tuple[int, int, int]:
        """Count true positives, false positives, false negatives for token-level F1."""
        mask = labels != -100
        preds_masked = preds[mask]
        labels_masked = labels[mask]

        tp = ((preds_masked == positive_label) & (labels_masked == positive_label)).sum().item()
        fp = ((preds_masked == positive_label) & (labels_masked != positive_label)).sum().item()
        fn = ((preds_masked != positive_label) & (labels_masked == positive_label)).sum().item()

        return tp, fp, fn

    def _bio_f1_counts(
        self,
        preds: torch.Tensor,
        labels: torch.Tensor,
    ) -> tuple[int, int, int]:
        """Count TP/FP/FN for BIO tagging (B and I are positive, O is negative)."""
        mask = labels != -100
        preds_masked = preds[mask]
        labels_masked = labels[mask]

        # B=0, I=1 are positive; O=2 is negative
        pred_positive = preds_masked < 2
        label_positive = labels_masked < 2

        tp = (pred_positive & label_positive).sum().item()
        fp = (pred_positive & ~label_positive).sum().item()
        fn = (~pred_positive & label_positive).sum().item()

        return tp, fp, fn

    def _save_checkpoint(self, path: Path, metrics: TrainingMetrics) -> None:
        """Save extraction head weights and metadata."""
        torch.save(
            {
                "heads_state_dict": self.heads.state_dict(),
                "optimizer_state_dict": self.optimizer.state_dict(),
                "metrics": {
                    "overall_f1": metrics.overall_f1,
                    "boundary_f1": metrics.boundary_f1,
                    "date_f1": metrics.date_f1,
                    "amount_f1": metrics.amount_f1,
                    "sign_accuracy": metrics.sign_accuracy,
                },
                "config": self.config.__dict__,
            },
            path,
        )

    def _collate_fn(self, batch: list[dict]) -> dict:
        """Custom collate that handles variable-length per-transaction fields."""
        result = {}

        # Stack tensor fields
        tensor_keys = [
            "input_ids", "attention_mask", "bbox",
            "boundary_labels", "date_bio", "description_bio",
            "amount_bio", "balance_bio",
        ]
        for key in tensor_keys:
            if key in batch[0] and isinstance(batch[0][key], torch.Tensor):
                result[key] = torch.stack([b[key] for b in batch])

        # Keep list fields as-is (variable length per sample)
        list_keys = ["sign_labels", "amount_values", "transaction_spans", "bank"]
        for key in list_keys:
            if key in batch[0]:
                result[key] = [b[key] for b in batch]

        return result
