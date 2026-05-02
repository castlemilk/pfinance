"""SigLIP-based lightweight receipt extraction with task-specific heads."""

from .encoder import SigLIPEncoder
from .heads import MerchantClassifier, AmountRegressor, DateExtractor, LineItemDetector
from .pipeline import SigLIPReceiptPipeline

__all__ = [
    "SigLIPEncoder",
    "MerchantClassifier",
    "AmountRegressor",
    "DateExtractor",
    "LineItemDetector",
    "SigLIPReceiptPipeline",
]
