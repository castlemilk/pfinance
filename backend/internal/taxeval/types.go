package taxeval

import (
	"time"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
)

// FileResult holds the extraction and classification results for a single document.
type FileResult struct {
	Filename     string       `json:"filename"`
	RelativePath string       `json:"relative_path"`
	Category     string       `json:"category"` // "statement", "receipt", "invoice", "income", "other"
	FileSize     int64        `json:"file_size_bytes"`
	ProcessingMs int64        `json:"processing_ms"`
	Error        string       `json:"error,omitempty"`
	Extraction   *Extraction  `json:"extraction,omitempty"`
	TaxResults   []*TaxResult `json:"tax_results,omitempty"`
}

// Extraction holds the raw extraction output for a file.
type Extraction struct {
	TransactionCount  int                                `json:"transaction_count"`
	RejectedCount     int                                `json:"rejected_count"`
	OverallConfidence float64                            `json:"overall_confidence"`
	MethodUsed        string                             `json:"method_used"`
	ModelUsed         string                             `json:"model_used"`
	PageCount         int                                `json:"page_count"`
	Warnings          []string                           `json:"warnings,omitempty"`
	Transactions      []*pfinancev1.ExtractedTransaction `json:"-"` // Not serialized; used internally
	DocumentType      string                             `json:"document_type"`
	StatementMetadata *StatementMeta                     `json:"statement_metadata,omitempty"`
}

// StatementMeta is a simplified version of StatementMetadata for reporting.
type StatementMeta struct {
	BankName    string `json:"bank_name"`
	AccountID   string `json:"account_id"`
	PeriodStart string `json:"period_start"`
	PeriodEnd   string `json:"period_end"`
}

// TaxResult holds the tax classification for a single transaction.
type TaxResult struct {
	Description       string  `json:"description"`
	Amount            float64 `json:"amount"`
	Date              string  `json:"date"`
	Category          string  `json:"expense_category"`
	IsDeductible      bool    `json:"is_deductible"`
	TaxCategory       string  `json:"tax_category"`
	DeductiblePercent float64 `json:"deductible_percent"`
	DeductibleAmount  float64 `json:"deductible_amount"`
	Confidence        float64 `json:"confidence"`
	Reasoning         string  `json:"reasoning"`
	Source            string  `json:"source"` // "merchant_map", "category", "keyword", "gemini"
	SourceFile        string  `json:"source_file"`
}

// EvalRun holds the complete results of an evaluation run.
type EvalRun struct {
	ID          string        `json:"id"`
	StartedAt   time.Time     `json:"started_at"`
	CompletedAt time.Time     `json:"completed_at"`
	DurationMs  int64         `json:"duration_ms"`
	DatasetPath string        `json:"dataset_path"`
	Method      string        `json:"method"`
	Occupation  string        `json:"occupation"`
	Concurrency int           `json:"concurrency"`
	FileResults []*FileResult `json:"file_results"`
	Summary     *RunSummary   `json:"summary"`
	CostSummary *CostSummary  `json:"cost_summary"`
}

// RunSummary aggregates metrics across all files.
type RunSummary struct {
	TotalFiles         int     `json:"total_files"`
	SuccessfulFiles    int     `json:"successful_files"`
	FailedFiles        int     `json:"failed_files"`
	TotalTransactions  int     `json:"total_transactions"`
	TotalRejected      int     `json:"total_rejected"`
	TotalDeductible    int     `json:"total_deductible"`
	TotalNonDeductible int     `json:"total_non_deductible"`
	AvgConfidence      float64 `json:"avg_confidence"`
	TotalProcessingMs  int64   `json:"total_processing_ms"`
	AvgProcessingMs    float64 `json:"avg_processing_ms_per_file"`
}

// TaxReport is the aggregated tax report for a financial year.
type TaxReport struct {
	FinancialYear        string                        `json:"financial_year"`
	Occupation           string                        `json:"occupation"`
	GeneratedAt          time.Time                     `json:"generated_at"`
	DeductionsByCategory map[string]*DeductionCategory `json:"deductions_by_category"`
	TotalDeductions      float64                       `json:"total_deductions"`
	TotalIncome          float64                       `json:"total_income"`
	TotalExpenses        float64                       `json:"total_expenses"`
	TransactionCount     int                           `json:"transaction_count"`
	DocumentCount        int                           `json:"document_count"`
	HighConfidence       int                           `json:"high_confidence_count"` // confidence >= 0.8
	LowConfidence        int                           `json:"low_confidence_count"`  // confidence < 0.6
	Items                []*TaxResult                  `json:"items"`
}

// DeductionCategory groups deductions by ATO category.
type DeductionCategory struct {
	Code             string       `json:"code"` // e.g., "D1", "D4", "D10"
	Name             string       `json:"name"` // e.g., "Work-related travel"
	TotalAmount      float64      `json:"total_amount"`
	DeductibleAmount float64      `json:"deductible_amount"`
	ItemCount        int          `json:"item_count"`
	Items            []*TaxResult `json:"items"`
}

// CostSummary tracks API costs for the eval run.
type CostSummary struct {
	TotalAPICalls       int     `json:"total_api_calls"`
	ExtractionCalls     int     `json:"extraction_calls"`
	ClassificationCalls int     `json:"classification_calls"`
	EstimatedTokens     int64   `json:"estimated_tokens"`
	EstimatedCostUSD    float64 `json:"estimated_cost_usd"`
}

// ATOCategoryInfo maps tax deduction categories to ATO codes.
var ATOCategoryInfo = map[pfinancev1.TaxDeductionCategory]struct {
	Code string
	Name string
}{
	pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_WORK_TRAVEL:       {Code: "D1", Name: "Work-related travel"},
	pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_UNIFORM:           {Code: "D2", Name: "Uniform, laundry, dry-cleaning"},
	pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_SELF_EDUCATION:    {Code: "D3", Name: "Self-education expenses"},
	pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_OTHER_WORK:        {Code: "D4", Name: "Other work-related expenses"},
	pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_HOME_OFFICE:       {Code: "D5", Name: "Working from home"},
	pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_VEHICLE:           {Code: "D6", Name: "Car expenses"},
	pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_DONATIONS:         {Code: "D15", Name: "Gifts and donations"},
	pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_TAX_AFFAIRS:       {Code: "D10", Name: "Cost of managing tax affairs"},
	pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_INCOME_PROTECTION: {Code: "D12", Name: "Income protection insurance"},
	pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_OTHER:             {Code: "Other", Name: "Other deductions"},
}
