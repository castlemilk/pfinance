"""Extraction prompts for receipt images."""


def get_receipt_extraction_prompt() -> str:
    """Get the extraction prompt for receipt images."""
    return """Analyze this receipt and extract:
1. Merchant name
2. Date (YYYY-MM-DD format)
3. Total amount

Return ONLY valid JSON:
{"merchant": "Name", "date": "YYYY-MM-DD", "total": 0.00, "confidence": 0.95}

Return ONLY the JSON object, no other text."""
