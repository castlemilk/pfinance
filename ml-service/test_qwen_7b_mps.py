#!/usr/bin/env python3
"""Test Qwen2-VL-7B with optimized MPS loading."""

import json
import time
import torch
import gc
from pathlib import Path
from PIL import Image

# Force MPS
DEVICE = "mps"
print(f"Using device: {DEVICE}")

EXTRACTION_PROMPT = """Analyze this receipt image and extract transaction information.

Return a JSON object with:
{
  "merchant": "Store name",
  "date": "YYYY-MM-DD",
  "currency": "USD/EUR/CHF",
  "items": [{"description": "Item", "amount": 0.00, "quantity": 1}],
  "subtotal": 0.00,
  "tax": 0.00,
  "total": 0.00
}

Return ONLY valid JSON."""


def load_model_optimized():
    """Load Qwen2-VL-7B with optimized MPS settings."""
    from transformers import Qwen2VLForConditionalGeneration, AutoProcessor

    print("Loading Qwen2-VL-7B with optimized MPS loading...")
    start = time.time()

    model_id = "Qwen/Qwen2-VL-7B-Instruct"

    # Load processor first
    processor = AutoProcessor.from_pretrained(model_id, trust_remote_code=True)

    # Strategy: Load to CPU first with low memory, then move layer by layer
    print("Step 1: Loading model structure...")

    # Use float16 with eager attention for MPS compatibility
    model = Qwen2VLForConditionalGeneration.from_pretrained(
        model_id,
        torch_dtype=torch.float16,
        low_cpu_mem_usage=True,
        trust_remote_code=True,
        attn_implementation="eager",  # Disable flash attention for MPS
    )

    print("Step 2: Moving to MPS in chunks...")

    # Move model to MPS - this is the slow part
    # Try moving module by module to avoid memory spikes
    model = model.to(DEVICE)

    # Force synchronization
    if DEVICE == "mps":
        torch.mps.synchronize()

    elapsed = time.time() - start
    print(f"Model loaded in {elapsed:.1f}s")

    # Memory info
    import psutil
    mem = psutil.Process().memory_info().rss / (1024**3)
    print(f"Process memory: {mem:.1f} GB")

    return model, processor


def extract_receipt(model, processor, image_path: str) -> dict:
    """Extract transaction data from receipt."""
    start = time.time()

    image = Image.open(image_path).convert("RGB")
    print(f"Image size: {image.size}")

    messages = [
        {
            "role": "user",
            "content": [
                {"type": "image", "image": image},
                {"type": "text", "text": EXTRACTION_PROMPT},
            ],
        }
    ]

    text = processor.apply_chat_template(
        messages, tokenize=False, add_generation_prompt=True
    )

    inputs = processor(
        text=[text],
        images=[image],
        padding=True,
        return_tensors="pt",
    )

    # Move inputs to MPS
    inputs = {k: v.to(DEVICE) for k, v in inputs.items()}

    print("Generating...")
    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=1024,
            do_sample=False,
            pad_token_id=processor.tokenizer.pad_token_id,
        )

    # Synchronize MPS
    torch.mps.synchronize()

    generated_ids = outputs[:, inputs["input_ids"].shape[1]:]
    response = processor.batch_decode(
        generated_ids, skip_special_tokens=True, clean_up_tokenization_spaces=False
    )[0]

    elapsed = time.time() - start
    print(f"Extraction took {elapsed:.1f}s")

    # Parse JSON
    try:
        text = response.strip()
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0]
        elif "```" in text:
            text = text.split("```")[1].split("```")[0]

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
    # Clear any cached memory
    gc.collect()
    if torch.backends.mps.is_available():
        torch.mps.empty_cache()

    model, processor = load_model_optimized()

    test_image = Path(__file__).parent / "../web/testdata/real_receipt.jpg"
    if test_image.exists():
        print(f"\n{'='*60}")
        print(f"Testing on: {test_image}")
        print('='*60)

        result = extract_receipt(model, processor, str(test_image))

        print(f"\n{'='*60}")
        print("RESULT:")
        print('='*60)
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        print(f"Test image not found: {test_image}")


if __name__ == "__main__":
    main()
