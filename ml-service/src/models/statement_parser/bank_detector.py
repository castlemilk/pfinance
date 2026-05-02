"""Bank format detection for Australian bank statements.

Detects the bank format from PDF text content using regex patterns on
known identifiers (ABN numbers, bank names, headers). This determines
which LoRA adapter to apply (future) and format-specific post-processing.
"""

import re
from dataclasses import dataclass
from enum import Enum
from typing import Optional


class BankFormat(str, Enum):
    """Supported Australian bank statement formats."""

    CBA = "cba"  # Commonwealth Bank
    WESTPAC = "westpac"
    NAB = "nab"  # National Australia Bank
    ANZ = "anz"
    ING = "ing"
    MACQUARIE = "macquarie"
    UP_BANK = "up_bank"
    UNKNOWN = "unknown"


@dataclass
class BankDetectionResult:
    """Result of bank format detection."""

    bank: BankFormat
    confidence: float
    matched_pattern: str


# ABN (Australian Business Number) lookup
_BANK_ABNS = {
    "48 123 123 124": BankFormat.CBA,
    "48123123124": BankFormat.CBA,
    "33 007 457 141": BankFormat.WESTPAC,
    "33007457141": BankFormat.WESTPAC,
    "12 004 044 937": BankFormat.NAB,
    "12004044937": BankFormat.NAB,
    "11 005 357 522": BankFormat.ANZ,
    "11005357522": BankFormat.ANZ,
    "49 087 650 585": BankFormat.ING,
    "49087650585": BankFormat.ING,
    "46 008 583 542": BankFormat.MACQUARIE,
    "46008583542": BankFormat.MACQUARIE,
}

# Text patterns per bank
_BANK_PATTERNS: list[tuple[re.Pattern, BankFormat, str]] = [
    # CBA patterns
    (re.compile(r"Commonwealth\s+Bank", re.IGNORECASE), BankFormat.CBA, "name:Commonwealth Bank"),
    (re.compile(r"CommBank", re.IGNORECASE), BankFormat.CBA, "name:CommBank"),
    (re.compile(r"NetBank", re.IGNORECASE), BankFormat.CBA, "name:NetBank"),
    (re.compile(r"CBA\s+Transaction", re.IGNORECASE), BankFormat.CBA, "header:CBA Transaction"),
    # Westpac patterns
    (re.compile(r"Westpac\s+Banking", re.IGNORECASE), BankFormat.WESTPAC, "name:Westpac Banking"),
    (re.compile(r"Westpac\b", re.IGNORECASE), BankFormat.WESTPAC, "name:Westpac"),
    (re.compile(r"St\.?\s*George", re.IGNORECASE), BankFormat.WESTPAC, "name:St George (Westpac group)"),
    # NAB patterns
    (re.compile(r"National\s+Australia\s+Bank", re.IGNORECASE), BankFormat.NAB, "name:National Australia Bank"),
    (re.compile(r"\bNAB\b"), BankFormat.NAB, "name:NAB"),
    # ANZ patterns
    (re.compile(r"Australia\s+and\s+New\s+Zealand\s+Banking", re.IGNORECASE), BankFormat.ANZ, "name:ANZ full"),
    (re.compile(r"\bANZ\b"), BankFormat.ANZ, "name:ANZ"),
    # ING patterns
    (re.compile(r"ING\s+Direct", re.IGNORECASE), BankFormat.ING, "name:ING Direct"),
    (re.compile(r"ING\s+Australia", re.IGNORECASE), BankFormat.ING, "name:ING Australia"),
    # Macquarie patterns
    (re.compile(r"Macquarie\s+Bank", re.IGNORECASE), BankFormat.MACQUARIE, "name:Macquarie Bank"),
    # Up Bank patterns
    (re.compile(r"Up\s+Money", re.IGNORECASE), BankFormat.UP_BANK, "name:Up Money"),
    (re.compile(r"Up\s+Bank", re.IGNORECASE), BankFormat.UP_BANK, "name:Up Bank"),
]


class BankDetector:
    """Detects bank format from PDF text content."""

    def detect(self, text: str, bank_hint: Optional[str] = None) -> BankDetectionResult:
        """Detect the bank format from page text.

        Args:
            text: Raw text from the first page of the PDF.
            bank_hint: Optional explicit bank hint from the caller.

        Returns:
            BankDetectionResult with bank format, confidence, and matched pattern.
        """
        # If a hint is provided and valid, use it with high confidence
        if bank_hint:
            hint_lower = bank_hint.lower().strip()
            for fmt in BankFormat:
                if fmt.value == hint_lower or fmt.name.lower() == hint_lower:
                    return BankDetectionResult(
                        bank=fmt,
                        confidence=1.0,
                        matched_pattern=f"hint:{bank_hint}",
                    )

        # Try ABN matching first (highest confidence)
        for abn, bank in _BANK_ABNS.items():
            if abn in text:
                return BankDetectionResult(
                    bank=bank,
                    confidence=0.99,
                    matched_pattern=f"abn:{abn}",
                )

        # Try text patterns
        for pattern, bank, desc in _BANK_PATTERNS:
            if pattern.search(text):
                return BankDetectionResult(
                    bank=bank,
                    confidence=0.90,
                    matched_pattern=desc,
                )

        return BankDetectionResult(
            bank=BankFormat.UNKNOWN,
            confidence=0.0,
            matched_pattern="none",
        )

    def detect_from_pages(
        self,
        page_texts: list[str],
        bank_hint: Optional[str] = None,
    ) -> BankDetectionResult:
        """Detect bank from multiple page texts.

        Checks the first page primarily, falls back to later pages.
        """
        if bank_hint:
            return self.detect("", bank_hint)

        for text in page_texts[:3]:  # Only check first 3 pages
            result = self.detect(text)
            if result.bank != BankFormat.UNKNOWN:
                return result

        return BankDetectionResult(
            bank=BankFormat.UNKNOWN,
            confidence=0.0,
            matched_pattern="none",
        )
