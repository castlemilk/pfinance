# Test Data for Document Extraction

This directory contains test documents and ground truth annotations for evaluating the ML extraction pipeline.

## Current Test Data

| Directory/File | Type | Files | Transactions | Description |
|----------------|------|-------|--------------|-------------|
| `real_receipt.jpg` | Receipt | 1 | 1 | Swiss hotel receipt (CHF 54.50) |
| `b30ab747-*.pdf` | Bank Statement | 1 | 85 | ANZ bank statement (6 pages) |
| `cord/` | Receipt Items | 14 | ~80 | Indonesian receipts (CORD dataset) |
| `receipts_ocr/` | Receipt | 5 | 5 | Synthetic invoices |

## Ground Truth Format

Ground truth files use the `.gt.json` extension and contain:

```json
{
  "document_type": "receipt" | "bank_statement",
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "Merchant name",
      "amount": -123.45,
      "merchant": "Store name (for receipts)"
    }
  ]
}
```

## Adding New Test Data

### Option 1: Manual Annotation

1. Add your document (image/PDF) to this directory
2. Create a `.gt.json` file with the same name:
   ```bash
   # For my_receipt.jpg, create my_receipt.gt.json
   ```

### Option 2: Generate from 7B Model (Bootstrap)

Use the 7B model to generate initial ground truth, then manually verify:

```bash
cd ml-service
source .venv/bin/activate

# Extract with 7B model
python modal_client.py ../web/testdata/my_receipt.jpg \
  --endpoint https://ben-ebsworth--pfinance-extraction-7b-web-app.modal.run \
  -o ../web/testdata/my_receipt.gt.json
```

Then manually review and correct the generated ground truth.

### Option 3: Use the add_test_data.py script

```bash
cd ml-service
python add_test_data.py ../web/testdata/new_document.pdf
```

## Running Evaluations

```bash
cd ml-service
source .venv/bin/activate

# Evaluate all test data with 7B model (recommended)
python eval_runner.py ../web/testdata/ --modal \
  --modal-endpoint https://ben-ebsworth--pfinance-extraction-7b-web-app.modal.run

# Evaluate with 2B model (faster, less accurate)
python eval_runner.py ../web/testdata/ --modal

# Evaluate single file
python eval_runner.py ../web/testdata/my_receipt.jpg --modal
```

## Public Datasets

For additional test data, consider these public receipt datasets:

- **[SROIE](https://rrc.cvc.uab.es/?ch=13)**: 1,000 scanned receipts from ICDAR 2019
- **[CORD](https://github.com/clovaai/cord)**: Indonesian receipts with parsing annotations
- **[ReceiptSense](https://arxiv.org/html/2406.04493v2)**: 20,000 multilingual receipts

## Current Benchmark Results

### By Dataset (7B Model)

| Dataset | Files | F1 | Date Acc | Desc Acc | Amount Acc |
|---------|-------|-----|----------|----------|------------|
| receipts_ocr | 5 | 100.0% | 60.0% | 100.0% | 100.0% |
| cord (line items) | 14 | 70.4% | N/A | 76.4% | 78.6% |
| real_receipt.jpg | 1 | 100.0% | 100.0% | 100.0% | 100.0% |

### Model Comparison (Bank Statement)

| Model | Recall | Precision | F1 | Date Acc | Amount Acc |
|-------|--------|-----------|-----|----------|------------|
| 7B (A10G) | 100% | 90.87% | 94.97% | 98.82% | 98.24% |
| 2B (T4) | 74.12% | 88.68% | 79.71% | 21.95% | 78.05% |

**Recommendation**: Use the 7B model for production accuracy.
