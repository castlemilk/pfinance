"""
Modal serverless deployment for Qwen2-VL + SigLIP receipt extraction.

Extends the existing modal_app.py to co-load the SigLIP encoder and task
heads alongside Qwen2-VL on the same A10G GPU.

VRAM budget (A10G = 24GB):
  - Qwen2-VL-7B (fp16): ~14GB
  - SigLIP-so400m (fp16): ~1.6GB
  - Task heads: ~4MB
  - Total: ~15.6GB (fits with headroom)

Deploy with:
    modal deploy modal_app_siglip.py

Estimated cost savings:
  - Before: ~$0.0025/receipt (all Qwen2-VL)
  - After:  ~$0.0008/receipt (70% SigLIP, 25% Qwen2-VL, 5% Gemini)
"""

import modal

app = modal.App("pfinance-extraction")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch>=2.0",
        "transformers>=4.40",
        "accelerate",
        "pillow",
        "fastapi",
        "python-multipart",
        "structlog",
        "pydantic>=2.0",
    )
    .run_commands(
        # Pre-download Qwen2-VL
        "python -c \""
        "from transformers import Qwen2VLForConditionalGeneration, AutoProcessor; "
        "AutoProcessor.from_pretrained('Qwen/Qwen2-VL-7B-Instruct', trust_remote_code=True); "
        "Qwen2VLForConditionalGeneration.from_pretrained('Qwen/Qwen2-VL-7B-Instruct', trust_remote_code=True)"
        "\"",
        # Pre-download SigLIP
        "python -c \""
        "from transformers import SiglipVisionModel, AutoImageProcessor; "
        "AutoImageProcessor.from_pretrained('google/siglip-so400m-patch14-384'); "
        "SiglipVisionModel.from_pretrained('google/siglip-so400m-patch14-384')"
        "\"",
    )
)

model_cache = modal.Volume.from_name("qwen-model-cache", create_if_missing=True)
siglip_weights = modal.Volume.from_name("siglip-receipt-weights", create_if_missing=True)


@app.cls(
    image=image,
    gpu="A10G",
    timeout=300,
    container_idle_timeout=60,
    volumes={
        "/root/.cache": model_cache,
        "/weights/siglip": siglip_weights,
    },
)
class ReceiptExtractor:
    """Dual-model receipt extraction: SigLIP (fast) + Qwen2-VL (fallback)."""

    @modal.enter()
    def load_models(self):
        """Load both models when container starts."""
        import torch
        from transformers import (
            Qwen2VLForConditionalGeneration,
            AutoProcessor,
            SiglipVisionModel,
            AutoImageProcessor,
        )

        # Load Qwen2-VL (existing)
        print("Loading Qwen2-VL-7B...")
        self.qwen_processor = AutoProcessor.from_pretrained(
            "Qwen/Qwen2-VL-7B-Instruct", trust_remote_code=True,
        )
        self.qwen_model = Qwen2VLForConditionalGeneration.from_pretrained(
            "Qwen/Qwen2-VL-7B-Instruct",
            torch_dtype=torch.float16,
            device_map="auto",
            trust_remote_code=True,
        )
        print("Qwen2-VL loaded!")

        # Load SigLIP encoder (frozen)
        print("Loading SigLIP encoder...")
        self.siglip_processor = AutoImageProcessor.from_pretrained(
            "google/siglip-so400m-patch14-384"
        )
        self.siglip_model = SiglipVisionModel.from_pretrained(
            "google/siglip-so400m-patch14-384",
            torch_dtype=torch.float16,
        ).cuda()
        self.siglip_model.eval()
        for p in self.siglip_model.parameters():
            p.requires_grad = False
        print("SigLIP loaded!")

        # Load task heads
        self._load_task_heads()

        # Report VRAM usage
        if torch.cuda.is_available():
            allocated = torch.cuda.memory_allocated() / 1e9
            reserved = torch.cuda.memory_reserved() / 1e9
            print(f"VRAM: {allocated:.1f}GB allocated, {reserved:.1f}GB reserved")

    def _load_task_heads(self):
        """Load or initialize SigLIP task heads."""
        import torch
        import torch.nn as nn
        import torch.nn.functional as F
        from pathlib import Path

        hidden_dim = 1152
        num_merchants = 101

        # Merchant classifier
        self.merchant_head = nn.Sequential(
            nn.Linear(hidden_dim, 256),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(256, num_merchants),
        ).cuda().half()

        # Amount regressor
        self.amount_query = nn.Linear(hidden_dim, 1).cuda().half()
        self.amount_head = nn.Sequential(
            nn.Linear(hidden_dim, 256),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(256, 1),
            nn.Softplus(),
        ).cuda().half()

        # Date extractor
        self.date_query = nn.Linear(hidden_dim, 1).cuda().half()
        self.date_head = nn.Sequential(
            nn.Linear(hidden_dim, 256),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(256, 3),
        ).cuda().half()

        # Line item detector
        self.line_item_head = nn.Sequential(
            nn.Linear(hidden_dim, 128),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(128, 1),
        ).cuda().half()

        # Try loading trained weights
        weights_dir = Path("/weights/siglip")
        for name, module in [
            ("merchant_head", self.merchant_head),
            ("amount_head", self.amount_head),
            ("date_head", self.date_head),
            ("line_item_head", self.line_item_head),
        ]:
            path = weights_dir / f"{name}.pt"
            if path.exists():
                state = torch.load(path, map_location="cuda", weights_only=True)
                module.load_state_dict(state)
                print(f"Loaded {name} weights from {path}")
            else:
                print(f"No weights for {name} — using random init")

    @modal.method()
    def extract_siglip(self, image_bytes: bytes) -> dict:
        """Extract receipt fields using SigLIP + task heads (~25ms)."""
        import io
        import time
        import torch
        import torch.nn.functional as F
        from PIL import Image

        start = time.monotonic()

        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        inputs = self.siglip_processor(images=image, return_tensors="pt")
        pixel_values = inputs["pixel_values"].cuda().half()

        with torch.no_grad():
            outputs = self.siglip_model(pixel_values=pixel_values)
            hidden = outputs.last_hidden_state
            pooled = outputs.pooler_output

            # Merchant
            merchant_logits = self.merchant_head(pooled)
            merchant_probs = F.softmax(merchant_logits, dim=-1)
            merchant_conf, merchant_idx = merchant_probs.max(dim=-1)

            # Amount (attention pool)
            attn = F.softmax(self.amount_query(hidden), dim=1)
            amount_pooled = (hidden * attn).sum(dim=1)
            amount = self.amount_head(amount_pooled).item()

            # Date (attention pool)
            date_attn = F.softmax(self.date_query(hidden), dim=1)
            date_pooled = (hidden * date_attn).sum(dim=1)
            date_raw = self.date_head(date_pooled).squeeze(0)
            day = max(1, min(31, round(torch.sigmoid(date_raw[0]).item() * 30 + 1)))
            month = max(1, min(12, round(torch.sigmoid(date_raw[1]).item() * 11 + 1)))
            year = max(2000, min(2099, round(torch.sigmoid(date_raw[2]).item() * 99 + 2000)))

            # Line items
            line_logits = self.line_item_head(hidden).squeeze(-1)
            line_mask = (torch.sigmoid(line_logits) > 0.5).float()
            line_count = int(line_mask.sum().item())

        elapsed_ms = int((time.monotonic() - start) * 1000)

        return {
            "merchant_idx": merchant_idx.item(),
            "merchant_confidence": merchant_conf.item(),
            "amount": round(amount, 2),
            "date": f"{year:04d}-{month:02d}-{day:02d}",
            "line_item_count": line_count,
            "processing_time_ms": elapsed_ms,
            "model": "siglip-so400m-patch14-384",
        }

    @modal.method()
    def extract_qwen(self, image_bytes: bytes) -> dict:
        """Extract receipt fields using Qwen2-VL-7B (~200ms)."""
        import io
        import json
        import torch
        from PIL import Image

        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

        prompt = (
            "Analyze this receipt and extract:\n"
            "1. Merchant name\n"
            "2. Date (YYYY-MM-DD format)\n"
            "3. Total amount\n\n"
            'Return ONLY valid JSON:\n'
            '{"merchant": "Name", "date": "YYYY-MM-DD", "total": 0.00, "confidence": 0.95}'
        )

        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": image},
                    {"type": "text", "text": prompt},
                ],
            }
        ]

        text = self.qwen_processor.apply_chat_template(
            messages, tokenize=False, add_generation_prompt=True
        )
        inputs = self.qwen_processor(
            text=[text], images=[image], padding=True, return_tensors="pt",
        ).to("cuda")

        with torch.no_grad():
            outputs = self.qwen_model.generate(
                **inputs, max_new_tokens=256, do_sample=False,
                pad_token_id=self.qwen_processor.tokenizer.pad_token_id,
            )

        generated_ids = outputs[:, inputs["input_ids"].shape[1]:]
        response = self.qwen_processor.batch_decode(
            generated_ids, skip_special_tokens=True
        )[0]

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


@app.function(image=image)
@modal.asgi_app()
def web_app():
    """FastAPI web endpoint with dual-model routing."""
    import io
    import time
    from fastapi import FastAPI, File, UploadFile, HTTPException, Form
    from fastapi.middleware.cors import CORSMiddleware
    from typing import Optional

    api = FastAPI(title="PFinance Extraction API (SigLIP + Qwen2-VL)")

    api.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @api.get("/health")
    async def health():
        return {"status": "healthy", "models": ["siglip-so400m", "Qwen2-VL-7B"]}

    @api.post("/extract")
    async def extract(file: UploadFile = File(...)):
        """Legacy Qwen2-VL extraction endpoint."""
        if not file.content_type or not file.content_type.startswith("image/"):
            raise HTTPException(400, "File must be an image")

        content = await file.read()
        extractor = ReceiptExtractor()
        result = extractor.extract_qwen.remote(content)

        return {
            "transactions": [result] if "error" not in result else [],
            "raw_result": result,
            "model": "Qwen2-VL-7B",
        }

    @api.post("/v1/parse-receipt-lightweight")
    async def parse_lightweight(
        file: UploadFile = File(...),
        force_tier: Optional[int] = Form(None),
    ):
        """Lightweight extraction with confidence-based routing."""
        content = await file.read()
        if not content:
            raise HTTPException(400, "Empty file")

        start = time.time()
        extractor = ReceiptExtractor()

        # Tier 1: SigLIP
        if force_tier in (None, 1):
            try:
                result = extractor.extract_siglip.remote(content)
                if result.get("merchant_confidence", 0) >= 0.7 or force_tier == 1:
                    result["routing_tier"] = 1
                    result["escalated"] = False
                    return result
            except Exception:
                pass

        # Tier 2: Qwen2-VL
        if force_tier in (None, 2):
            try:
                result = extractor.extract_qwen.remote(content)
                if "error" not in result or force_tier == 2:
                    result["routing_tier"] = 2
                    result["escalated"] = True
                    return result
            except Exception:
                pass

        # Tier 3: signal to use Gemini
        return {
            "routing_tier": 3,
            "escalated": True,
            "error": "All self-hosted tiers failed",
            "processing_time_ms": int((time.time() - start) * 1000),
        }

    return api
