"""
Modal serverless deployment for Qwen2-VL document extraction.

Deploy with:
    modal deploy modal_app.py

Test locally:
    modal run modal_app.py

Estimated costs:
    - A10G: ~$1.10/hr (~$0.0003/sec)
    - Per request (3-5s): ~$0.001-0.002
    - 1000 receipts/month: ~$1-2
"""

import modal

# Create Modal app
app = modal.App("pfinance-extraction")

# Define the container image with all dependencies
image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch>=2.0",
        "transformers>=4.40",
        "accelerate",
        "pillow",
        "fastapi",
        "python-multipart",
    )
    .run_commands(
        # Pre-download the model during build (faster cold starts)
        "python -c \"from transformers import Qwen2VLForConditionalGeneration, AutoProcessor; "
        "AutoProcessor.from_pretrained('Qwen/Qwen2-VL-7B-Instruct', trust_remote_code=True); "
        "Qwen2VLForConditionalGeneration.from_pretrained('Qwen/Qwen2-VL-7B-Instruct', trust_remote_code=True)\""
    )
)

# Volume for model caching (optional, speeds up cold starts)
model_cache = modal.Volume.from_name("qwen-model-cache", create_if_missing=True)


@app.cls(
    image=image,
    gpu="A10G",  # 24GB VRAM, ~$1.10/hr
    timeout=300,
    container_idle_timeout=60,  # Keep warm for 60s after last request
    volumes={"/root/.cache": model_cache},
)
class QwenExtractor:
    """Serverless Qwen2-VL extraction service."""

    @modal.enter()
    def load_model(self):
        """Load model when container starts."""
        import torch
        from transformers import Qwen2VLForConditionalGeneration, AutoProcessor

        print("Loading Qwen2-VL-7B model...")

        self.processor = AutoProcessor.from_pretrained(
            "Qwen/Qwen2-VL-7B-Instruct",
            trust_remote_code=True,
        )

        self.model = Qwen2VLForConditionalGeneration.from_pretrained(
            "Qwen/Qwen2-VL-7B-Instruct",
            torch_dtype=torch.float16,
            device_map="auto",
            trust_remote_code=True,
        )

        print("Model loaded successfully!")

    @modal.method()
    def extract(self, image_bytes: bytes) -> dict:
        """Extract transaction data from receipt image."""
        import io
        import json
        import torch
        from PIL import Image

        # Load image
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

        # Create prompt
        prompt = """Analyze this receipt and extract:
1. Merchant name
2. Date (YYYY-MM-DD format)
3. Total amount

Return ONLY valid JSON:
{"merchant": "Name", "date": "YYYY-MM-DD", "total": 0.00, "confidence": 0.95}"""

        # Prepare input
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": image},
                    {"type": "text", "text": prompt},
                ],
            }
        ]

        text = self.processor.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )

        inputs = self.processor(
            text=[text],
            images=[image],
            padding=True,
            return_tensors="pt",
        ).to("cuda")

        # Generate
        with torch.no_grad():
            outputs = self.model.generate(
                **inputs,
                max_new_tokens=256,
                do_sample=False,
                pad_token_id=self.processor.tokenizer.pad_token_id,
            )

        # Decode
        generated_ids = outputs[:, inputs["input_ids"].shape[1]:]
        response = self.processor.batch_decode(
            generated_ids, skip_special_tokens=True
        )[0]

        # Parse JSON
        try:
            text = response.strip()
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0]
            elif "```" in text:
                text = text.split("```")[1].split("```")[0]

            start = text.find("{")
            end = text.rfind("}") + 1
            if start != -1 and end > start:
                text = text[start:end]

            return json.loads(text)
        except Exception as e:
            return {"error": str(e), "raw_response": response}


# FastAPI web endpoint
@app.function(image=image)
@modal.asgi_app()
def web_app():
    """FastAPI web endpoint for the extraction service."""
    from fastapi import FastAPI, File, UploadFile, HTTPException
    from fastapi.middleware.cors import CORSMiddleware

    api = FastAPI(title="PFinance Extraction API")

    api.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @api.get("/health")
    async def health():
        return {"status": "healthy", "model": "Qwen2-VL-7B"}

    @api.post("/extract")
    async def extract(file: UploadFile = File(...)):
        """Extract transaction from receipt image."""
        if not file.content_type or not file.content_type.startswith("image/"):
            raise HTTPException(400, "File must be an image")

        content = await file.read()
        extractor = QwenExtractor()
        result = extractor.extract.remote(content)

        return {
            "transactions": [result] if "error" not in result else [],
            "raw_result": result,
            "model": "Qwen2-VL-7B",
        }

    return api


# CLI test function
@app.local_entrypoint()
def main():
    """Test the extraction service."""
    from pathlib import Path

    # Test with local image
    test_image = Path(__file__).parent.parent / "web/testdata/real_receipt.jpg"

    if test_image.exists():
        print(f"Testing with: {test_image}")
        image_bytes = test_image.read_bytes()

        extractor = QwenExtractor()
        result = extractor.extract.remote(image_bytes)

        print("\nExtraction Result:")
        print(f"  Merchant: {result.get('merchant', 'N/A')}")
        print(f"  Date: {result.get('date', 'N/A')}")
        print(f"  Total: {result.get('total', 'N/A')}")
        print(f"  Confidence: {result.get('confidence', 'N/A')}")
    else:
        print(f"Test image not found: {test_image}")
        print("Run: modal run modal_app.py")
