#!/usr/bin/env python3
"""Test receipt extraction with EasyOCR (local, no API needed)."""

import json
import re
from pathlib import Path

import easyocr


def extract_with_easyocr(image_path: str) -> dict:
    """Extract text from receipt using EasyOCR."""

    # Initialize reader (downloads model on first run)
    reader = easyocr.Reader(['en', 'de', 'fr'], gpu=False)

    # Read image and extract text
    results = reader.readtext(image_path)

    # Combine all text
    lines = []
    for bbox, text, confidence in results:
        lines.append({
            "text": text,
            "confidence": confidence,
            "bbox": bbox
        })

    return {
        "raw_lines": lines,
        "full_text": "\n".join([l["text"] for l in lines]),
        "avg_confidence": sum(l["confidence"] for l in lines) / len(lines) if lines else 0
    }


def parse_receipt_text(ocr_result: dict) -> dict:
    """Parse extracted text into structured receipt data."""

    text = ocr_result["full_text"]
    lines = text.split("\n")

    # Try to find merchant (usually first non-empty line)
    merchant = None
    for line in lines:
        if len(line.strip()) > 3:
            merchant = line.strip()
            break

    # Try to find date patterns
    date = None
    date_patterns = [
        r'(\d{2}[./]\d{2}[./]\d{4})',  # DD.MM.YYYY or DD/MM/YYYY
        r'(\d{4}[.-]\d{2}[.-]\d{2})',  # YYYY-MM-DD
        r'(\d{2}[./]\d{2}[./]\d{2})',  # DD.MM.YY
    ]
    for pattern in date_patterns:
        match = re.search(pattern, text)
        if match:
            date = match.group(1)
            break

    # Try to find amounts (numbers with decimal points)
    amounts = []
    amount_pattern = r'(\d+[.,]\d{2})'
    for match in re.finditer(amount_pattern, text):
        try:
            amount = float(match.group(1).replace(',', '.'))
            amounts.append(amount)
        except ValueError:
            pass

    # Total is usually the largest amount
    total = max(amounts) if amounts else None

    # Extract line items (text followed by amount)
    items = []
    item_pattern = r'([A-Za-zäöüÄÖÜß\s]+)\s+(\d+[.,]\d{2})'
    for match in re.finditer(item_pattern, text):
        desc = match.group(1).strip()
        amount = float(match.group(2).replace(',', '.'))
        if len(desc) > 2 and amount != total:
            items.append({
                "description": desc,
                "amount": amount
            })

    return {
        "merchant": merchant,
        "date": date,
        "total": total,
        "items": items,
        "all_amounts": amounts,
        "ocr_confidence": ocr_result["avg_confidence"]
    }


def main():
    """Test OCR on sample receipt."""

    test_images = [
        "../web/testdata/real_receipt.jpg",
    ]

    for img_path in test_images:
        full_path = Path(__file__).parent / img_path
        if full_path.exists():
            print(f"\n{'='*60}")
            print(f"Testing EasyOCR on: {img_path}")
            print('='*60)

            print("\n1. Running OCR...")
            ocr_result = extract_with_easyocr(str(full_path))

            print(f"\nRaw OCR text ({len(ocr_result['raw_lines'])} lines):")
            print("-" * 40)
            print(ocr_result["full_text"])
            print("-" * 40)
            print(f"Average OCR confidence: {ocr_result['avg_confidence']:.2%}")

            print("\n2. Parsing receipt...")
            parsed = parse_receipt_text(ocr_result)
            print(json.dumps(parsed, indent=2, default=str))

            print(f"\n✓ Merchant: {parsed.get('merchant', 'N/A')}")
            print(f"✓ Date: {parsed.get('date', 'N/A')}")
            print(f"✓ Total: {parsed.get('total', 'N/A')}")
            print(f"✓ OCR Confidence: {parsed.get('ocr_confidence', 0):.2%}")

            if parsed.get('items'):
                print(f"\nLine items ({len(parsed['items'])}):")
                for item in parsed['items']:
                    print(f"  - {item.get('description')}: {item.get('amount')}")
            break


if __name__ == "__main__":
    main()
