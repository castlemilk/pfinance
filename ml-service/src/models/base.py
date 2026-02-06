"""Base class for OCR models."""

from abc import ABC, abstractmethod
from typing import Any

from PIL import Image

from ..schemas.extraction import ExtractedTransaction, DocumentType


class BaseOCRModel(ABC):
    """Abstract base class for OCR/VLM models."""

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Return the model name."""
        pass

    @property
    @abstractmethod
    def is_loaded(self) -> bool:
        """Return whether the model is loaded."""
        pass

    @abstractmethod
    async def load(self) -> None:
        """Load the model into memory."""
        pass

    @abstractmethod
    async def extract_from_image(
        self,
        image: Image.Image,
        document_type: DocumentType,
    ) -> tuple[list[ExtractedTransaction], float]:
        """
        Extract transactions from an image.

        Args:
            image: PIL Image to process
            document_type: Type of document (receipt, bank_statement, etc.)

        Returns:
            Tuple of (list of extracted transactions, overall confidence)
        """
        pass

    @abstractmethod
    async def extract_from_pdf(
        self,
        pdf_bytes: bytes,
        document_type: DocumentType,
    ) -> tuple[list[ExtractedTransaction], float, int]:
        """
        Extract transactions from a PDF.

        Args:
            pdf_bytes: Raw PDF file bytes
            document_type: Type of document

        Returns:
            Tuple of (list of extracted transactions, overall confidence, page count)
        """
        pass
