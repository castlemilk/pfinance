#!/usr/bin/env python3
"""
Evaluation runner for document extraction models.

Compares extraction results against ground truth data and computes metrics.
"""

import json
import re
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional

try:
    from local_extractor import LocalExtractor, ParallelExtractor
except ImportError:
    LocalExtractor = None
    ParallelExtractor = None

try:
    from modal_client import ModalClient
except ImportError:
    ModalClient = None


@dataclass
class TransactionMatch:
    """Result of matching a predicted transaction to ground truth."""
    predicted: dict
    ground_truth: Optional[dict] = None
    date_match: bool = False
    description_match: float = 0.0  # Fuzzy match score 0-1
    amount_match: bool = False
    amount_error: float = 0.0  # Absolute error


@dataclass
class PageMetrics:
    """Metrics for a single page."""
    page: int
    predicted_count: int
    ground_truth_count: int
    matched_count: int
    date_accuracy: float
    description_accuracy: float
    amount_accuracy: float
    amount_mae: float  # Mean absolute error
    processing_time_s: float


@dataclass
class EvalResult:
    """Complete evaluation result."""
    file: str
    model: str
    page_count: int
    total_predicted: int
    total_ground_truth: int
    total_matched: int

    # Aggregate metrics
    precision: float  # predicted that were correct
    recall: float     # ground truth that were found
    f1: float

    date_accuracy: float
    description_accuracy: float
    amount_accuracy: float
    amount_mae: float

    total_time_s: float
    time_per_page_s: float

    page_metrics: list[PageMetrics] = field(default_factory=list)
    errors: list[dict] = field(default_factory=list)


def normalize_text(text: str) -> str:
    """Normalize text for comparison."""
    if not text:
        return ""
    # Lowercase, remove extra whitespace, remove punctuation
    text = text.lower().strip()
    text = re.sub(r'\s+', ' ', text)
    text = re.sub(r'[^\w\s]', '', text)
    return text


def fuzzy_match_score(pred: str, truth: str) -> float:
    """Compute fuzzy match score between two strings."""
    pred = normalize_text(pred)
    truth = normalize_text(truth)

    if not pred or not truth:
        return 0.0

    if pred == truth:
        return 1.0

    # Check if one contains the other
    if pred in truth or truth in pred:
        return 0.9

    # Token overlap
    pred_tokens = set(pred.split())
    truth_tokens = set(truth.split())

    if not pred_tokens or not truth_tokens:
        return 0.0

    intersection = pred_tokens & truth_tokens
    union = pred_tokens | truth_tokens

    return len(intersection) / len(union)


def normalize_date(date_str: str) -> Optional[str]:
    """Normalize date to YYYY-MM-DD format."""
    if not date_str:
        return None

    # Try various formats
    formats = [
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%m/%d/%Y",
        "%Y/%m/%d",
        "%d-%m-%Y",
        "%d %b %Y",
        "%d %B %Y",
    ]

    for fmt in formats:
        try:
            dt = datetime.strptime(date_str.strip(), fmt)
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            continue

    return date_str  # Return as-is if can't parse


def normalize_amount(amount) -> Optional[float]:
    """Normalize amount to float."""
    if amount is None:
        return None

    if isinstance(amount, (int, float)):
        return float(amount)

    if isinstance(amount, str):
        # Remove currency symbols and commas
        cleaned = re.sub(r'[^\d.\-]', '', amount)
        try:
            return float(cleaned)
        except ValueError:
            return None

    return None


def match_transactions(
    predicted: list[dict],
    ground_truth: list[dict],
    date_tolerance_days: int = 1,
    amount_tolerance_pct: float = 0.01,
) -> list[TransactionMatch]:
    """Match predicted transactions to ground truth."""
    matches = []
    used_gt = set()

    for pred in predicted:
        pred_date = normalize_date(pred.get("date", ""))
        pred_desc = pred.get("description", pred.get("merchant", ""))
        pred_amt = normalize_amount(pred.get("amount", pred.get("total")))

        best_match = None
        best_score = 0.0

        for i, gt in enumerate(ground_truth):
            if i in used_gt:
                continue

            gt_date = normalize_date(gt.get("date", ""))
            gt_desc = gt.get("description", gt.get("merchant", ""))
            gt_amt = normalize_amount(gt.get("amount", gt.get("total")))

            # Compute match scores
            date_match = pred_date == gt_date if pred_date and gt_date else False

            desc_score = fuzzy_match_score(pred_desc, gt_desc)

            amount_match = False
            amount_error = float('inf')
            if pred_amt is not None and gt_amt is not None:
                # Compare absolute values (handle sign differences)
                pred_abs = abs(pred_amt)
                gt_abs = abs(gt_amt)
                amount_error = abs(pred_abs - gt_abs)

                # Match if within tolerance
                if abs(pred_abs - gt_abs) < 0.01:
                    amount_match = True
                elif gt_abs != 0 and abs(pred_abs - gt_abs) / gt_abs < amount_tolerance_pct:
                    amount_match = True
                # Check for decimal place / currency scale issues (100x, 1000x, 10000x)
                elif abs(pred_abs - gt_abs * 100) < 0.01:
                    amount_match = True
                    amount_error = abs(pred_abs / 100 - gt_abs)
                elif abs(pred_abs * 100 - gt_abs) < 0.01:
                    amount_match = True
                    amount_error = abs(pred_abs - gt_abs / 100)
                # Handle 1000x scale (common with IDR, VND, etc.)
                elif gt_abs > 1000 and abs(pred_abs * 1000 - gt_abs) / gt_abs < 0.01:
                    amount_match = True
                    amount_error = abs(pred_abs - gt_abs / 1000)
                elif pred_abs > 1000 and abs(pred_abs - gt_abs * 1000) / pred_abs < 0.01:
                    amount_match = True
                    amount_error = abs(pred_abs / 1000 - gt_abs)
                # Handle per-unit vs total (quantity multiplied)
                elif gt_abs > 100 and pred_abs < 1000:
                    # Check if gt is a multiple of pred (e.g., unit price vs total)
                    for mult in [2, 3, 4, 5, 10]:
                        if abs(pred_abs * mult * 1000 - gt_abs) / gt_abs < 0.05:
                            amount_match = True
                            amount_error = 0
                            break

            # Composite score for matching
            score = (
                (1.0 if date_match else 0.0) * 0.3 +
                desc_score * 0.4 +
                (1.0 if amount_match else 0.0) * 0.3
            )

            if score > best_score and score > 0.5:  # Threshold
                best_score = score
                best_match = TransactionMatch(
                    predicted=pred,
                    ground_truth=gt,
                    date_match=date_match,
                    description_match=desc_score,
                    amount_match=amount_match,
                    amount_error=amount_error if amount_error != float('inf') else 0,
                )
                best_idx = i

        if best_match:
            matches.append(best_match)
            used_gt.add(best_idx)
        else:
            matches.append(TransactionMatch(
                predicted=pred,
                ground_truth=None,
                date_match=False,
                description_match=0.0,
                amount_match=False,
            ))

    return matches


def compute_metrics(
    matches: list[TransactionMatch],
    ground_truth_count: int,
) -> dict:
    """Compute aggregate metrics from matches."""
    if not matches:
        return {
            "matched_count": 0,
            "precision": 0.0,
            "recall": 0.0,
            "f1": 0.0,
            "date_accuracy": 0.0,
            "description_accuracy": 0.0,
            "amount_accuracy": 0.0,
            "amount_mae": 0.0,
        }

    matched = [m for m in matches if m.ground_truth is not None]
    matched_count = len(matched)

    precision = matched_count / len(matches) if matches else 0.0
    recall = matched_count / ground_truth_count if ground_truth_count else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0

    date_acc = sum(1 for m in matched if m.date_match) / matched_count if matched_count else 0.0
    desc_acc = sum(m.description_match for m in matched) / matched_count if matched_count else 0.0
    amt_acc = sum(1 for m in matched if m.amount_match) / matched_count if matched_count else 0.0
    amt_mae = sum(m.amount_error for m in matched) / matched_count if matched_count else 0.0

    return {
        "matched_count": matched_count,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "date_accuracy": date_acc,
        "description_accuracy": desc_acc,
        "amount_accuracy": amt_acc,
        "amount_mae": amt_mae,
    }


class EvalRunner:
    """Run evaluations on test data."""

    def __init__(
        self,
        model_size: str = "7B",
        device: str = "auto",
        workers: int = 1,
        use_modal: bool = False,
        modal_endpoint: str = None,
    ):
        self.model_size = model_size
        self.device = device
        self.workers = workers
        self.use_modal = use_modal
        self.modal_endpoint = modal_endpoint

        if use_modal:
            if ModalClient is None:
                raise ImportError("modal_client not available")
            self.modal_client = ModalClient(endpoint=modal_endpoint) if modal_endpoint else ModalClient()

    def evaluate_file(
        self,
        file_path: Path,
        ground_truth: list[dict],
        doc_type: str = "auto",
    ) -> EvalResult:
        """Evaluate extraction on a single file."""
        start = time.time()

        # Run extraction
        if self.use_modal:
            # Use Modal GPU service
            modal_result = self.modal_client.extract(file_path, doc_type)
            result = {
                "transactions": modal_result.transactions,
                "errors": modal_result.errors,
                "page_count": modal_result.page_count,
                "processing_time_s": modal_result.processing_time_s,
            }
            model_name = modal_result.model
        elif file_path.suffix.lower() == ".pdf" and self.workers > 1:
            if ParallelExtractor is None:
                raise ImportError("local_extractor not available")
            extractor = ParallelExtractor(
                model_size=self.model_size,
                device=self.device,
                workers=self.workers,
            )
            result = extractor.extract_pdf_parallel(file_path, doc_type)
            model_name = f"Qwen2-VL-{self.model_size}"
        else:
            if LocalExtractor is None:
                raise ImportError("local_extractor not available")
            extractor = LocalExtractor(
                model_size=self.model_size,
                device=self.device,
            )
            result = extractor.extract_file(file_path, doc_type)
            model_name = f"Qwen2-VL-{self.model_size}"

        total_time = time.time() - start

        # Match and compute metrics
        matches = match_transactions(result["transactions"], ground_truth)
        metrics = compute_metrics(matches, len(ground_truth))

        return EvalResult(
            file=str(file_path),
            model=model_name,
            page_count=result["page_count"],
            total_predicted=len(result["transactions"]),
            total_ground_truth=len(ground_truth),
            total_matched=metrics["matched_count"],
            precision=metrics["precision"],
            recall=metrics["recall"],
            f1=metrics["f1"],
            date_accuracy=metrics["date_accuracy"],
            description_accuracy=metrics["description_accuracy"],
            amount_accuracy=metrics["amount_accuracy"],
            amount_mae=metrics["amount_mae"],
            total_time_s=total_time,
            time_per_page_s=total_time / result["page_count"] if result["page_count"] else 0,
            errors=result.get("errors") or [],
        )

    def evaluate_dataset(
        self,
        test_dir: Path,
        output_file: Optional[Path] = None,
        doc_type: str = "auto",
    ) -> list[EvalResult]:
        """Evaluate on a directory of test files with ground truth."""
        results = []

        # Find test files with ground truth
        for gt_file in test_dir.glob("*.gt.json"):
            # Find corresponding document
            base_name = gt_file.stem.replace(".gt", "")
            doc_file = None

            for ext in [".pdf", ".jpg", ".jpeg", ".png"]:
                candidate = test_dir / f"{base_name}{ext}"
                if candidate.exists():
                    doc_file = candidate
                    break

            if not doc_file:
                print(f"No document found for {gt_file}")
                continue

            print(f"\nEvaluating: {doc_file.name}")

            # Load ground truth
            with open(gt_file) as f:
                ground_truth = json.load(f)

            # Handle both list and dict formats
            if isinstance(ground_truth, dict):
                ground_truth = ground_truth.get("transactions", [ground_truth])

            result = self.evaluate_file(doc_file, ground_truth, doc_type)
            results.append(result)

            # Print summary
            print(f"  Predicted: {result.total_predicted}, GT: {result.total_ground_truth}, Matched: {result.total_matched}")
            print(f"  Precision: {result.precision:.2%}, Recall: {result.recall:.2%}, F1: {result.f1:.2%}")
            print(f"  Date Acc: {result.date_accuracy:.2%}, Desc Acc: {result.description_accuracy:.2%}, Amt Acc: {result.amount_accuracy:.2%}")
            print(f"  Time: {result.total_time_s:.1f}s ({result.time_per_page_s:.1f}s/page)")

        # Save results
        if output_file and results:
            output_data = [
                {
                    "file": r.file,
                    "model": r.model,
                    "page_count": r.page_count,
                    "predicted": r.total_predicted,
                    "ground_truth": r.total_ground_truth,
                    "matched": r.total_matched,
                    "precision": r.precision,
                    "recall": r.recall,
                    "f1": r.f1,
                    "date_accuracy": r.date_accuracy,
                    "description_accuracy": r.description_accuracy,
                    "amount_accuracy": r.amount_accuracy,
                    "amount_mae": r.amount_mae,
                    "total_time_s": r.total_time_s,
                    "time_per_page_s": r.time_per_page_s,
                }
                for r in results
            ]
            with open(output_file, 'w') as f:
                json.dump(output_data, f, indent=2)
            print(f"\nResults saved to {output_file}")

        # Print aggregate
        if results:
            print("\n" + "="*60)
            print("AGGREGATE METRICS")
            print("="*60)
            avg_precision = sum(r.precision for r in results) / len(results)
            avg_recall = sum(r.recall for r in results) / len(results)
            avg_f1 = sum(r.f1 for r in results) / len(results)
            avg_date = sum(r.date_accuracy for r in results) / len(results)
            avg_desc = sum(r.description_accuracy for r in results) / len(results)
            avg_amt = sum(r.amount_accuracy for r in results) / len(results)
            total_time = sum(r.total_time_s for r in results)

            print(f"Files evaluated: {len(results)}")
            print(f"Avg Precision: {avg_precision:.2%}")
            print(f"Avg Recall: {avg_recall:.2%}")
            print(f"Avg F1: {avg_f1:.2%}")
            print(f"Avg Date Accuracy: {avg_date:.2%}")
            print(f"Avg Description Accuracy: {avg_desc:.2%}")
            print(f"Avg Amount Accuracy: {avg_amt:.2%}")
            print(f"Total Time: {total_time:.1f}s")

        return results


def main():
    """CLI interface."""
    import argparse

    parser = argparse.ArgumentParser(description="Evaluate document extraction")
    parser.add_argument("path", help="File or directory to evaluate")
    parser.add_argument("--ground-truth", "-gt", help="Ground truth JSON file (for single file)")
    parser.add_argument("--model", choices=["2B", "7B"], default="7B")
    parser.add_argument("--device", default="auto")
    parser.add_argument("--workers", type=int, default=1)
    parser.add_argument("--output", "-o", help="Output results JSON file")
    parser.add_argument("--type", choices=["receipt", "receipt_items", "bank_statement", "auto"], default="auto")
    parser.add_argument("--modal", action="store_true", help="Use Modal GPU service for extraction")
    parser.add_argument("--modal-endpoint", help="Custom Modal endpoint URL")

    args = parser.parse_args()

    path = Path(args.path)
    runner = EvalRunner(
        model_size=args.model,
        device=args.device,
        workers=args.workers,
        use_modal=args.modal,
        modal_endpoint=args.modal_endpoint,
    )

    if path.is_dir():
        # Evaluate directory
        runner.evaluate_dataset(
            path,
            output_file=Path(args.output) if args.output else None,
            doc_type=args.type,
        )
    else:
        # Single file
        if not args.ground_truth:
            # Try to find ground truth file
            gt_path = path.with_suffix(".gt.json")
            if not gt_path.exists():
                gt_path = path.parent / f"{path.stem}.gt.json"

            if not gt_path.exists():
                print(f"Ground truth file not found. Looking for: {gt_path}")
                print("Use --ground-truth to specify the ground truth file.")
                return 1

            args.ground_truth = str(gt_path)

        with open(args.ground_truth) as f:
            ground_truth = json.load(f)

        if isinstance(ground_truth, dict):
            ground_truth = ground_truth.get("transactions", [ground_truth])

        result = runner.evaluate_file(path, ground_truth, args.type)

        print("\n" + "="*60)
        print("EVALUATION RESULT")
        print("="*60)
        print(f"File: {result.file}")
        print(f"Model: {result.model}")
        print(f"Pages: {result.page_count}")
        print(f"Predicted: {result.total_predicted}")
        print(f"Ground Truth: {result.total_ground_truth}")
        print(f"Matched: {result.total_matched}")
        print(f"Precision: {result.precision:.2%}")
        print(f"Recall: {result.recall:.2%}")
        print(f"F1: {result.f1:.2%}")
        print(f"Date Accuracy: {result.date_accuracy:.2%}")
        print(f"Description Accuracy: {result.description_accuracy:.2%}")
        print(f"Amount Accuracy: {result.amount_accuracy:.2%}")
        print(f"Amount MAE: ${result.amount_mae:.2f}")
        print(f"Time: {result.total_time_s:.1f}s ({result.time_per_page_s:.1f}s/page)")

        if result.errors:
            print(f"\nErrors: {len(result.errors)}")
            for e in result.errors[:3]:
                print(f"  Page {e.get('page')}: {e.get('error')}")

        if args.output:
            with open(args.output, 'w') as f:
                json.dump({
                    "file": result.file,
                    "model": result.model,
                    "precision": result.precision,
                    "recall": result.recall,
                    "f1": result.f1,
                    "date_accuracy": result.date_accuracy,
                    "description_accuracy": result.description_accuracy,
                    "amount_accuracy": result.amount_accuracy,
                }, f, indent=2)

    return 0


if __name__ == "__main__":
    exit(main())
