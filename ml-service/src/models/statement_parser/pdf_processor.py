"""PDF text and bounding box extraction using PyMuPDF (fitz).

Extracts text tokens with their 2D bounding boxes from digital PDFs,
producing the input format required by LayoutLMv3.
"""

from dataclasses import dataclass, field
from typing import Optional

import fitz  # PyMuPDF


@dataclass
class TokenInfo:
    """A single text token with its bounding box on the page."""

    text: str
    # Bounding box normalized to 0-1000 range (LayoutLMv3 convention)
    x0: int
    y0: int
    x1: int
    y1: int
    # Original pixel coordinates
    raw_x0: float
    raw_y0: float
    raw_x1: float
    raw_y1: float
    line_idx: int = 0
    block_idx: int = 0


@dataclass
class PDFPage:
    """Extracted content from a single PDF page."""

    page_number: int
    tokens: list[TokenInfo] = field(default_factory=list)
    width: float = 0.0
    height: float = 0.0
    raw_text: str = ""
    # Optional rendered image for LayoutLMv3 image features
    image_bytes: Optional[bytes] = None

    @property
    def token_texts(self) -> list[str]:
        return [t.text for t in self.tokens]

    @property
    def token_boxes(self) -> list[list[int]]:
        """Bounding boxes in [x0, y0, x1, y1] format, normalized to 0-1000."""
        return [[t.x0, t.y0, t.x1, t.y1] for t in self.tokens]


class PDFProcessor:
    """Extracts text tokens with bounding boxes from digital PDFs.

    Uses PyMuPDF to get word-level positions, then normalizes coordinates
    to the 0-1000 range expected by LayoutLMv3.
    """

    LAYOUT_NORM = 1000  # LayoutLMv3 normalizes coordinates to 0-1000

    def __init__(self, render_dpi: int = 150):
        self.render_dpi = render_dpi

    def extract_pages(
        self,
        pdf_bytes: bytes,
        render_images: bool = False,
        max_pages: Optional[int] = None,
    ) -> list[PDFPage]:
        """Extract text tokens and bounding boxes from all pages.

        Args:
            pdf_bytes: Raw PDF file content.
            render_images: If True, also render page images for LayoutLMv3 image features.
            max_pages: Maximum number of pages to process.

        Returns:
            List of PDFPage objects with tokens and bounding boxes.
        """
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        pages = []

        page_limit = min(len(doc), max_pages) if max_pages else len(doc)

        for page_idx in range(page_limit):
            page = doc[page_idx]
            pdf_page = self._extract_page(page, page_idx)

            if render_images:
                pdf_page.image_bytes = self._render_page(page)

            pages.append(pdf_page)

        doc.close()
        return pages

    def is_digital_pdf(self, pdf_bytes: bytes) -> bool:
        """Check if a PDF has extractable text (digital) vs. scanned image."""
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        if len(doc) == 0:
            doc.close()
            return False

        # Check first page for text
        page = doc[0]
        text = page.get_text("text").strip()
        doc.close()

        # If there's meaningful text content, it's a digital PDF
        return len(text) > 50

    def _extract_page(self, page: fitz.Page, page_idx: int) -> PDFPage:
        """Extract tokens from a single page."""
        width = page.rect.width
        height = page.rect.height

        # Get word-level blocks: (x0, y0, x1, y1, "word", block_no, line_no, word_no)
        words = page.get_text("words")

        tokens = []
        for word_info in words:
            raw_x0, raw_y0, raw_x1, raw_y1, text, block_no, line_no, _word_no = (
                word_info
            )

            # Skip empty tokens
            text = text.strip()
            if not text:
                continue

            # Normalize to 0-1000 range
            norm_x0 = int((raw_x0 / width) * self.LAYOUT_NORM)
            norm_y0 = int((raw_y0 / height) * self.LAYOUT_NORM)
            norm_x1 = int((raw_x1 / width) * self.LAYOUT_NORM)
            norm_y1 = int((raw_y1 / height) * self.LAYOUT_NORM)

            # Clamp to valid range
            norm_x0 = max(0, min(self.LAYOUT_NORM, norm_x0))
            norm_y0 = max(0, min(self.LAYOUT_NORM, norm_y0))
            norm_x1 = max(0, min(self.LAYOUT_NORM, norm_x1))
            norm_y1 = max(0, min(self.LAYOUT_NORM, norm_y1))

            tokens.append(
                TokenInfo(
                    text=text,
                    x0=norm_x0,
                    y0=norm_y0,
                    x1=norm_x1,
                    y1=norm_y1,
                    raw_x0=raw_x0,
                    raw_y0=raw_y0,
                    raw_x1=raw_x1,
                    raw_y1=raw_y1,
                    line_idx=line_no,
                    block_idx=block_no,
                )
            )

        pdf_page = PDFPage(
            page_number=page_idx,
            tokens=tokens,
            width=width,
            height=height,
            raw_text=page.get_text("text"),
        )

        return pdf_page

    def _render_page(self, page: fitz.Page) -> bytes:
        """Render a page as a PNG image."""
        mat = fitz.Matrix(self.render_dpi / 72, self.render_dpi / 72)
        pix = page.get_pixmap(matrix=mat)
        return pix.tobytes("png")
