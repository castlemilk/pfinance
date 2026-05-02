"""LoRA (Low-Rank Adaptation) adapters for bank-specific fine-tuning.

Each Australian bank has distinct statement formats (column layout, date format,
amount positioning). LoRA adapters (rank 8, alpha 16) are applied to the frozen
LayoutLMv3 encoder's attention layers, with one adapter per bank.

Adapter size: ~2MB per bank. All adapters can be loaded simultaneously.

Usage:
    adapter_manager = LoRAAdapterManager(encoder)
    adapter_manager.load_adapter("cba", "checkpoints/lora/cba_adapter.pt")
    adapter_manager.activate("cba")
    # Now encoder produces CBA-specialized embeddings
"""

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import torch
import torch.nn as nn
import torch.nn.functional as F

from .bank_detector import BankFormat


@dataclass
class LoRAConfig:
    """Configuration for LoRA adapters."""

    rank: int = 8
    alpha: float = 16.0
    dropout: float = 0.05
    target_modules: tuple = ("query", "key", "value")  # attention layers


class LoRALinear(nn.Module):
    """LoRA-augmented linear layer.

    Adds low-rank matrices A (down-projection) and B (up-projection) to a
    frozen linear layer: output = Wx + (alpha/rank) * BAx

    Parameters added per layer: rank * (in_features + out_features)
    For LayoutLMv3 attention (768 → 768, rank 8): 8 * 1536 = 12,288 params
    """

    def __init__(
        self,
        original: nn.Linear,
        rank: int = 8,
        alpha: float = 16.0,
        dropout: float = 0.05,
    ):
        super().__init__()
        self.original = original
        self.rank = rank
        self.alpha = alpha
        self.scaling = alpha / rank

        in_features = original.in_features
        out_features = original.out_features

        # LoRA matrices
        self.lora_A = nn.Linear(in_features, rank, bias=False)
        self.lora_B = nn.Linear(rank, out_features, bias=False)
        self.lora_dropout = nn.Dropout(dropout) if dropout > 0 else nn.Identity()

        # Initialize: A with Kaiming, B with zeros (so LoRA starts as identity)
        nn.init.kaiming_uniform_(self.lora_A.weight, a=5**0.5)
        nn.init.zeros_(self.lora_B.weight)

        # Freeze original weights
        self.original.weight.requires_grad = False
        if self.original.bias is not None:
            self.original.bias.requires_grad = False

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # Original frozen forward
        result = self.original(x)
        # LoRA delta
        lora_out = self.lora_B(self.lora_A(self.lora_dropout(x)))
        return result + self.scaling * lora_out

    def merge_weights(self) -> None:
        """Merge LoRA weights into the original layer for inference speed."""
        with torch.no_grad():
            delta = self.scaling * (self.lora_B.weight @ self.lora_A.weight)
            self.original.weight.add_(delta)

    def unmerge_weights(self, delta: torch.Tensor) -> None:
        """Unmerge previously merged weights."""
        with torch.no_grad():
            self.original.weight.sub_(delta)

    @property
    def lora_param_count(self) -> int:
        return self.lora_A.weight.numel() + self.lora_B.weight.numel()


class LoRAAdapter(nn.Module):
    """A complete LoRA adapter for a specific bank format.

    Wraps all LoRA layers applied to a LayoutLMv3 encoder's attention modules.
    """

    def __init__(self, bank: BankFormat, config: LoRAConfig):
        super().__init__()
        self.bank = bank
        self.config = config
        self.lora_layers: nn.ModuleDict = nn.ModuleDict()

    def add_layer(self, name: str, lora_linear: LoRALinear) -> None:
        """Register a LoRA-wrapped layer."""
        self.lora_layers[name] = lora_linear

    @property
    def param_count(self) -> int:
        """Total trainable LoRA parameters."""
        return sum(
            p.numel() for p in self.parameters() if p.requires_grad
        )

    @property
    def size_bytes(self) -> int:
        """Approximate size in bytes (float32)."""
        return self.param_count * 4


class LoRAAdapterManager:
    """Manages bank-specific LoRA adapters for the LayoutLMv3 encoder.

    Handles adapter creation, loading, switching, and hot-swapping.
    All adapters are kept in memory since they're small (~2MB each).
    """

    def __init__(self, encoder_model: nn.Module, config: Optional[LoRAConfig] = None):
        self.encoder_model = encoder_model
        self.config = config or LoRAConfig()
        self.adapters: dict[str, LoRAAdapter] = {}
        self.active_adapter: Optional[str] = None
        self._original_layers: dict[str, nn.Linear] = {}

    def create_adapter(self, bank: BankFormat) -> LoRAAdapter:
        """Create a new LoRA adapter for a bank format.

        Applies LoRA to all target attention layers in the encoder.
        """
        adapter = LoRAAdapter(bank, self.config)

        layer_count = 0
        for name, module in self.encoder_model.named_modules():
            if isinstance(module, nn.Linear):
                # Check if this is a target attention layer
                if any(target in name for target in self.config.target_modules):
                    layer_key = name.replace(".", "_")
                    lora_linear = LoRALinear(
                        module,
                        rank=self.config.rank,
                        alpha=self.config.alpha,
                        dropout=self.config.dropout,
                    )
                    adapter.add_layer(layer_key, lora_linear)
                    layer_count += 1

        self.adapters[bank.value] = adapter
        return adapter

    def load_adapter(self, bank: str, path: str) -> None:
        """Load a pre-trained adapter from disk."""
        bank_format = BankFormat(bank)

        if bank not in self.adapters:
            self.create_adapter(bank_format)

        state_dict = torch.load(path, map_location="cpu", weights_only=True)
        self.adapters[bank].load_state_dict(state_dict)

    def save_adapter(self, bank: str, path: str) -> None:
        """Save an adapter's weights to disk."""
        if bank not in self.adapters:
            raise ValueError(f"No adapter for bank: {bank}")

        os.makedirs(os.path.dirname(path), exist_ok=True)
        torch.save(self.adapters[bank].state_dict(), path)

    def activate(self, bank: str) -> None:
        """Activate a bank-specific adapter.

        Replaces the encoder's attention layers with LoRA-wrapped versions.
        """
        if bank == self.active_adapter:
            return

        # Deactivate current adapter first
        if self.active_adapter is not None:
            self.deactivate()

        if bank not in self.adapters:
            return  # No adapter for this bank; use base encoder

        adapter = self.adapters[bank]

        # Replace original layers with LoRA-wrapped versions
        for name, module in self.encoder_model.named_modules():
            layer_key = name.replace(".", "_")
            if layer_key in adapter.lora_layers:
                # Store original for later restoration
                self._original_layers[name] = module
                # Replace in the parent module
                parent_name, attr_name = name.rsplit(".", 1) if "." in name else ("", name)
                parent = self.encoder_model
                if parent_name:
                    for part in parent_name.split("."):
                        parent = getattr(parent, part)
                setattr(parent, attr_name, adapter.lora_layers[layer_key])

        self.active_adapter = bank

    def deactivate(self) -> None:
        """Deactivate the current adapter, restoring original layers."""
        if self.active_adapter is None:
            return

        # Restore original layers
        for name, original_module in self._original_layers.items():
            parent_name, attr_name = name.rsplit(".", 1) if "." in name else ("", name)
            parent = self.encoder_model
            if parent_name:
                for part in parent_name.split("."):
                    parent = getattr(parent, part)
            setattr(parent, attr_name, original_module)

        self._original_layers.clear()
        self.active_adapter = None

    def load_all_from_directory(self, adapter_dir: str) -> int:
        """Load all adapter weights from a directory.

        Expected structure:
            adapter_dir/
                cba_adapter.pt
                westpac_adapter.pt
                nab_adapter.pt
                ...

        Returns number of adapters loaded.
        """
        adapter_path = Path(adapter_dir)
        if not adapter_path.exists():
            return 0

        loaded = 0
        for bank in BankFormat:
            if bank == BankFormat.UNKNOWN:
                continue

            adapter_file = adapter_path / f"{bank.value}_adapter.pt"
            if adapter_file.exists():
                self.load_adapter(bank.value, str(adapter_file))
                loaded += 1

        return loaded

    def get_adapter_info(self) -> dict[str, dict]:
        """Get info about all loaded adapters."""
        info = {}
        for bank, adapter in self.adapters.items():
            info[bank] = {
                "param_count": adapter.param_count,
                "size_mb": adapter.size_bytes / (1024 * 1024),
                "layer_count": len(adapter.lora_layers),
                "active": bank == self.active_adapter,
            }
        return info
