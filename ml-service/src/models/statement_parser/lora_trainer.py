"""LoRA adapter training for bank-specific statement parsing.

Trains bank-specific LoRA adapters on top of the frozen LayoutLMv3 encoder.
Each adapter specializes the encoder for a particular bank's statement format.

Usage:
    python -m src.models.statement_parser.lora_trainer \
        --data-dir data/labeled_statements \
        --output-dir checkpoints/lora \
        --bank nab \
        --heads-path checkpoints/extraction_heads/best_heads.pt

Training flow:
1. Load frozen LayoutLMv3 encoder
2. Load pre-trained extraction heads (from PPF-18 trainer)
3. Create LoRA adapter for target bank
4. Train adapter + fine-tune heads jointly on bank-specific data
5. Evaluate and save if improved
"""

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Subset

from .bank_detector import BankFormat
from .dataset import StatementDataset
from .encoder import LayoutLMv3Encoder
from .extraction_heads import StatementExtractionHeads
from .lora_adapter import LoRAAdapterManager, LoRAConfig
from .trainer import ExtractionHeadTrainer, TrainingConfig, TrainingMetrics


@dataclass
class LoRATrainingConfig:
    """Configuration for LoRA adapter training."""

    data_dir: str = "data/labeled_statements"
    output_dir: str = "checkpoints/lora"
    heads_path: str = "checkpoints/extraction_heads/best_heads.pt"
    bank: str = "nab"
    device: str = "cuda"

    # LoRA hyperparameters
    lora_rank: int = 8
    lora_alpha: float = 16.0
    lora_dropout: float = 0.05
    target_modules: tuple = ("query", "key", "value")

    # Training hyperparameters
    learning_rate: float = 2e-5  # Lower than head training (adapter is more sensitive)
    batch_size: int = 4
    num_epochs: int = 15
    weight_decay: float = 1e-4
    max_grad_norm: float = 1.0

    # Joint training: also update heads during adapter training
    train_heads_jointly: bool = True
    heads_lr_multiplier: float = 0.1  # Heads learn 10x slower than adapter

    # Data
    min_label_confidence: float = 0.7
    max_seq_length: int = 512
    val_split: float = 0.2

    # Checkpointing
    early_stopping_patience: int = 8


class LoRATrainer:
    """Trains bank-specific LoRA adapters with optional joint head fine-tuning."""

    def __init__(self, config: LoRATrainingConfig):
        self.config = config
        self.device = torch.device(config.device if torch.cuda.is_available() else "cpu")

        # Initialize encoder (frozen)
        self.encoder = LayoutLMv3Encoder(device=str(self.device), use_image_features=False)
        self.encoder.load()

        # Initialize extraction heads (load pre-trained weights)
        self.heads = StatementExtractionHeads(
            encoder_dim=LayoutLMv3Encoder.HIDDEN_SIZE,
            hidden_dim=256,
        ).to(self.device)

        if os.path.exists(config.heads_path):
            checkpoint = torch.load(config.heads_path, map_location=self.device, weights_only=True)
            if "heads_state_dict" in checkpoint:
                self.heads.load_state_dict(checkpoint["heads_state_dict"])
            else:
                self.heads.load_state_dict(checkpoint)
            print(f"Loaded pre-trained heads from {config.heads_path}")
        else:
            print(f"WARNING: No pre-trained heads at {config.heads_path}, using random initialization")

        # Create LoRA adapter
        self.lora_config = LoRAConfig(
            rank=config.lora_rank,
            alpha=config.lora_alpha,
            dropout=config.lora_dropout,
            target_modules=config.target_modules,
        )
        self.adapter_manager = LoRAAdapterManager(self.encoder._model, self.lora_config)
        self.bank_format = BankFormat(config.bank)
        adapter = self.adapter_manager.create_adapter(self.bank_format)
        self.adapter_manager.activate(config.bank)

        print(f"LoRA adapter for {config.bank}: {adapter.param_count:,} params "
              f"({adapter.size_bytes / 1024:.1f} KB)")

        # Build optimizer with parameter groups
        param_groups = [
            {
                "params": adapter.parameters(),
                "lr": config.learning_rate,
                "name": "lora_adapter",
            },
        ]
        if config.train_heads_jointly:
            param_groups.append({
                "params": self.heads.parameters(),
                "lr": config.learning_rate * config.heads_lr_multiplier,
                "name": "extraction_heads",
            })

        self.optimizer = torch.optim.AdamW(
            param_groups,
            weight_decay=config.weight_decay,
        )

        # Loss functions (same as head trainer)
        self.boundary_loss_fn = nn.CrossEntropyLoss(ignore_index=-100)
        self.bio_loss_fn = nn.CrossEntropyLoss(ignore_index=-100)
        self.sign_loss_fn = nn.CrossEntropyLoss()
        self.amount_reg_loss_fn = nn.L1Loss()

        self.best_val_f1 = 0.0
        self.patience_counter = 0

    def train(self) -> TrainingMetrics:
        """Run the LoRA adapter training loop."""
        output_dir = Path(self.config.output_dir) / self.config.bank
        output_dir.mkdir(parents=True, exist_ok=True)

        # Load dataset, filtered to target bank
        full_dataset = StatementDataset(
            data_dir=self.config.data_dir,
            encoder_tokenizer=self.encoder._tokenizer,
            max_seq_length=self.config.max_seq_length,
            min_confidence=self.config.min_label_confidence,
        )

        # Filter to target bank
        bank_indices = [
            i for i, sample in enumerate(full_dataset.samples)
            if sample.bank == self.config.bank
        ]

        if len(bank_indices) == 0:
            raise ValueError(
                f"No training samples for bank '{self.config.bank}' in {self.config.data_dir}. "
                f"Available banks: {full_dataset.get_bank_distribution()}"
            )

        bank_dataset = Subset(full_dataset, bank_indices)

        # Split into train/val
        val_size = max(1, int(len(bank_dataset) * self.config.val_split))
        train_size = len(bank_dataset) - val_size

        generator = torch.Generator().manual_seed(42)
        train_indices, val_indices = torch.utils.data.random_split(
            range(len(bank_dataset)), [train_size, val_size], generator=generator
        )

        train_subset = Subset(bank_dataset, train_indices.indices)
        val_subset = Subset(bank_dataset, val_indices.indices)

        train_loader = DataLoader(
            train_subset,
            batch_size=self.config.batch_size,
            shuffle=True,
            collate_fn=self._collate_fn,
        )
        val_loader = DataLoader(
            val_subset,
            batch_size=self.config.batch_size,
            shuffle=False,
            collate_fn=self._collate_fn,
        )

        print(f"Bank '{self.config.bank}': {train_size} train, {val_size} val samples")

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
                f"Overall F1: {val_metrics.overall_f1:.3f}"
            )

            # Save best
            if val_metrics.overall_f1 > self.best_val_f1:
                self.best_val_f1 = val_metrics.overall_f1
                self.patience_counter = 0
                best_metrics = val_metrics
                self._save_checkpoint(output_dir, val_metrics)
                print(f"  -> New best (F1: {val_metrics.overall_f1:.3f})")
            else:
                self.patience_counter += 1

            if self.patience_counter >= self.config.early_stopping_patience:
                print(f"Early stopping at epoch {epoch + 1}")
                break

        # Save training summary
        with open(output_dir / "training_summary.json", "w") as f:
            json.dump({
                "bank": self.config.bank,
                "lora_rank": self.config.lora_rank,
                "lora_alpha": self.config.lora_alpha,
                "adapter_params": self.adapter_manager.adapters[self.config.bank].param_count,
                "adapter_size_kb": self.adapter_manager.adapters[self.config.bank].size_bytes / 1024,
                "train_samples": train_size,
                "val_samples": val_size,
                "best_f1": best_metrics.overall_f1,
                "best_metrics": {
                    "boundary_f1": best_metrics.boundary_f1,
                    "date_f1": best_metrics.date_f1,
                    "description_f1": best_metrics.description_f1,
                    "amount_f1": best_metrics.amount_f1,
                    "balance_f1": best_metrics.balance_f1,
                    "sign_accuracy": best_metrics.sign_accuracy,
                },
            }, f, indent=2)

        return best_metrics

    def _train_epoch(self, loader: DataLoader, scheduler) -> float:
        """Run one training epoch."""
        self.heads.train()
        # LoRA adapter is always in train mode (it has dropout)
        total_loss = 0.0
        n_batches = 0

        for batch in loader:
            self.optimizer.zero_grad()

            input_ids = batch["input_ids"].to(self.device)
            attention_mask = batch["attention_mask"].to(self.device)
            bbox = batch["bbox"].to(self.device)

            # Forward through encoder WITH LoRA adapter active
            # Note: LoRA layers are trainable, encoder base is frozen
            outputs = self.encoder._model(
                input_ids=input_ids,
                attention_mask=attention_mask,
                bbox=bbox,
            )
            embeddings = outputs.last_hidden_state

            # Compute multi-task loss (same as head trainer)
            loss = self._compute_loss(batch, embeddings, attention_mask)

            loss.backward()
            torch.nn.utils.clip_grad_norm_(
                list(self.adapter_manager.adapters[self.config.bank].parameters()) +
                list(self.heads.parameters()),
                self.config.max_grad_norm,
            )
            self.optimizer.step()
            scheduler.step()

            total_loss += loss.item()
            n_batches += 1

        return total_loss / max(n_batches, 1)

    def _compute_loss(self, batch, embeddings, attention_mask):
        """Compute multi-task loss (reused from head trainer)."""
        loss = torch.tensor(0.0, device=self.device)

        # Boundary
        boundary_logits = self.heads.boundary(embeddings, attention_mask)
        boundary_labels = batch["boundary_labels"].to(self.device)
        loss = loss + 2.0 * self.boundary_loss_fn(boundary_logits.view(-1, 2), boundary_labels.view(-1))

        # Date BIO
        date_logits = self.heads.date(embeddings)
        date_labels = batch["date_bio"].to(self.device)
        loss = loss + self.bio_loss_fn(date_logits.view(-1, 3), date_labels.view(-1))

        # Description BIO
        desc_logits = self.heads.description(embeddings)
        desc_labels = batch["description_bio"].to(self.device)
        loss = loss + self.bio_loss_fn(desc_logits.view(-1, 3), desc_labels.view(-1))

        # Amount BIO
        amount_logits = self.heads.amount.bio_head(embeddings)
        amount_labels = batch["amount_bio"].to(self.device)
        loss = loss + 1.5 * self.bio_loss_fn(amount_logits.view(-1, 3), amount_labels.view(-1))

        # Balance BIO
        balance_logits = self.heads.balance(embeddings)
        balance_labels = batch["balance_bio"].to(self.device)
        loss = loss + 0.8 * self.bio_loss_fn(balance_logits.view(-1, 3), balance_labels.view(-1))

        # Per-transaction: sign + amount regression
        for i in range(embeddings.shape[0]):
            spans = batch["transaction_spans"][i]
            signs = batch["sign_labels"][i]
            amounts = batch["amount_values"][i]

            if not spans:
                continue

            for (start, end), sign, amount_val in zip(spans, signs, amounts):
                if start >= embeddings.shape[1]:
                    continue

                span_emb = embeddings[i, start:end + 1].mean(dim=0, keepdim=True)
                sign_logits = self.heads.sign(span_emb)
                sign_target = torch.tensor([sign], device=self.device, dtype=torch.long)
                loss = loss + self.sign_loss_fn(sign_logits, sign_target) / max(len(spans), 1)

                amount_pred = self.heads.amount.regressor(span_emb)
                amount_target = torch.tensor([[amount_val]], device=self.device, dtype=torch.float)
                loss = loss + 0.5 * self.amount_reg_loss_fn(amount_pred, amount_target) / max(len(spans), 1)

        return loss

    @torch.no_grad()
    def _evaluate(self, loader: DataLoader, epoch: int) -> TrainingMetrics:
        """Evaluate on validation set."""
        self.heads.eval()

        boundary_tp, boundary_fp, boundary_fn = 0, 0, 0
        date_tp, date_fp, date_fn = 0, 0, 0
        amount_tp, amount_fp, amount_fn = 0, 0, 0
        sign_correct, sign_total = 0, 0

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
            boundary_preds = self.heads.boundary(embeddings, attention_mask).argmax(dim=-1)
            boundary_labels = batch["boundary_labels"].to(self.device)
            tp, fp, fn = self._f1_counts(boundary_preds, boundary_labels, 1)
            boundary_tp += tp; boundary_fp += fp; boundary_fn += fn

            # Date BIO
            date_preds = self.heads.date(embeddings).argmax(dim=-1)
            date_labels = batch["date_bio"].to(self.device)
            tp, fp, fn = self._bio_counts(date_preds, date_labels)
            date_tp += tp; date_fp += fp; date_fn += fn

            # Amount BIO
            amount_preds = self.heads.amount.bio_head(embeddings).argmax(dim=-1)
            amount_labels = batch["amount_bio"].to(self.device)
            tp, fp, fn = self._bio_counts(amount_preds, amount_labels)
            amount_tp += tp; amount_fp += fp; amount_fn += fn

            # Sign accuracy
            for i in range(embeddings.shape[0]):
                spans = batch["transaction_spans"][i]
                signs = batch["sign_labels"][i]
                for (start, end), sign in zip(spans, signs):
                    if start >= embeddings.shape[1]:
                        continue
                    span_emb = embeddings[i, start:end + 1].mean(dim=0, keepdim=True)
                    pred = self.heads.sign(span_emb).argmax(dim=-1).item()
                    if pred == sign:
                        sign_correct += 1
                    sign_total += 1

        def f1(tp, fp, fn):
            p = tp / max(tp + fp, 1)
            r = tp / max(tp + fn, 1)
            return 2 * p * r / max(p + r, 1e-8)

        metrics = TrainingMetrics(
            epoch=epoch,
            boundary_f1=f1(boundary_tp, boundary_fp, boundary_fn),
            date_f1=f1(date_tp, date_fp, date_fn),
            amount_f1=f1(amount_tp, amount_fp, amount_fn),
            sign_accuracy=sign_correct / max(sign_total, 1),
        )
        metrics.overall_f1 = (
            metrics.boundary_f1 * 0.30 +
            metrics.date_f1 * 0.25 +
            metrics.amount_f1 * 0.30 +
            metrics.sign_accuracy * 0.15
        )
        return metrics

    def _f1_counts(self, preds, labels, pos_label):
        mask = labels != -100
        p, l = preds[mask], labels[mask]
        tp = ((p == pos_label) & (l == pos_label)).sum().item()
        fp = ((p == pos_label) & (l != pos_label)).sum().item()
        fn = ((p != pos_label) & (l == pos_label)).sum().item()
        return tp, fp, fn

    def _bio_counts(self, preds, labels):
        mask = labels != -100
        p, l = preds[mask], labels[mask]
        pp, lp = p < 2, l < 2  # B=0, I=1 are positive
        tp = (pp & lp).sum().item()
        fp = (pp & ~lp).sum().item()
        fn = (~pp & lp).sum().item()
        return tp, fp, fn

    def _save_checkpoint(self, output_dir: Path, metrics: TrainingMetrics):
        """Save adapter weights and optionally fine-tuned heads."""
        # Save LoRA adapter
        adapter_path = output_dir / f"{self.config.bank}_adapter.pt"
        self.adapter_manager.save_adapter(self.config.bank, str(adapter_path))

        # Save fine-tuned heads (if joint training)
        if self.config.train_heads_jointly:
            heads_path = output_dir / f"{self.config.bank}_heads.pt"
            torch.save(self.heads.state_dict(), heads_path)

        # Save metrics
        metrics_path = output_dir / f"{self.config.bank}_metrics.json"
        with open(metrics_path, "w") as f:
            json.dump({
                "overall_f1": metrics.overall_f1,
                "boundary_f1": metrics.boundary_f1,
                "date_f1": metrics.date_f1,
                "amount_f1": metrics.amount_f1,
                "sign_accuracy": metrics.sign_accuracy,
            }, f, indent=2)

    def _collate_fn(self, batch):
        """Custom collate (same as head trainer)."""
        result = {}
        tensor_keys = [
            "input_ids", "attention_mask", "bbox",
            "boundary_labels", "date_bio", "description_bio",
            "amount_bio", "balance_bio",
        ]
        for key in tensor_keys:
            if key in batch[0] and isinstance(batch[0][key], torch.Tensor):
                result[key] = torch.stack([b[key] for b in batch])

        list_keys = ["sign_labels", "amount_values", "transaction_spans", "bank"]
        for key in list_keys:
            if key in batch[0]:
                result[key] = [b[key] for b in batch]

        return result


def main():
    parser = argparse.ArgumentParser(description="Train bank-specific LoRA adapter")
    parser.add_argument("--data-dir", required=True, help="Labeled data directory")
    parser.add_argument("--output-dir", default="checkpoints/lora", help="Output directory")
    parser.add_argument("--heads-path", required=True, help="Pre-trained extraction heads checkpoint")
    parser.add_argument("--bank", required=True, choices=[b.value for b in BankFormat if b != BankFormat.UNKNOWN],
                        help="Target bank")
    parser.add_argument("--rank", type=int, default=8, help="LoRA rank")
    parser.add_argument("--alpha", type=float, default=16.0, help="LoRA alpha")
    parser.add_argument("--lr", type=float, default=2e-5, help="Learning rate")
    parser.add_argument("--epochs", type=int, default=15, help="Number of epochs")
    parser.add_argument("--batch-size", type=int, default=4, help="Batch size")
    parser.add_argument("--device", default="cuda", help="Device")

    args = parser.parse_args()

    config = LoRATrainingConfig(
        data_dir=args.data_dir,
        output_dir=args.output_dir,
        heads_path=args.heads_path,
        bank=args.bank,
        lora_rank=args.rank,
        lora_alpha=args.alpha,
        learning_rate=args.lr,
        num_epochs=args.epochs,
        batch_size=args.batch_size,
        device=args.device,
    )

    trainer = LoRATrainer(config)
    metrics = trainer.train()

    print(f"\n=== Training Complete ===")
    print(f"Bank: {args.bank}")
    print(f"Best F1: {metrics.overall_f1:.3f}")
    print(f"Boundary F1: {metrics.boundary_f1:.3f}")
    print(f"Date F1: {metrics.date_f1:.3f}")
    print(f"Amount F1: {metrics.amount_f1:.3f}")
    print(f"Sign Accuracy: {metrics.sign_accuracy:.3f}")


if __name__ == "__main__":
    main()
