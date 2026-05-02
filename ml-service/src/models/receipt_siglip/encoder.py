"""Frozen SigLIP encoder for receipt feature extraction.

Uses google/siglip-so400m-patch14-384 as a frozen image encoder.
Produces 1152-dim patch embeddings + CLS token for downstream task heads.
VRAM usage: ~1.6GB in float16 — fits alongside Qwen2-VL-7B on A10G (24GB).
"""

import logging
from typing import Optional

import torch
import torch.nn as nn
from PIL import Image

logger = logging.getLogger(__name__)

# Model constants
SIGLIP_MODEL_ID = "google/siglip-so400m-patch14-384"
SIGLIP_IMAGE_SIZE = 384
SIGLIP_HIDDEN_DIM = 1152
SIGLIP_NUM_PATCHES = (384 // 14) ** 2  # 729 patches


class SigLIPEncoder(nn.Module):
    """Frozen SigLIP vision encoder for receipt feature extraction.

    Loads the SigLIP vision model and processor, freezes all parameters,
    and extracts patch-level + CLS embeddings from receipt images.
    """

    def __init__(
        self,
        model_id: str = SIGLIP_MODEL_ID,
        device: Optional[str] = None,
        dtype: torch.dtype = torch.float16,
    ):
        super().__init__()
        self.model_id = model_id
        self.dtype = dtype
        self._device = device
        self._model = None
        self._processor = None
        self._loaded = False

    @property
    def device(self) -> torch.device:
        if self._device:
            return torch.device(self._device)
        return torch.device("cuda" if torch.cuda.is_available() else "cpu")

    @property
    def hidden_dim(self) -> int:
        return SIGLIP_HIDDEN_DIM

    @property
    def num_patches(self) -> int:
        return SIGLIP_NUM_PATCHES

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    def load(self) -> None:
        """Load SigLIP model and processor. All parameters are frozen."""
        if self._loaded:
            return

        from transformers import SiglipVisionModel, AutoImageProcessor

        logger.info("Loading SigLIP encoder: %s", self.model_id)

        self._processor = AutoImageProcessor.from_pretrained(self.model_id)
        self._model = SiglipVisionModel.from_pretrained(
            self.model_id,
            torch_dtype=self.dtype,
        ).to(self.device)

        # Freeze all parameters — encoder is not trained
        for param in self._model.parameters():
            param.requires_grad = False
        self._model.eval()

        param_count = sum(p.numel() for p in self._model.parameters())
        vram_mb = param_count * (2 if self.dtype == torch.float16 else 4) / 1e6
        logger.info(
            "SigLIP encoder loaded: %.1fM params, ~%.0fMB VRAM",
            param_count / 1e6,
            vram_mb,
        )
        self._loaded = True

    def preprocess(self, image: Image.Image) -> torch.Tensor:
        """Preprocess a PIL image for SigLIP input.

        Args:
            image: PIL Image (any size, will be resized to 384x384).

        Returns:
            Preprocessed pixel values tensor [1, 3, 384, 384].
        """
        if not self._loaded:
            raise RuntimeError("Encoder not loaded. Call load() first.")

        inputs = self._processor(images=image, return_tensors="pt")
        return inputs["pixel_values"].to(device=self.device, dtype=self.dtype)

    @torch.no_grad()
    def forward(self, pixel_values: torch.Tensor) -> dict[str, torch.Tensor]:
        """Extract features from preprocessed pixel values.

        Args:
            pixel_values: Tensor [B, 3, 384, 384] from preprocess().

        Returns:
            Dict with:
                - "patch_embeddings": [B, num_patches, hidden_dim] patch-level features
                - "pooled": [B, hidden_dim] pooled CLS-like representation
        """
        if not self._loaded:
            raise RuntimeError("Encoder not loaded. Call load() first.")

        outputs = self._model(pixel_values=pixel_values)

        # SigLIP returns last_hidden_state [B, num_patches+1, hidden_dim]
        # and pooler_output [B, hidden_dim]
        hidden_states = outputs.last_hidden_state
        pooled = outputs.pooler_output

        return {
            "patch_embeddings": hidden_states,
            "pooled": pooled,
        }

    def encode_image(self, image: Image.Image) -> dict[str, torch.Tensor]:
        """End-to-end: preprocess + encode a single PIL image.

        Args:
            image: PIL Image (any mode, any size).

        Returns:
            Dict with patch_embeddings and pooled features.
        """
        if image.mode != "RGB":
            image = image.convert("RGB")
        pixel_values = self.preprocess(image)
        return self.forward(pixel_values)
