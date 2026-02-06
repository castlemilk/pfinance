"""Extraction prompts for bank statements."""


def get_bank_statement_extraction_prompt() -> str:
    """Get the extraction prompt for bank statement documents."""
    return """You are analyzing a bank statement or financial document. Extract all expense/debit transactions.

EXTRACTION RULES:
1. Extract ONLY debit/expense transactions (money going out)
2. Skip credits, deposits, refunds, and transfers between own accounts
3. Skip internal bank fees unless they are significant
4. Convert all dates to YYYY-MM-DD format
5. Express amounts as positive numbers
6. Clean merchant names for readability (remove card numbers, reference IDs)

CATEGORIZATION RULES:
- Grocery stores (Woolworths, Coles, Aldi, Costco) → "Food"
- Restaurants/cafes/fast food (McDonald's, Starbucks) → "Food"
- Food delivery (Uber Eats, DoorDash) → "Food"
- Gas/petrol stations (Shell, BP, Caltex) → "Transportation"
- Ride share (Uber, Lyft, DiDi) → "Transportation"
- Public transport (Opal, Myki) → "Transportation"
- Electronics/clothing stores → "Shopping"
- Amazon, eBay → "Shopping"
- Pharmacies (CVS, Walgreens, Chemist Warehouse) → "Healthcare"
- Streaming services (Netflix, Spotify, Disney+) → "Entertainment"
- Hotels/flights/Airbnb → "Travel"
- Phone/Internet (Telstra, Optus, Verizon) → "Utilities"
- Power/Gas/Water → "Utilities"
- Rent/Mortgage → "Housing"

OUTPUT FORMAT:
Return ONLY a valid JSON array with this structure (no markdown, no explanation):
[
  {
    "date": "YYYY-MM-DD",
    "description": "cleaned merchant/description",
    "amount": 0.00,
    "reference": "optional_reference",
    "is_debit": true,
    "confidence": 0.95
  }
]

IMPORTANT:
- All amounts must be positive numbers
- Only include debit transactions (is_debit: true)
- Date format must be YYYY-MM-DD
- Clean up merchant names (remove "VISA *", "EFTPOS *", card numbers)
- If no transactions found, return an empty array: []"""
