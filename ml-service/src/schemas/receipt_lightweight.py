"""Schema definitions for the lightweight SigLIP receipt extraction endpoint."""

from typing import Optional

from pydantic import BaseModel, Field


class FieldConfidence(BaseModel):
    """Per-field extraction result with confidence and source model."""
    value: str = Field(description="Extracted value (string representation)")
    confidence: float = Field(ge=0.0, le=1.0, description="Field confidence score")
    source: str = Field(description="Model that produced this field: siglip, qwen2vl, gemini")


class LightweightReceiptResponse(BaseModel):
    """Response from the lightweight receipt extraction endpoint."""
    merchant: FieldConfidence
    amount: FieldConfidence
    date: FieldConfidence
    line_items_detected: bool = Field(default=False)
    line_item_count: int = Field(default=0)
    overall_confidence: float = Field(ge=0.0, le=1.0)
    routing_tier: int = Field(
        description="Which tier handled this: 1=SigLIP, 2=Qwen2-VL, 3=Gemini"
    )
    processing_time_ms: int = Field(description="Total processing time in ms")
    model_used: str = Field(description="Primary model used for extraction")
    warnings: list[str] = Field(default_factory=list)
    escalated: bool = Field(
        default=False,
        description="Whether the request was escalated from SigLIP to a heavier model",
    )


class LightweightReceiptRequest(BaseModel):
    """Optional request body for the lightweight endpoint."""
    force_tier: Optional[int] = Field(
        default=None,
        description="Force a specific routing tier (1, 2, or 3) — for testing/debugging",
    )
    ab_test_group: Optional[str] = Field(
        default=None,
        description="A/B test group identifier for traffic routing experiments",
    )
