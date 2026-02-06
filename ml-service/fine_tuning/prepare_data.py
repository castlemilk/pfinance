#!/usr/bin/env python3
"""
Prepare training data for receipt extraction fine-tuning.

This script helps create training data by:
1. Using Gemini API to generate ground truth labels for receipts
2. Formatting data for Qwen2-VL fine-tuning
3. Splitting into train/val sets
"""

import json
import os
import base64
from pathlib import Path
from typing import Optional
import google.generativeai as genai

# Configure Gemini
API_KEY = os.getenv("GEMINI_API_KEY", "AIzaSyBCfXD_CVctJuEYHq84efIqlifv-M56KRM")
genai.configure(api_key=API_KEY)

DATA_DIR = Path(__file__).parent.parent / "data" / "receipts"
OUTPUT_DIR = Path(__file__).parent / "datasets"

LABELING_PROMPT = """You are creating training data for a receipt OCR model.
Analyze this receipt image VERY CAREFULLY and extract ALL information with 100% accuracy.

Return a JSON object with this EXACT structure:
{
  "merchant": "Exact merchant/store name as shown",
  "address": "Full address if visible",
  "date": "YYYY-MM-DD",
  "time": "HH:MM if visible",
  "currency": "USD/EUR/CHF/GBP/AUD",
  "items": [
    {
      "description": "Exact item name as printed",
      "unit_price": 0.00,
      "quantity": 1,
      "total_price": 0.00
    }
  ],
  "subtotal": 0.00,
  "tax": 0.00,
  "tip": 0.00,
  "total": 0.00,
  "payment_method": "cash/card/unknown",
  "card_last_four": "1234 if visible",
  "receipt_number": "if visible"
}

CRITICAL INSTRUCTIONS:
- Read EVERY piece of text on the receipt
- Include ALL line items, even if partially visible
- Use exact spelling as shown (including foreign languages)
- If a field is not visible, use null
- Prices must be exact as shown
- Return ONLY valid JSON"""


def label_receipt_with_gemini(image_path: str) -> Optional[dict]:
    """Use Gemini to create ground truth label for a receipt."""

    # Read image
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

    try:
        # Generate content
        response = model.generate_content([
            LABELING_PROMPT,
            {"mime_type": mime_type, "data": image_data}
        ])

        # Parse response
        text = response.text.strip()

        # Remove markdown
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0]
        elif "```" in text:
            text = text.split("```")[1].split("```")[0]

        return json.loads(text)

    except Exception as e:
        print(f"Error labeling {image_path}: {e}")
        return None


def create_training_example(image_path: str, label: dict) -> dict:
    """Create a training example in Qwen2-VL format."""

    # Read and encode image
    with open(image_path, "rb") as f:
        image_b64 = base64.b64encode(f.read()).decode()

    # Create the expected output format
    output = {
        "merchant": label.get("merchant"),
        "date": label.get("date"),
        "currency": label.get("currency", "USD"),
        "items": label.get("items", []),
        "subtotal": label.get("subtotal"),
        "tax": label.get("tax"),
        "total": label.get("total"),
    }

    # Training example format for Qwen2-VL
    return {
        "id": Path(image_path).stem,
        "image": image_b64,
        "image_path": str(image_path),
        "conversations": [
            {
                "role": "user",
                "content": [
                    {"type": "image"},
                    {"type": "text", "text": "Extract all transaction information from this receipt. Return JSON with merchant, date, items, and total."}
                ]
            },
            {
                "role": "assistant",
                "content": json.dumps(output, ensure_ascii=False)
            }
        ],
        "ground_truth": label
    }


def process_receipt_directory(input_dir: Path, output_file: Path):
    """Process all receipts in a directory and create training data."""

    output_file.parent.mkdir(parents=True, exist_ok=True)

    image_extensions = {".jpg", ".jpeg", ".png", ".webp"}
    images = [f for f in input_dir.iterdir() if f.suffix.lower() in image_extensions]

    print(f"Found {len(images)} images in {input_dir}")

    examples = []
    for i, image_path in enumerate(images):
        print(f"\nProcessing [{i+1}/{len(images)}]: {image_path.name}")

        # Check for existing label
        label_path = image_path.with_suffix(".json")
        if label_path.exists():
            print(f"  Using existing label: {label_path}")
            with open(label_path) as f:
                label = json.load(f)
        else:
            print(f"  Generating label with Gemini...")
            label = label_receipt_with_gemini(str(image_path))
            if label:
                # Save label for future use
                with open(label_path, "w") as f:
                    json.dump(label, f, indent=2, ensure_ascii=False)
                print(f"  Saved label to {label_path}")

        if label:
            example = create_training_example(str(image_path), label)
            examples.append(example)
            print(f"  ✓ Created training example")
        else:
            print(f"  ✗ Failed to create label")

    # Save training data
    with open(output_file, "w") as f:
        json.dump(examples, f, indent=2, ensure_ascii=False)

    print(f"\n{'='*60}")
    print(f"Created {len(examples)} training examples")
    print(f"Saved to: {output_file}")

    return examples


def split_dataset(examples: list, train_ratio: float = 0.9):
    """Split dataset into train and validation sets."""

    import random
    random.shuffle(examples)

    split_idx = int(len(examples) * train_ratio)
    train = examples[:split_idx]
    val = examples[split_idx:]

    return train, val


def main():
    """Main entry point."""

    print("Receipt Training Data Preparation")
    print("="*60)

    # Check for receipts
    if not DATA_DIR.exists():
        DATA_DIR.mkdir(parents=True)
        print(f"\nCreated data directory: {DATA_DIR}")
        print("\nTo create training data:")
        print(f"1. Add receipt images to: {DATA_DIR}")
        print("2. Run this script again")
        print("\nSupported formats: .jpg, .jpeg, .png, .webp")
        return

    # Process receipts
    output_file = OUTPUT_DIR / "receipt_training_data.json"
    examples = process_receipt_directory(DATA_DIR, output_file)

    if len(examples) > 1:
        # Split into train/val
        train, val = split_dataset(examples)

        train_file = OUTPUT_DIR / "train.json"
        val_file = OUTPUT_DIR / "val.json"

        with open(train_file, "w") as f:
            json.dump(train, f, indent=2, ensure_ascii=False)

        with open(val_file, "w") as f:
            json.dump(val, f, indent=2, ensure_ascii=False)

        print(f"\nTrain set: {len(train)} examples -> {train_file}")
        print(f"Val set: {len(val)} examples -> {val_file}")


if __name__ == "__main__":
    main()
