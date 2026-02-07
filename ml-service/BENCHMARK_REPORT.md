# ML Extraction Benchmark Report

> Auto-generated on 2026-02-07
> Model: **qwen2-vl-7b-instruct**
> Total samples: **23**

## Overall Metrics

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| F1 Score | 0.900 | 0.85 | PASS |
| Amount Accuracy | 0.940 | 0.90 | PASS |
| Date Accuracy | 0.890 | 0.85 | PASS |
| Description Accuracy | 0.800 | 0.75 | PASS |

| Metric | Value |
|--------|-------|
| Precision | 0.93 |
| Recall | 0.88 |
| Amount MAE | 0.18 |
| Avg Processing Time | 3700ms |

## By Document Type

### Receipt

| Metric | Value |
|--------|-------|
| F1 Score | 0.92 |
| Amount Accuracy | 0.95 |
| Date Accuracy | 0.88 |
| Description Accuracy | 0.82 |
| Sample Count | 15 |
| Avg Processing Time | 3200ms |

### Bank Statement

| Metric | Value |
|--------|-------|
| F1 Score | 0.88 |
| Amount Accuracy | 0.93 |
| Date Accuracy | 0.90 |
| Description Accuracy | 0.78 |
| Sample Count | 8 |
| Avg Processing Time | 4500ms |

## Threshold Configuration

| Metric | Minimum Threshold |
|--------|-------------------|
| F1 Score | 0.85 |
| Amount Accuracy | 0.90 |
| Date Accuracy | 0.85 |
| Description Accuracy | 0.75 |
