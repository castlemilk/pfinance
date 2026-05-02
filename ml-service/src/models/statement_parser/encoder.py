"""LayoutLMv3 frozen encoder for bank statement understanding.

Loads microsoft/layoutlmv3-base as a frozen feature extractor. The encoder
jointly processes text tokens and their 2D positions on the page, producing
768-dim embeddings that capture document layout semantics.
"""

from typing import Optional

import torch
import torch.nn as nn
from transformers import LayoutLMv3Model, LayoutLMv3TokenizerFast
from PIL import Image
import io

from .pdf_processor import PDFPage


class LayoutLMv3Encoder(nn.Module):
    """Frozen LayoutLMv3 encoder for document understanding.

    The encoder is loaded once and kept frozen — only the downstream
    extraction heads are trainable.
    """

    MODEL_ID = "microsoft/layoutlmv3-base"
    HIDDEN_SIZE = 768
    MAX_SEQ_LENGTH = 512

    def __init__(self, device: str = "cuda", use_image_features: bool = False):
        super().__init__()
        self.device = device
        self.use_image_features = use_image_features
        self._model: Optional[LayoutLMv3Model] = None
        self._tokenizer: Optional[LayoutLMv3TokenizerFast] = None
        self._loaded = False

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    def load(self) -> None:
        """Load the LayoutLMv3 model and tokenizer."""
        self._tokenizer = LayoutLMv3TokenizerFast.from_pretrained(
            self.MODEL_ID,
            apply_ocr=False,  # We provide our own token positions
        )
        self._model = LayoutLMv3Model.from_pretrained(self.MODEL_ID)
        self._model.to(self.device)
        self._model.eval()

        # Freeze all parameters
        for param in self._model.parameters():
            param.requires_grad = False

        self._loaded = True

    @torch.no_grad()
    def encode_page(self, page: PDFPage) -> dict:
        """Encode a PDF page into token embeddings.

        Args:
            page: PDFPage with extracted tokens and bounding boxes.

        Returns:
            Dict with:
                - embeddings: Tensor of shape (1, seq_len, 768)
                - attention_mask: Tensor of shape (1, seq_len)
                - token_to_word_map: List mapping subtoken indices to original word indices
                - word_texts: Original word texts before tokenization
        """
        if not self._loaded:
            raise RuntimeError("Encoder not loaded. Call load() first.")

        token_texts = page.token_texts
        token_boxes = page.token_boxes

        if not token_texts:
            # Empty page — return zero embeddings
            return {
                "embeddings": torch.zeros(1, 1, self.HIDDEN_SIZE, device=self.device),
                "attention_mask": torch.zeros(1, 1, device=self.device, dtype=torch.long),
                "token_to_word_map": [],
                "word_texts": [],
            }

        # Tokenize with bounding boxes
        encoding = self._tokenizer(
            token_texts,
            boxes=token_boxes,
            padding="max_length",
            truncation=True,
            max_length=self.MAX_SEQ_LENGTH,
            return_tensors="pt",
            return_offsets_mapping=False,
            is_split_into_words=True,
        )

        # Build word-to-subtoken mapping
        word_ids = encoding.word_ids(batch_index=0)
        token_to_word_map = [wid for wid in word_ids if wid is not None]

        # Prepare image input if needed
        pixel_values = None
        if self.use_image_features and page.image_bytes:
            img = Image.open(io.BytesIO(page.image_bytes)).convert("RGB")
            # LayoutLMv3 expects 224x224 image patches
            img = img.resize((224, 224))
            # Simple normalization (proper preprocessing would use LayoutLMv3FeatureExtractor)
            import torchvision.transforms as T
            transform = T.Compose([
                T.ToTensor(),
                T.Normalize(mean=[0.5, 0.5, 0.5], std=[0.5, 0.5, 0.5]),
            ])
            pixel_values = transform(img).unsqueeze(0).to(self.device)

        # Move inputs to device
        input_ids = encoding["input_ids"].to(self.device)
        attention_mask = encoding["attention_mask"].to(self.device)
        bbox = encoding["bbox"].to(self.device)

        # Forward pass
        model_kwargs = {
            "input_ids": input_ids,
            "attention_mask": attention_mask,
            "bbox": bbox,
        }
        if pixel_values is not None:
            model_kwargs["pixel_values"] = pixel_values

        outputs = self._model(**model_kwargs)

        return {
            "embeddings": outputs.last_hidden_state,
            "attention_mask": attention_mask,
            "token_to_word_map": token_to_word_map,
            "word_texts": token_texts,
        }
