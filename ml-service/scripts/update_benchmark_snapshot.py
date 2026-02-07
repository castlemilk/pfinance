#!/usr/bin/env python3
"""
Update ML benchmark snapshot and generate report.

Usage:
    python3 update_benchmark_snapshot.py [--results-file PATH] [--run-id ID]

This script:
1. Reads new benchmark results (from eval_runner output or specified file)
2. Updates benchmark-results.json with the latest snapshot
3. Appends the run to benchmark-history.json
4. Regenerates BENCHMARK_REPORT.md with updated metrics and trends
"""

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).parent.parent
SNAPSHOT_PATH = ROOT / "benchmark-results.json"
HISTORY_PATH = ROOT / "benchmark-history.json"
REPORT_PATH = ROOT / "BENCHMARK_REPORT.md"


def get_git_sha() -> str:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True,
            text=True,
            cwd=ROOT,
        )
        return result.stdout.strip() or "unknown"
    except Exception:
        return "unknown"


def load_json(path: Path) -> dict:
    if not path.exists():
        return {}
    with open(path) as f:
        return json.load(f)


def save_json(path: Path, data: dict) -> None:
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


def update_snapshot(new_results: dict) -> None:
    """Replace benchmark-results.json with new results."""
    save_json(SNAPSHOT_PATH, new_results)
    print(f"Updated snapshot: {SNAPSHOT_PATH}")


def append_history(new_results: dict, run_id: str) -> dict:
    """Append run to benchmark-history.json and return history."""
    history = load_json(HISTORY_PATH)
    if "runs" not in history:
        history["runs"] = []

    entry = {
        "run_id": run_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "model": new_results.get("model", "unknown"),
        "git_sha": get_git_sha(),
        "results": new_results.get("results", {}),
    }

    history["runs"].append(entry)

    # Keep last 50 runs
    if len(history["runs"]) > 50:
        history["runs"] = history["runs"][-50:]

    save_json(HISTORY_PATH, history)
    print(f"Appended run '{run_id}' to history ({len(history['runs'])} total runs)")
    return history


def trend_arrow(current: float, previous: float) -> str:
    diff = current - previous
    if abs(diff) < 0.005:
        return "→"
    return "↑" if diff > 0 else "↓"


def generate_report(snapshot: dict, history: dict) -> None:
    """Generate BENCHMARK_REPORT.md from snapshot and history."""
    results = snapshot.get("results", {})
    overall = results.get("overall", {})
    thresholds = snapshot.get("thresholds", {})
    runs = history.get("runs", [])

    # Get previous run for trend comparison
    prev_overall = {}
    if len(runs) >= 2:
        prev_overall = runs[-2].get("results", {}).get("overall", {})

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    lines = [
        "# ML Extraction Benchmark Report",
        "",
        f"> Auto-generated on {now}",
        f"> Model: **{snapshot.get('model', 'unknown')}**",
        f"> Total samples: **{overall.get('total_samples', 'N/A')}**",
        "",
        "## Overall Metrics",
        "",
        "| Metric | Value | Threshold | Status | Trend |",
        "|--------|-------|-----------|--------|-------|",
    ]

    metrics = [
        ("F1 Score", "f1_score"),
        ("Amount Accuracy", "amount_accuracy"),
        ("Date Accuracy", "date_accuracy"),
        ("Description Accuracy", "description_accuracy"),
    ]

    for name, key in metrics:
        val = overall.get(key)
        thresh = thresholds.get(key)
        if val is None:
            lines.append(f"| {name} | N/A | {thresh:.2f} | - | - |")
            continue

        status = "PASS" if thresh is None or val >= thresh else "FAIL"
        trend = ""
        if prev_overall and key in prev_overall:
            trend = trend_arrow(val, prev_overall[key])
        lines.append(f"| {name} | {val:.3f} | {thresh:.2f} | {status} | {trend} |")

    # Additional metrics
    lines.extend([
        "",
        "| Metric | Value |",
        "|--------|-------|",
        f"| Precision | {overall.get('precision', 'N/A')} |",
        f"| Recall | {overall.get('recall', 'N/A')} |",
        f"| Amount MAE | {overall.get('amount_mae', 'N/A')} |",
        f"| Avg Processing Time | {overall.get('avg_processing_time_ms', 'N/A')}ms |",
    ])

    # Per-document-type breakdown
    lines.extend(["", "## By Document Type", ""])

    for doc_type in ["receipt", "bank_statement"]:
        doc = results.get(doc_type, {})
        if not doc:
            continue
        label = doc_type.replace("_", " ").title()
        lines.extend([
            f"### {label}",
            "",
            f"| Metric | Value |",
            f"|--------|-------|",
            f"| F1 Score | {doc.get('f1_score', 'N/A')} |",
            f"| Amount Accuracy | {doc.get('amount_accuracy', 'N/A')} |",
            f"| Date Accuracy | {doc.get('date_accuracy', 'N/A')} |",
            f"| Description Accuracy | {doc.get('description_accuracy', 'N/A')} |",
            f"| Sample Count | {doc.get('sample_count', 'N/A')} |",
            f"| Avg Processing Time | {doc.get('avg_processing_time_ms', 'N/A')}ms |",
            "",
        ])

    # Trend history (last 5 runs)
    if len(runs) > 1:
        recent = runs[-5:]
        lines.extend(["## Recent History", "", "| Run | Date | F1 | Amount Acc | Date Acc | Desc Acc |", "|-----|------|----|-----------|----------|----------|"])
        for run in recent:
            r = run.get("results", {}).get("overall", {})
            ts = run.get("timestamp", "")[:10]
            rid = run.get("run_id", "?")[:20]
            lines.append(
                f"| {rid} | {ts} "
                f"| {r.get('f1_score', '-')} "
                f"| {r.get('amount_accuracy', '-')} "
                f"| {r.get('date_accuracy', '-')} "
                f"| {r.get('description_accuracy', '-')} |"
            )
        lines.append("")

    # Thresholds reference
    lines.extend([
        "## Threshold Configuration",
        "",
        "| Metric | Minimum Threshold |",
        "|--------|-------------------|",
    ])
    for name, key in metrics:
        thresh = thresholds.get(key)
        if thresh is not None:
            lines.append(f"| {name} | {thresh:.2f} |")
    lines.append("")

    report = "\n".join(lines)
    REPORT_PATH.write_text(report)
    print(f"Generated report: {REPORT_PATH}")


def main():
    parser = argparse.ArgumentParser(description="Update ML benchmark snapshot and report")
    parser.add_argument(
        "--results-file",
        type=Path,
        default=SNAPSHOT_PATH,
        help="Path to new benchmark results JSON (default: current snapshot)",
    )
    parser.add_argument(
        "--run-id",
        default=None,
        help="Run identifier (default: auto-generated from timestamp)",
    )
    args = parser.parse_args()

    # Load new results
    new_results = load_json(args.results_file)
    if not new_results:
        print(f"ERROR: Could not load results from {args.results_file}")
        sys.exit(1)

    run_id = args.run_id or f"run-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}"

    # Update snapshot
    update_snapshot(new_results)

    # Append to history
    history = append_history(new_results, run_id)

    # Generate report
    generate_report(new_results, history)

    print("\nDone! Files updated:")
    print(f"  - {SNAPSHOT_PATH}")
    print(f"  - {HISTORY_PATH}")
    print(f"  - {REPORT_PATH}")


if __name__ == "__main__":
    main()
