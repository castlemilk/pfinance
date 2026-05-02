# ML Evaluation Datasets

Ground truth data for evaluating PFinance ML capabilities.

## Directory Structure

```
datasets/
├── tax/           # Tax deduction classification ground truth
│                  # Uses existing ground truth from taxeval (*.ground-truth.json)
├── statements/    # Bank statement extraction ground truth
│   ├── cba/       # Commonwealth Bank (50 pages target)
│   ├── westpac/   # Westpac (50 pages target)
│   ├── nab/       # NAB (50 pages target)
│   └── anz/       # ANZ (50 pages target)
└── receipts/      # Receipt extraction ground truth
```

## Ground Truth Format

Each ground truth file is named `<source-file>.ground-truth.json` and placed alongside the source document (or in this datasets directory).

```json
{
  "filename": "westpac-oct-24.pdf",
  "metadata": {
    "annotator": "human",
    "annotated_at": "2026-03-20",
    "notes": "Manual annotation of all transactions"
  },
  "transactions": [
    {
      "description": "WOOLWORTHS 1234",
      "amount": 45.67,
      "date": "2024-10-15",
      "is_deductible": false,
      "tax_category": "",
      "deductible_percent": 0.0
    }
  ]
}
```

## Running Evaluations

```bash
# Run tax evaluator (backward-compatible with taxeval)
go run ./cmd/mleval --evaluator tax --dataset ./tax25

# Run statement evaluator
go run ./cmd/mleval --evaluator statement --dataset ./datasets/statements

# Run receipt evaluator
go run ./cmd/mleval --evaluator receipt --dataset ./datasets/receipts

# Run all evaluators
go run ./cmd/mleval --evaluator all --dataset ./tax25

# List available evaluators
go run ./cmd/mleval --list

# Score-only mode (reuse existing results)
go run ./cmd/mleval --score-only --output results.json --ground-truth ./tax25
```
