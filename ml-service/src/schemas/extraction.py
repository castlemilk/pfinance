"""Schema definitions for document extraction API."""

from datetime import date
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class DocumentType(str, Enum):
    """Supported document types for extraction."""

    RECEIPT = "receipt"
    BANK_STATEMENT = "bank_statement"
    INVOICE = "invoice"


class ExpenseCategory(str, Enum):
    """Expense categories matching the proto definition."""

    UNSPECIFIED = "unspecified"
    FOOD = "Food"
    HOUSING = "Housing"
    TRANSPORTATION = "Transportation"
    ENTERTAINMENT = "Entertainment"
    HEALTHCARE = "Healthcare"
    UTILITIES = "Utilities"
    SHOPPING = "Shopping"
    EDUCATION = "Education"
    TRAVEL = "Travel"
    OTHER = "Other"


class ExtractedTransaction(BaseModel):
    """A single extracted transaction from a document."""

    id: str = Field(description="Unique identifier for this extracted transaction")
    date: str = Field(description="Transaction date in YYYY-MM-DD format")
    description: str = Field(description="Raw transaction description from document")
    normalized_merchant: str = Field(description="Normalized/cleaned merchant name")
    amount: float = Field(gt=0, description="Transaction amount as positive number")
    suggested_category: ExpenseCategory = Field(
        default=ExpenseCategory.OTHER,
        description="AI-suggested category based on merchant",
    )
    confidence: float = Field(
        ge=0.0, le=1.0, description="Confidence score for this extraction"
    )
    is_debit: bool = Field(default=True, description="True if money going out")
    reference: Optional[str] = Field(default=None, description="Transaction reference if available")
    line_items: Optional[list[dict]] = Field(
        default=None,
        description="Itemized line items for receipts with multiple items",
    )


class ExtractionRequest(BaseModel):
    """Request to extract transactions from a document."""

    document_type: DocumentType = Field(
        default=DocumentType.RECEIPT,
        description="Type of document being processed",
    )


class ExtractionResponse(BaseModel):
    """Response from document extraction."""

    transactions: list[ExtractedTransaction] = Field(
        default_factory=list,
        description="List of extracted transactions",
    )
    overall_confidence: float = Field(
        ge=0.0, le=1.0, description="Overall extraction confidence"
    )
    model_used: str = Field(description="Name of ML model used for extraction")
    processing_time_ms: int = Field(description="Processing time in milliseconds")
    warnings: list[str] = Field(
        default_factory=list, description="Any warnings during processing"
    )
    document_type: DocumentType = Field(description="Detected/specified document type")
    page_count: int = Field(default=1, description="Number of pages processed")


class HealthResponse(BaseModel):
    """Health check response."""

    status: str = Field(description="Service status")
    model_loaded: bool = Field(description="Whether the ML model is loaded")
    model_name: str = Field(description="Name of the loaded model")
    version: str = Field(description="Service version")


class ErrorResponse(BaseModel):
    """Error response."""

    error: str = Field(description="Error message")
    detail: Optional[str] = Field(default=None, description="Detailed error information")
