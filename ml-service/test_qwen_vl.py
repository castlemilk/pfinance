#!/usr/bin/env python3
"""Test receipt extraction with Qwen2-VL (local VLM)."""

import json
import torch
from pathlib import Path
from PIL import Image
from transformers import Qwen2VLForConditionalGeneration, AutoProcessor

# Check device
if torch.backends.mps.is_available():
    DEVICE = "mps"
elif torch.cuda.is_available():
    DEVICE = "cuda"
else:
    DEVICE = "cpu"

print(f"Using device: {DEVICE}")

EXTRACTION_PROMPT = """Analyze this receipt image and extract all transaction information.

Return a JSON object with this structure:
{
  "merchant": "Store/Merchant Name",
  "date": "YYYY-MM-DD",
  "items": [
    {"description": "Item name", "amount": 0.00, "quantity": 1}
  ],
  "total": 0.00,
  "confidence": 0.95
}

Extract all line items with their prices. Return ONLY valid JSON, no explanation."""


def load_model():
    """Load Qwen2-VL model."""
    print("Loading Qwen2-VL-2B model (this may take a few minutes on first run)...")

    model_id = "Qwen/Qwen2-VL-2B-Instruct"

    # Load processor
    processor = AutoProcessor.from_pretrained(model_id, trust_remote_code=True)

    # Load model with appropriate dtype for device
    if DEVICE == "mps":
        # MPS works best with float32
        model = Qwen2VLForConditionalGeneration.from_pretrained(
            model_id,
            torch_dtype=torch.float32,
            device_map="auto",
            trust_remote_code=True,
        )
    elif DEVICE == "cuda":
        model = Qwen2VLForConditionalGeneration.from_pretrained(
            model_id,
            torch_dtype=torch.float16,
            device_map="auto",
            trust_remote_code=True,
        )
    else:
        model = Qwen2VLForConditionalGeneration.from_pretrained(
            model_id,
            torch_dtype=torch.float32,
            device_map="cpu",
            trust_remote_code=True,
        )

    print("Model loaded successfully!")
    return model, processor


def extract_receipt(model, processor, image_path: str) -> dict:
    """Extract transaction data from a receipt image."""

    # Load image
    image = Image.open(image_path).convert("RGB")

    # Prepare messages in Qwen2-VL format
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "image", "image": image},
                {"type": "text", "text": EXTRACTION_PROMPT},
            ],
        }
    ]

    # Apply chat template
    text = processor.apply_chat_template(
        messages, tokenize=False, add_generation_prompt=True
    )

    # Process inputs
    inputs = processor(
        text=[text],
        images=[image],
        padding=True,
        return_tensors="pt",
    )

    # Move to device
    inputs = {k: v.to(model.device) for k, v in inputs.items()}

    # Generate
    print("Generating response...")
    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=1024,
            do_sample=False,
            temperature=0.1,
        )

    # Decode
    generated_ids = outputs[:, inputs["input_ids"].shape[1]:]
    response = processor.batch_decode(
        generated_ids, skip_special_tokens=True, clean_up_tokenization_spaces=False
    )[0]

    # Parse JSON from response
    try:
        # Try to find JSON in response
        text = response.strip()
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0]
        elif "```" in text:
            text = text.split("```")[1].split("```")[0]

        # Find JSON object
        start = text.find("{")
        end = text.rfind("}") + 1
        if start != -1 and end > start:
            text = text[start:end]

        return json.loads(text)
    except json.JSONDecodeError as e:
        return {"error": f"Failed to parse JSON: {e}", "raw_response": response}


def main():
    """Test extraction on sample receipt."""

    # Load model
    model, processor = load_model()

    # Test image
    test_images = [
        "../web/testdata/real_receipt.jpg",
    ]

    for img_path in test_images:
        full_path = Path(__file__).parent / img_path
        if full_path.exists():
            print(f"\n{'='*60}")
            print(f"Testing Qwen2-VL on: {img_path}")
            print('='*60)

            result = extract_receipt(model, processor, str(full_path))
            print("\nExtraction result:")
            print(json.dumps(result, indent=2, ensure_ascii=False))

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


if __name__ == "__main__":
    main()
