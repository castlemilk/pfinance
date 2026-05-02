"""Dataset and data loader for training extraction heads.

Converts PDF pages + silver/gold labels into token-level BIO tags
for each extraction head. Labels come from Gemini extractions (silver)
or user corrections (gold).

Label format (JSON per page):
{
    "bank": "cba",
    "transactions": [
        {
            "date": "15/01/2025",
            "description": "WOOLWORTHS 1234 MELBOURNE",
            "amount": 52.30,
            "is_debit": true,
            "balance": 1234.56
        }
    ],
    "opening_balance": 1286.86,
    "closing_balance": 1234.56,
    "source": "gemini",
    "confidence": 0.92
}
"""

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import torch
from torch.utils.data import Dataset

from .pdf_processor import PDFProcessor, PDFPage


@dataclass
class TokenLabels:
    """Per-token labels for all extraction heads on a single page."""

    # Transaction boundary: 1 = transaction token, 0 = non-transaction
    boundary_labels: list[int] = field(default_factory=list)
    # BIO tags: 0=B, 1=I, 2=O for date, description, amount, balance fields
    date_bio: list[int] = field(default_factory=list)
    description_bio: list[int] = field(default_factory=list)
    amount_bio: list[int] = field(default_factory=list)
    balance_bio: list[int] = field(default_factory=list)
    # Sign per transaction span: 0=debit, 1=credit
    sign_labels: list[int] = field(default_factory=list)
    # Amount float values per transaction (for regression head)
    amount_values: list[float] = field(default_factory=list)
    # Transaction span boundaries (start_word_idx, end_word_idx)
    transaction_spans: list[tuple[int, int]] = field(default_factory=list)


@dataclass
class PageSample:
    """A single training sample: one PDF page with labels."""

    pdf_path: str
    page_number: int
    bank: str
    token_texts: list[str]
    token_boxes: list[list[int]]
    labels: TokenLabels
    source: str = "gemini"  # "gemini" or "gold"
    source_confidence: float = 0.0


class StatementDataset(Dataset):
    """PyTorch dataset for training extraction heads on labeled bank statements.

    Directory structure:
        data_dir/
            cba/
                statement_001.pdf
                statement_001_page0.json   # labels per page
                statement_001_page1.json
            westpac/
                ...
    """

    def __init__(
        self,
        data_dir: str,
        encoder_tokenizer=None,
        max_seq_length: int = 512,
        min_confidence: float = 0.7,
    ):
        self.data_dir = Path(data_dir)
        self.encoder_tokenizer = encoder_tokenizer
        self.max_seq_length = max_seq_length
        self.min_confidence = min_confidence
        self.pdf_processor = PDFProcessor()

        self.samples: list[PageSample] = []
        self._load_samples()

    def _load_samples(self) -> None:
        """Scan data directory and build sample list."""
        for bank_dir in sorted(self.data_dir.iterdir()):
            if not bank_dir.is_dir():
                continue

            bank = bank_dir.name
            for label_file in sorted(bank_dir.glob("*_page*.json")):
                # Extract PDF path and page number from label filename
                # Format: statement_001_page0.json
                stem = label_file.stem
                page_match = re.search(r"_page(\d+)$", stem)
                if not page_match:
                    continue

                page_num = int(page_match.group(1))
                pdf_stem = stem[: page_match.start()]
                pdf_path = bank_dir / f"{pdf_stem}.pdf"

                if not pdf_path.exists():
                    continue

                # Load and validate labels
                with open(label_file) as f:
                    label_data = json.load(f)

                confidence = label_data.get("confidence", 0.0)
                if confidence < self.min_confidence:
                    continue

                # Extract PDF page tokens
                pdf_bytes = pdf_path.read_bytes()
                pages = self.pdf_processor.extract_pages(
                    pdf_bytes, max_pages=page_num + 1
                )

                if page_num >= len(pages):
                    continue

                page = pages[page_num]
                if not page.tokens:
                    continue

                # Generate token-level labels
                labels = self._generate_token_labels(
                    page, label_data.get("transactions", [])
                )

                sample = PageSample(
                    pdf_path=str(pdf_path),
                    page_number=page_num,
                    bank=bank,
                    token_texts=page.token_texts,
                    token_boxes=page.token_boxes,
                    labels=labels,
                    source=label_data.get("source", "gemini"),
                    source_confidence=confidence,
                )
                self.samples.append(sample)

    def _generate_token_labels(
        self,
        page: PDFPage,
        transactions: list[dict],
    ) -> TokenLabels:
        """Generate per-token BIO labels by aligning transactions to page tokens.

        Uses fuzzy text matching to align labeled transaction fields
        with the actual tokens extracted from the PDF.
        """
        n_tokens = len(page.tokens)
        labels = TokenLabels(
            boundary_labels=[0] * n_tokens,
            date_bio=[2] * n_tokens,  # default O
            description_bio=[2] * n_tokens,
            amount_bio=[2] * n_tokens,
            balance_bio=[2] * n_tokens,
            sign_labels=[],
            amount_values=[],
            transaction_spans=[],
        )

        token_texts_lower = [t.text.lower() for t in page.tokens]

        for txn in transactions:
            # Find transaction boundary by matching date + description + amount
            span = self._find_transaction_span(page, txn)
            if span is None:
                continue

            start_idx, end_idx = span
            labels.transaction_spans.append((start_idx, end_idx))
            labels.sign_labels.append(0 if txn.get("is_debit", True) else 1)
            labels.amount_values.append(txn.get("amount", 0.0))

            # Mark boundary labels
            for i in range(start_idx, end_idx + 1):
                if i < n_tokens:
                    labels.boundary_labels[i] = 1

            # Tag date tokens
            date_str = txn.get("date", "")
            if date_str:
                self._tag_field_bio(
                    page, labels.date_bio, date_str, start_idx, end_idx
                )

            # Tag description tokens
            desc = txn.get("description", "")
            if desc:
                self._tag_field_bio(
                    page, labels.description_bio, desc, start_idx, end_idx
                )

            # Tag amount tokens
            amount = txn.get("amount", 0.0)
            if amount > 0:
                amount_str = f"{amount:.2f}"
                self._tag_field_bio(
                    page, labels.amount_bio, amount_str, start_idx, end_idx
                )

            # Tag balance tokens
            balance = txn.get("balance")
            if balance is not None:
                balance_str = f"{balance:.2f}"
                self._tag_field_bio(
                    page, labels.balance_bio, balance_str, start_idx, end_idx
                )

        return labels

    def _find_transaction_span(
        self, page: PDFPage, txn: dict
    ) -> Optional[tuple[int, int]]:
        """Find the token span corresponding to a transaction.

        Matches by looking for the date and amount tokens within the same
        horizontal band (similar y-coordinates).
        """
        date_str = txn.get("date", "")
        amount = txn.get("amount", 0.0)
        amount_str = f"{amount:.2f}"

        # Find candidate date token positions
        date_positions = self._find_text_positions(page, date_str)
        # Find candidate amount token positions
        amount_positions = self._find_text_positions(page, amount_str)

        if not date_positions and not amount_positions:
            return None

        # If we have both, find pairs on the same line (similar y-coordinate)
        if date_positions and amount_positions:
            for d_start, d_end in date_positions:
                d_y = page.tokens[d_start].y0
                for a_start, a_end in amount_positions:
                    a_y = page.tokens[a_start].y0
                    # Same horizontal band (within 30 normalized units)
                    if abs(d_y - a_y) < 30:
                        span_start = min(d_start, a_start)
                        span_end = max(d_end, a_end)
                        # Expand to include description tokens between date and amount
                        return span_start, span_end

        # Fallback: use whichever we found
        if date_positions:
            start, end = date_positions[0]
            # Expand rightward to capture the full line
            while end + 1 < len(page.tokens):
                next_y = page.tokens[end + 1].y0
                curr_y = page.tokens[start].y0
                if abs(next_y - curr_y) < 30:
                    end += 1
                else:
                    break
            return start, end

        if amount_positions:
            start, end = amount_positions[0]
            # Expand leftward to capture the full line
            while start > 0:
                prev_y = page.tokens[start - 1].y0
                curr_y = page.tokens[end].y0
                if abs(prev_y - curr_y) < 30:
                    start -= 1
                else:
                    break
            return start, end

        return None

    def _find_text_positions(
        self, page: PDFPage, target: str
    ) -> list[tuple[int, int]]:
        """Find all positions where target text appears in page tokens.

        Handles multi-token targets (e.g., "15/01/2025" might be one or
        multiple tokens depending on PDF extraction).
        """
        if not target:
            return []

        positions = []
        target_clean = target.replace("$", "").replace(",", "").strip().lower()
        target_parts = target_clean.split()

        if not target_parts:
            return []

        # Single-token match
        if len(target_parts) == 1:
            for i, token in enumerate(page.tokens):
                token_clean = token.text.replace("$", "").replace(",", "").strip().lower()
                if token_clean == target_parts[0]:
                    positions.append((i, i))
                # Partial match for amounts like "52.30" in "$52.30"
                elif target_parts[0] in token_clean:
                    positions.append((i, i))
        else:
            # Multi-token sequence match
            for i in range(len(page.tokens) - len(target_parts) + 1):
                match = True
                for j, part in enumerate(target_parts):
                    token_clean = (
                        page.tokens[i + j]
                        .text.replace("$", "")
                        .replace(",", "")
                        .strip()
                        .lower()
                    )
                    if part not in token_clean and token_clean not in part:
                        match = False
                        break
                if match:
                    positions.append((i, i + len(target_parts) - 1))

        return positions

    def _tag_field_bio(
        self,
        page: PDFPage,
        bio_labels: list[int],
        target: str,
        span_start: int,
        span_end: int,
    ) -> None:
        """Tag tokens within a transaction span with BIO labels for a field."""
        positions = self._find_text_positions(page, target)

        for pos_start, pos_end in positions:
            # Only tag if within the transaction span
            if pos_start >= span_start and pos_end <= span_end:
                for i in range(pos_start, pos_end + 1):
                    if i < len(bio_labels):
                        bio_labels[i] = 0 if i == pos_start else 1  # B=0, I=1
                break  # Use first match within span

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> dict:
        """Return a training sample as tensors.

        Returns dict with:
            - input_ids, attention_mask, bbox: for LayoutLMv3
            - boundary_labels: (seq_len,) 0/1
            - date_bio, description_bio, amount_bio, balance_bio: (seq_len,) BIO tags
            - sign_labels: list of per-transaction sign labels
            - amount_values: list of per-transaction amount floats
            - transaction_spans: list of (start, end) tuples
            - bank: str
        """
        sample = self.samples[idx]

        # Tokenize with LayoutLMv3 tokenizer
        if self.encoder_tokenizer is not None:
            encoding = self.encoder_tokenizer(
                sample.token_texts,
                boxes=sample.token_boxes,
                padding="max_length",
                truncation=True,
                max_length=self.max_seq_length,
                return_tensors="pt",
                is_split_into_words=True,
            )

            word_ids = encoding.word_ids(batch_index=0)

            # Map word-level labels to subtoken level
            boundary_labels = self._map_labels_to_subtokens(
                sample.labels.boundary_labels, word_ids
            )
            date_bio = self._map_labels_to_subtokens(
                sample.labels.date_bio, word_ids, default=2
            )
            desc_bio = self._map_labels_to_subtokens(
                sample.labels.description_bio, word_ids, default=2
            )
            amount_bio = self._map_labels_to_subtokens(
                sample.labels.amount_bio, word_ids, default=2
            )
            balance_bio = self._map_labels_to_subtokens(
                sample.labels.balance_bio, word_ids, default=2
            )

            return {
                "input_ids": encoding["input_ids"].squeeze(0),
                "attention_mask": encoding["attention_mask"].squeeze(0),
                "bbox": encoding["bbox"].squeeze(0),
                "boundary_labels": torch.tensor(boundary_labels, dtype=torch.long),
                "date_bio": torch.tensor(date_bio, dtype=torch.long),
                "description_bio": torch.tensor(desc_bio, dtype=torch.long),
                "amount_bio": torch.tensor(amount_bio, dtype=torch.long),
                "balance_bio": torch.tensor(balance_bio, dtype=torch.long),
                "sign_labels": sample.labels.sign_labels,
                "amount_values": sample.labels.amount_values,
                "transaction_spans": sample.labels.transaction_spans,
                "bank": sample.bank,
            }
        else:
            # Return raw labels without tokenization (for testing)
            return {
                "token_texts": sample.token_texts,
                "token_boxes": sample.token_boxes,
                "boundary_labels": sample.labels.boundary_labels,
                "date_bio": sample.labels.date_bio,
                "description_bio": sample.labels.description_bio,
                "amount_bio": sample.labels.amount_bio,
                "balance_bio": sample.labels.balance_bio,
                "sign_labels": sample.labels.sign_labels,
                "amount_values": sample.labels.amount_values,
                "transaction_spans": sample.labels.transaction_spans,
                "bank": sample.bank,
            }

    def _map_labels_to_subtokens(
        self,
        word_labels: list[int],
        word_ids: list[Optional[int]],
        default: int = 0,
    ) -> list[int]:
        """Map word-level labels to subtoken-level labels.

        Special tokens (None word_id) get -100 (ignored in loss).
        First subtoken of a word gets the word's label.
        Subsequent subtokens of the same word get the word's label (for BIO: I tag if B).
        """
        subtoken_labels = []
        prev_word_id = None

        for word_id in word_ids:
            if word_id is None:
                subtoken_labels.append(-100)  # ignore in loss
            elif word_id < len(word_labels):
                label = word_labels[word_id]
                if word_id == prev_word_id:
                    # Continuation subtoken: keep same label (or I if B)
                    if label == 0:  # B tag → I for continuation
                        subtoken_labels.append(1)
                    else:
                        subtoken_labels.append(label)
                else:
                    subtoken_labels.append(label)
            else:
                subtoken_labels.append(-100)

            prev_word_id = word_id

        return subtoken_labels

    def get_bank_distribution(self) -> dict[str, int]:
        """Return the count of samples per bank."""
        dist: dict[str, int] = {}
        for s in self.samples:
            dist[s.bank] = dist.get(s.bank, 0) + 1
        return dist

    def get_source_distribution(self) -> dict[str, int]:
        """Return the count of samples per source (gemini/gold)."""
        dist: dict[str, int] = {}
        for s in self.samples:
            dist[s.source] = dist.get(s.source, 0) + 1
        return dist
