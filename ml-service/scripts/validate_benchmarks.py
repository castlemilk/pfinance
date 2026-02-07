#!/usr/bin/env python3
"""
Validate ML benchmark results against quality thresholds.

Used in CI to ensure extraction quality doesn't regress.
Exit code 0 = pass, 1 = fail.
"""

import json
import sys
from pathlib import Path


def main():
    benchmark_path = Path(__file__).parent.parent / "benchmark-results.json"

    if not benchmark_path.exists():
        print(f"ERROR: Benchmark file not found: {benchmark_path}")
        sys.exit(1)

    with open(benchmark_path) as f:
        data = json.load(f)

    thresholds = data.get("thresholds", {})
    results = data.get("results", {}).get("overall", {})

    if not results:
        print("ERROR: No overall results found in benchmark file")
        sys.exit(1)

    failures = []
    passes = []

    checks = [
        ("f1_score", "F1 Score"),
        ("amount_accuracy", "Amount Accuracy"),
        ("date_accuracy", "Date Accuracy"),
        ("description_accuracy", "Description Accuracy"),
    ]

    for metric_key, metric_name in checks:
        threshold = thresholds.get(metric_key)
        actual = results.get(metric_key)

        if threshold is None:
            print(f"  SKIP  {metric_name}: no threshold defined")
            continue

        if actual is None:
            failures.append(f"  FAIL  {metric_name}: no result value")
            continue

        if actual >= threshold:
            passes.append(f"  PASS  {metric_name}: {actual:.3f} >= {threshold:.3f}")
        else:
            failures.append(
                f"  FAIL  {metric_name}: {actual:.3f} < {threshold:.3f} (below threshold)"
            )

    print("=" * 50)
    print("ML Benchmark Validation Report")
    print("=" * 50)
    print(f"Model: {data.get('model', 'unknown')}")
    print(f"Samples: {results.get('total_samples', 'N/A')}")
    print()

    for line in passes:
        print(line)
    for line in failures:
        print(line)

    print()
    print(f"Results: {len(passes)} passed, {len(failures)} failed")
    print("=" * 50)

    if failures:
        print("\nBenchmark validation FAILED")
        sys.exit(1)
    else:
        print("\nBenchmark validation PASSED")
        sys.exit(0)


if __name__ == "__main__":
    main()
