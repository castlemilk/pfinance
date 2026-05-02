"""Task-specific extraction heads for bank statement parsing.

Each head is a lightweight 2-layer MLP that sits on top of the frozen
LayoutLMv3 encoder. Heads are independently trainable.

Architecture per head: encoder_dim (768) → hidden_dim (256) → output_dim
Total additional params per head: ~200K
"""

import re
from dataclasses import dataclass, field
from typing import Optional

import torch
import torch.nn as nn
import torch.nn.functional as F


@dataclass
class ExtractionResult:
    """Result from the full extraction heads pipeline for a single page."""

    transactions: list["TransactionSpan"] = field(default_factory=list)
    overall_confidence: float = 0.0
    opening_balance: Optional[float] = None
    closing_balance: Optional[float] = None


@dataclass
class TransactionSpan:
    """A single extracted transaction with per-field values and confidences."""

    date: str = ""
    description: str = ""
    amount: float = 0.0
    is_debit: bool = True
    balance: Optional[float] = None
    # Per-field confidence scores
    date_confidence: float = 0.0
    description_confidence: float = 0.0
    amount_confidence: float = 0.0
    sign_confidence: float = 0.0
    balance_confidence: float = 0.0
    # Token span indices in the original word list
    start_idx: int = 0
    end_idx: int = 0

    @property
    def min_confidence(self) -> float:
        """Minimum confidence across critical fields (date, amount, sign)."""
        return min(self.date_confidence, self.amount_confidence, self.sign_confidence)

    @property
    def avg_confidence(self) -> float:
        """Average confidence across all fields."""
        scores = [
            self.date_confidence,
            self.description_confidence,
            self.amount_confidence,
            self.sign_confidence,
        ]
        return sum(scores) / len(scores)


class TransactionBoundaryHead(nn.Module):
    """Binary token classifier: is this token part of a transaction row?

    Output: per-token probability of being in a transaction span.
    Groups consecutive positive tokens into transaction spans.
    """

    def __init__(self, encoder_dim: int = 768, hidden_dim: int = 256):
        super().__init__()
        self.classifier = nn.Sequential(
            nn.Linear(encoder_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(hidden_dim, 2),  # binary: transaction / not-transaction
        )

    def forward(self, embeddings: torch.Tensor, attention_mask: torch.Tensor) -> torch.Tensor:
        """Return per-token logits for transaction boundary.

        Args:
            embeddings: (batch, seq_len, 768)
            attention_mask: (batch, seq_len)

        Returns:
            Tensor of shape (batch, seq_len, 2) — logits for [not-txn, txn]
        """
        return self.classifier(embeddings)

    def predict_spans(
        self,
        embeddings: torch.Tensor,
        attention_mask: torch.Tensor,
        token_to_word_map: list[int],
        threshold: float = 0.5,
    ) -> list[tuple[int, int, float]]:
        """Predict transaction spans as (start_word_idx, end_word_idx, confidence).

        Groups consecutive transaction-positive tokens and maps back to word indices.
        """
        logits = self.forward(embeddings, attention_mask)
        probs = F.softmax(logits, dim=-1)[0]  # (seq_len, 2)
        txn_probs = probs[:, 1]  # probability of being a transaction token

        # Map subtoken predictions to word-level
        if not token_to_word_map:
            return []

        max_word = max(token_to_word_map) + 1
        word_probs = torch.zeros(max_word, device=embeddings.device)
        word_counts = torch.zeros(max_word, device=embeddings.device)

        # Special tokens offset: first token is [CLS]
        for sub_idx, word_idx in enumerate(token_to_word_map):
            # +1 to skip [CLS] token
            if sub_idx + 1 < len(txn_probs):
                word_probs[word_idx] += txn_probs[sub_idx + 1]
                word_counts[word_idx] += 1

        # Average probabilities per word
        valid = word_counts > 0
        word_probs[valid] /= word_counts[valid]

        # Group consecutive positive words into spans
        spans = []
        in_span = False
        start = 0
        span_probs: list[float] = []

        for i in range(max_word):
            if word_probs[i] >= threshold:
                if not in_span:
                    start = i
                    span_probs = []
                    in_span = True
                span_probs.append(word_probs[i].item())
            else:
                if in_span:
                    avg_conf = sum(span_probs) / len(span_probs)
                    spans.append((start, i - 1, avg_conf))
                    in_span = False

        if in_span:
            avg_conf = sum(span_probs) / len(span_probs)
            spans.append((start, max_word - 1, avg_conf))

        return spans


class BIOSequenceHead(nn.Module):
    """Base BIO sequence labeler for extracting specific fields.

    Tags each token as B (beginning), I (inside), or O (outside) for
    a specific field type. Used by date, description, amount, and balance heads.
    """

    def __init__(self, encoder_dim: int = 768, hidden_dim: int = 256):
        super().__init__()
        self.classifier = nn.Sequential(
            nn.Linear(encoder_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(hidden_dim, 3),  # B, I, O tags
        )

    def forward(self, embeddings: torch.Tensor) -> torch.Tensor:
        """Return per-token BIO logits.

        Args:
            embeddings: (batch, seq_len, 768)

        Returns:
            Tensor of shape (batch, seq_len, 3) — logits for [B, I, O]
        """
        return self.classifier(embeddings)

    def extract_spans(
        self,
        embeddings: torch.Tensor,
        word_texts: list[str],
        token_to_word_map: list[int],
        start_idx: int = 0,
        end_idx: Optional[int] = None,
    ) -> list[tuple[str, float]]:
        """Extract text spans using BIO predictions.

        Returns list of (extracted_text, confidence) tuples.
        """
        logits = self.forward(embeddings)
        probs = F.softmax(logits, dim=-1)[0]  # (seq_len, 3)

        if end_idx is None:
            end_idx = len(word_texts)

        # Map subtokens to words within the span
        spans: list[tuple[str, float]] = []
        current_tokens: list[str] = []
        current_probs: list[float] = []

        for sub_idx, word_idx in enumerate(token_to_word_map):
            if word_idx < start_idx or word_idx > end_idx:
                continue

            token_offset = sub_idx + 1  # skip [CLS]
            if token_offset >= probs.shape[0]:
                break

            tag_probs = probs[token_offset]
            tag = torch.argmax(tag_probs).item()
            tag_conf = tag_probs[tag].item()

            if tag == 0:  # B — begin new span
                if current_tokens:
                    text = " ".join(current_tokens)
                    conf = sum(current_probs) / len(current_probs)
                    spans.append((text, conf))
                current_tokens = [word_texts[word_idx]]
                current_probs = [tag_conf]
            elif tag == 1 and current_tokens:  # I — continue span
                current_tokens.append(word_texts[word_idx])
                current_probs.append(tag_conf)
            else:  # O — outside
                if current_tokens:
                    text = " ".join(current_tokens)
                    conf = sum(current_probs) / len(current_probs)
                    spans.append((text, conf))
                    current_tokens = []
                    current_probs = []

        if current_tokens:
            text = " ".join(current_tokens)
            conf = sum(current_probs) / len(current_probs)
            spans.append((text, conf))

        return spans


class DateExtractorHead(BIOSequenceHead):
    """Extracts date fields from transaction spans using BIO tagging."""

    # Date patterns for post-processing
    DATE_PATTERNS = [
        r"\d{1,2}/\d{1,2}/\d{2,4}",  # DD/MM/YYYY or DD/MM/YY
        r"\d{1,2}\s+\w{3}\s+\d{2,4}",  # DD Mon YYYY
        r"\d{1,2}\s+\w{3}",  # DD Mon (no year)
        r"\d{1,2}-\w{3}-\d{2,4}",  # DD-Mon-YYYY
        r"\d{4}-\d{2}-\d{2}",  # YYYY-MM-DD
    ]

    def extract_date(
        self,
        embeddings: torch.Tensor,
        word_texts: list[str],
        token_to_word_map: list[int],
        start_idx: int = 0,
        end_idx: Optional[int] = None,
    ) -> tuple[str, float]:
        """Extract the best date from a transaction span.

        Returns (date_string, confidence).
        """
        spans = self.extract_spans(
            embeddings, word_texts, token_to_word_map, start_idx, end_idx
        )

        if not spans:
            # Fallback: regex scan the word texts in the span range
            if end_idx is None:
                end_idx = len(word_texts)
            text = " ".join(word_texts[start_idx : end_idx + 1])
            for pattern in self.DATE_PATTERNS:
                match = re.search(pattern, text)
                if match:
                    return match.group(), 0.3  # Low confidence for regex fallback
            return "", 0.0

        # Return highest-confidence span
        best = max(spans, key=lambda x: x[1])
        return best[0], best[1]


class DescriptionExtractorHead(BIOSequenceHead):
    """Extracts transaction description/narrative text using BIO tagging."""

    def extract_description(
        self,
        embeddings: torch.Tensor,
        word_texts: list[str],
        token_to_word_map: list[int],
        start_idx: int = 0,
        end_idx: Optional[int] = None,
    ) -> tuple[str, float]:
        """Extract the transaction description.

        Returns (description, confidence).
        """
        spans = self.extract_spans(
            embeddings, word_texts, token_to_word_map, start_idx, end_idx
        )

        if not spans:
            return "", 0.0

        # Concatenate all B/I spans (description can be multi-part)
        texts = [s[0] for s in spans]
        confs = [s[1] for s in spans]
        return " ".join(texts), sum(confs) / len(confs)


class AmountExtractorHead(nn.Module):
    """Extracts monetary amounts using BIO tagging + regression head.

    Two-stage: BIO labels find the amount text span, then a regression
    head converts the token embeddings to a float value.
    """

    AMOUNT_PATTERN = re.compile(r"[\$]?\s*[\d,]+\.?\d*")

    def __init__(self, encoder_dim: int = 768, hidden_dim: int = 256):
        super().__init__()
        # BIO head to locate amount tokens
        self.bio_head = BIOSequenceHead(encoder_dim, hidden_dim)
        # Regression head: pooled span embedding → float amount
        self.regressor = nn.Sequential(
            nn.Linear(encoder_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(hidden_dim, 1),
        )

    def forward(self, embeddings: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """Return BIO logits and regression prediction."""
        bio_logits = self.bio_head(embeddings)
        amount_pred = self.regressor(embeddings.mean(dim=1))  # global pool
        return bio_logits, amount_pred

    def extract_amount(
        self,
        embeddings: torch.Tensor,
        word_texts: list[str],
        token_to_word_map: list[int],
        start_idx: int = 0,
        end_idx: Optional[int] = None,
    ) -> tuple[float, float]:
        """Extract the monetary amount from a transaction span.

        Uses BIO span + regex parsing. Falls back to regression head.

        Returns (amount, confidence).
        """
        spans = self.bio_head.extract_spans(
            embeddings, word_texts, token_to_word_map, start_idx, end_idx
        )

        for text, conf in sorted(spans, key=lambda x: -x[1]):
            parsed = self._parse_amount(text)
            if parsed is not None:
                return parsed, conf

        # Fallback: regex scan
        if end_idx is None:
            end_idx = len(word_texts)
        text = " ".join(word_texts[start_idx : end_idx + 1])
        amounts = self.AMOUNT_PATTERN.findall(text)
        for amt_str in amounts:
            parsed = self._parse_amount(amt_str)
            if parsed is not None and parsed > 0:
                return parsed, 0.3

        return 0.0, 0.0

    @staticmethod
    def _parse_amount(text: str) -> Optional[float]:
        """Parse a monetary amount string to float."""
        cleaned = text.replace("$", "").replace(",", "").replace(" ", "").strip()
        if not cleaned:
            return None
        try:
            val = float(cleaned)
            return abs(val)
        except ValueError:
            return None


class SignClassifierHead(nn.Module):
    """Binary classifier: credit or debit per transaction.

    Uses contextual features like column position and nearby text
    (CR/DR indicators, column headers).
    """

    def __init__(self, encoder_dim: int = 768, hidden_dim: int = 256):
        super().__init__()
        self.classifier = nn.Sequential(
            nn.Linear(encoder_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(hidden_dim, 2),  # [debit, credit]
        )

    def forward(self, embeddings: torch.Tensor) -> torch.Tensor:
        """Return logits for [debit, credit].

        Args:
            embeddings: pooled transaction span embedding (batch, 768)
        """
        return self.classifier(embeddings)

    def predict_sign(
        self,
        embeddings: torch.Tensor,
        word_texts: list[str],
        start_idx: int = 0,
        end_idx: Optional[int] = None,
    ) -> tuple[bool, float]:
        """Predict whether a transaction is debit or credit.

        Returns (is_debit, confidence).
        """
        # Pool the span embeddings
        span_embedding = embeddings[0, start_idx : end_idx or embeddings.shape[1]].mean(dim=0, keepdim=True)
        span_embedding = span_embedding.unsqueeze(0)  # (1, 1, 768) -> need (1, 768)
        span_embedding = span_embedding.squeeze(1)

        logits = self.forward(span_embedding)
        probs = F.softmax(logits, dim=-1)[0]

        is_debit = probs[0] > probs[1]
        confidence = probs[0].item() if is_debit else probs[1].item()

        # Heuristic boost: check for explicit CR/DR markers
        if end_idx is None:
            end_idx = len(word_texts)
        span_text = " ".join(word_texts[start_idx : end_idx + 1]).upper()
        if "CR" in span_text or "CREDIT" in span_text:
            is_debit = False
            confidence = max(confidence, 0.9)
        elif "DR" in span_text or "DEBIT" in span_text:
            is_debit = True
            confidence = max(confidence, 0.9)

        return is_debit, confidence


class BalanceExtractorHead(BIOSequenceHead):
    """Extracts running balance values for validation/reconciliation."""

    BALANCE_PATTERN = re.compile(r"[\$]?\s*[\d,]+\.\d{2}")

    def extract_balance(
        self,
        embeddings: torch.Tensor,
        word_texts: list[str],
        token_to_word_map: list[int],
        start_idx: int = 0,
        end_idx: Optional[int] = None,
    ) -> tuple[Optional[float], float]:
        """Extract the balance value from a transaction span.

        Returns (balance, confidence). Balance may be None if not present.
        """
        spans = self.extract_spans(
            embeddings, word_texts, token_to_word_map, start_idx, end_idx
        )

        for text, conf in sorted(spans, key=lambda x: -x[1]):
            parsed = AmountExtractorHead._parse_amount(text)
            if parsed is not None:
                return parsed, conf

        return None, 0.0


class StatementExtractionHeads(nn.Module):
    """Combined extraction heads for bank statement parsing.

    Wraps all five heads and provides a unified extraction interface.
    """

    def __init__(self, encoder_dim: int = 768, hidden_dim: int = 256):
        super().__init__()
        self.boundary = TransactionBoundaryHead(encoder_dim, hidden_dim)
        self.date = DateExtractorHead(encoder_dim, hidden_dim)
        self.description = DescriptionExtractorHead(encoder_dim, hidden_dim)
        self.amount = AmountExtractorHead(encoder_dim, hidden_dim)
        self.sign = SignClassifierHead(encoder_dim, hidden_dim)
        self.balance = BalanceExtractorHead(encoder_dim, hidden_dim)

    def extract_transactions(
        self,
        embeddings: torch.Tensor,
        attention_mask: torch.Tensor,
        token_to_word_map: list[int],
        word_texts: list[str],
        boundary_threshold: float = 0.5,
    ) -> ExtractionResult:
        """Run all extraction heads on encoder output.

        1. Detect transaction boundaries
        2. For each span, extract date, description, amount, sign, balance

        Returns ExtractionResult with all transactions and confidences.
        """
        # Step 1: Find transaction spans
        spans = self.boundary.predict_spans(
            embeddings, attention_mask, token_to_word_map, boundary_threshold
        )

        transactions = []
        for start_idx, end_idx, boundary_conf in spans:
            # Step 2: Extract fields from each span
            date_str, date_conf = self.date.extract_date(
                embeddings, word_texts, token_to_word_map, start_idx, end_idx
            )
            desc, desc_conf = self.description.extract_description(
                embeddings, word_texts, token_to_word_map, start_idx, end_idx
            )
            amount, amount_conf = self.amount.extract_amount(
                embeddings, word_texts, token_to_word_map, start_idx, end_idx
            )
            is_debit, sign_conf = self.sign.predict_sign(
                embeddings, word_texts, start_idx, end_idx
            )
            balance, balance_conf = self.balance.extract_balance(
                embeddings, word_texts, token_to_word_map, start_idx, end_idx
            )

            txn = TransactionSpan(
                date=date_str,
                description=desc,
                amount=amount,
                is_debit=is_debit,
                balance=balance,
                date_confidence=date_conf,
                description_confidence=desc_conf,
                amount_confidence=amount_conf,
                sign_confidence=sign_conf,
                balance_confidence=balance_conf,
                start_idx=start_idx,
                end_idx=end_idx,
            )
            transactions.append(txn)

        # Calculate overall confidence
        if transactions:
            overall = sum(t.avg_confidence for t in transactions) / len(transactions)
        else:
            overall = 0.0

        return ExtractionResult(
            transactions=transactions,
            overall_confidence=overall,
        )
