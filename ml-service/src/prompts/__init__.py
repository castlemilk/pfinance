# Extraction prompts
from .receipt import get_receipt_extraction_prompt
from .bank_statement import get_bank_statement_extraction_prompt

__all__ = ["get_receipt_extraction_prompt", "get_bank_statement_extraction_prompt"]
