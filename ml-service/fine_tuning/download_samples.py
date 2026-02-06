#!/usr/bin/env python3
"""
Download sample receipt images for training data.

Uses publicly available receipt images from Wikipedia Commons and other sources.
"""

import urllib.request
import os
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data" / "receipts"

# Public receipt images (CC licensed)
SAMPLE_RECEIPTS = [
    # Wikipedia Commons receipts
    ("https://upload.wikimedia.org/wikipedia/commons/0/0b/ReceiptSwiss.jpg", "swiss_restaurant_02.jpg"),
    ("https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Movie_Receipt.jpg/400px-Movie_Receipt.jpg", "movie_receipt_01.jpg"),
    ("https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Waiting_staff_receipt.jpg/300px-Waiting_staff_receipt.jpg", "restaurant_receipt_01.jpg"),

    # Note: For production, you would use:
    # 1. Your own receipt collection
    # 2. CORD dataset (https://github.com/clovaai/cord)
    # 3. SROIE dataset (https://rrc.cvc.uab.es/?ch=13)
    # 4. Synthetic receipt generation
]


def download_receipts():
    """Download sample receipts."""

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Downloading sample receipts to {DATA_DIR}")
    print("="*60)

    for url, filename in SAMPLE_RECEIPTS:
        output_path = DATA_DIR / filename

        if output_path.exists():
            print(f"✓ {filename} already exists")
            continue

        try:
            print(f"Downloading {filename}...")
            urllib.request.urlretrieve(url, output_path)
            print(f"  ✓ Saved to {output_path}")
        except Exception as e:
            print(f"  ✗ Failed: {e}")

    print("\n" + "="*60)
    print(f"Downloaded receipts: {list(DATA_DIR.glob('*.jpg'))}")
    print("\nNext steps:")
    print("1. Add more receipt images to:", DATA_DIR)
    print("2. Run: python fine_tuning/prepare_data.py")
    print("3. Run: python fine_tuning/train_lora.py")


if __name__ == "__main__":
    download_receipts()
