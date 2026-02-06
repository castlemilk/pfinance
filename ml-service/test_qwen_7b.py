#!/usr/bin/env python3
"""Test receipt extraction with Qwen2-VL-7B (larger, more accurate model)."""

import json
import time
import torch
from pathlib import Path
from PIL import Image
from transformers import Qwen2VLForConditionalGeneration, AutoProcessor

# Check device
if torch.backends.mps.is_available():
    DEVICE = "mps"
    DTYPE = torch.float32  # MPS works better with float32
elif torch.cuda.is_available():
    DEVICE = "cuda"
    DTYPE = torch.float16
else:
    DEVICE = "cpu"
    DTYPE = torch.float32

print(f"Using device: {DEVICE}, dtype: {DTYPE}")

EXTRACTION_PROMPT = """You are a receipt OCR expert. Analyze this receipt image carefully and extract ALL transaction information.

Instructions:
1. Read all text on the receipt carefully
2. Identify the merchant/store name
3. Find the date of the transaction
4. Extract EVERY line item with its price
5. Find the total amount

Return a JSON object with this exact structure:
{
  "merchant": "Full store/merchant name",
  "date": "YYYY-MM-DD",
  "currency": "USD/EUR/CHF/etc",
  "items": [
    {"description": "Item name exactly as shown", "amount": 0.00, "quantity": 1}
  ],
  "subtotal": 0.00,
  "tax": 0.00,
  "total": 0.00,
  "confidence": 0.95
}

Important:
- Read ALL text including foreign language items
- Extract exact prices as shown
- If quantity is shown (e.g., "2x"), include it
- Return ONLY valid JSON, no other text"""


def load_model():
    """Load Qwen2-VL-7B model."""
    print("Loading Qwen2-VL-7B model (downloading ~15GB on first run)...")
    start = time.time()

    model_id = "Qwen/Qwen2-VL-7B-Instruct"

    # Load processor
    processor = AutoProcessor.from_pretrained(model_id, trust_remote_code=True)

    # Load model - use CPU for stability on MPS systems
    # The 7B model is too large for efficient MPS loading
    print("Loading model (keeping on CPU for stability)...")
    model = Qwen2VLForConditionalGeneration.from_pretrained(
        model_id,
        torch_dtype=torch.float32,  # Use float32 for CPU
        device_map="cpu",
        trust_remote_code=True,
        low_cpu_mem_usage=True,
    )

    elapsed = time.time() - start
    print(f"Model loaded in {elapsed:.1f}s")

    # Print memory usage
    import psutil
    mem = psutil.Process().memory_info().rss / (1024**3)
    print(f"Memory usage: {mem:.1f} GB")

    return model, processor


def extract_receipt(model, processor, image_path: str) -> dict:
    """Extract transaction data from a receipt image."""
    start = time.time()

    # Load image
    image = Image.open(image_path).convert("RGB")
    print(f"Image size: {image.size}")

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

    # Keep inputs on same device as model (CPU for 7B)
    inputs = {k: v.to("cpu") for k, v in inputs.items()}

    # Generate
    print("Generating response...")
    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=2048,
            do_sample=False,
            temperature=0.1,
            pad_token_id=processor.tokenizer.pad_token_id,
        )

    # Decode
    generated_ids = outputs[:, inputs["input_ids"].shape[1]:]
    response = processor.batch_decode(
        generated_ids, skip_special_tokens=True, clean_up_tokenization_spaces=False
    )[0]

    elapsed = time.time() - start
    print(f"Extraction took {elapsed:.1f}s")

    # Parse JSON from response
    try:
        text = response.strip()

        # Remove markdown code blocks
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0]
        elif "```" in text:
            text = text.split("```")[1].split("```")[0]

        # Find JSON object
        start_idx = text.find("{")
        end_idx = text.rfind("}") + 1
        if start_idx != -1 and end_idx > start_idx:
            text = text[start_idx:end_idx]

        result = json.loads(text)
        result["_processing_time_s"] = elapsed
        return result
    except json.JSONDecodeError as e:
        return {
            "error": f"Failed to parse JSON: {e}",
            "raw_response": response,
            "_processing_time_s": elapsed
        }


def main():
    """Test extraction on sample receipt."""

    # Load model
    model, processor = load_model()

    # Test images
    test_images = [
        "../web/testdata/real_receipt.jpg",
    ]

    for img_path in test_images:
        full_path = Path(__file__).parent / img_path
        if full_path.exists():
            print(f"\n{'='*60}")
            print(f"Testing Qwen2-VL-7B on: {img_path}")
            print('='*60)

            result = extract_receipt(model, processor, str(full_path))

            print("\n" + "="*60)
            print("EXTRACTION RESULT:")
            print("="*60)
            print(json.dumps(result, indent=2, ensure_ascii=False))

            if "error" not in result:
                print(f"\n{'='*60}")
                print("SUMMARY:")
                print("="*60)
                print(f"✓ Merchant: {result.get('merchant', 'N/A')}")
                print(f"✓ Date: {result.get('date', 'N/A')}")
                print(f"✓ Currency: {result.get('currency', 'N/A')}")
                print(f"✓ Total: {result.get('total', 'N/A')}")
                print(f"✓ Confidence: {result.get('confidence', 'N/A')}")
                print(f"✓ Processing time: {result.get('_processing_time_s', 'N/A'):.1f}s")

                if result.get('items'):
                    print(f"\nLine items ({len(result['items'])}):")
                    for item in result['items']:
                        qty = item.get('quantity', 1)
                        desc = item.get('description', '')
                        amt = item.get('amount', 0)
                        print(f"  - {qty}x {desc}: {amt}")
            break
    else:
        print("No test images found!")


if __name__ == "__main__":
    main()
