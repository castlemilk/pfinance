#!/usr/bin/env python3
"""Test receipt extraction with Gemini API."""

import base64
import json
import os
import sys
from pathlib import Path

import google.generativeai as genai

# Configure Gemini
API_KEY = os.getenv("GEMINI_API_KEY", "AIzaSyBCfXD_CVctJuEYHq84efIqlifv-M56KRM")
genai.configure(api_key=API_KEY)

EXTRACTION_PROMPT = """You are analyzing a receipt image or expense photo.

Extract ALL financial transaction information with FULL DETAIL.

FOR DETAILED RECEIPTS (itemized):
1. Extract EACH LINE ITEM as a separate entry in the items array
2. Include the item description
3. Include quantity if visible
4. Include the item price (per-unit price, not total)

FOR SIMPLE RECEIPTS:
1. Merchant/Store name
2. Total amount paid
3. Date of transaction

CATEGORIZATION RULES:
- Grocery stores (Woolworths, Coles, Aldi) → "Food"
- Restaurants/cafes/fast food → "Food"
- Gas/petrol stations → "Transportation"
- Ride share (Uber, Lyft) → "Transportation"
- Electronics/clothing stores → "Shopping"
- Pharmacies → "Healthcare"
- Streaming services (Netflix, Spotify) → "Entertainment"
- Hotels/flights/Airbnb → "Travel"

OUTPUT FORMAT:
Return ONLY a valid JSON object (no markdown, no explanation):
{
  "merchant": "Store/Merchant Name",
  "date": "YYYY-MM-DD",
  "items": [
    {
      "description": "Item description",
      "amount": 0.00,
      "quantity": 1,
      "category": "Food"
    }
  ],
  "subtotal": 0.00,
  "tax": 0.00,
  "total": 0.00,
  "paymentMethod": "card",
  "confidence": 0.95
}

IMPORTANT:
- All amounts should be positive numbers
- Date format must be YYYY-MM-DD
- If date is unclear, use today's date
- Confidence should reflect how certain you are (0.0 to 1.0)
- If no transaction found, return: {"error": "No transaction found"}"""


def extract_receipt(image_path: str) -> dict:
    """Extract transaction data from a receipt image."""

    # Read and encode image
    with open(image_path, "rb") as f:
        image_data = f.read()

    # Determine mime type
    suffix = Path(image_path).suffix.lower()
    mime_type = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
    }.get(suffix, "image/jpeg")

    # Create model
    model = genai.GenerativeModel("gemini-2.0-flash")

    # Generate content
    response = model.generate_content([
        EXTRACTION_PROMPT,
        {"mime_type": mime_type, "data": image_data}
    ])

    # Parse response
    text = response.text.strip()

    # Remove markdown code blocks if present
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1])

    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        return {"error": f"Failed to parse JSON: {e}", "raw_response": text}


def main():
    """Test extraction on sample receipt."""

    # Test image path
    test_images = [
        "../web/testdata/real_receipt.jpg",
        "testdata/sample_receipt.jpg",
    ]

    for img_path in test_images:
        full_path = Path(__file__).parent / img_path
        if full_path.exists():
            print(f"\n{'='*60}")
            print(f"Testing: {img_path}")
            print('='*60)

            result = extract_receipt(str(full_path))
            print(json.dumps(result, indent=2))

            if "error" not in result:
                print(f"\n✓ Merchant: {result.get('merchant', 'N/A')}")
                print(f"✓ Date: {result.get('date', 'N/A')}")
                print(f"✓ Total: {result.get('total', 'N/A')}")
                print(f"✓ Confidence: {result.get('confidence', 'N/A')}")

                if result.get('items'):
                    print(f"\nLine items ({len(result['items'])}):")
                    for item in result['items']:
                        print(f"  - {item.get('description')}: {item.get('amount')}")
            break
    else:
        print("No test images found!")
        print("Looking for:")
        for img_path in test_images:
            full_path = Path(__file__).parent / img_path
            print(f"  {full_path} - {'exists' if full_path.exists() else 'NOT FOUND'}")


if __name__ == "__main__":
    main()
