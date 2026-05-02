package evaluators

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"google.golang.org/protobuf/types/known/timestamppb"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/extraction"
	"github.com/castlemilk/pfinance/backend/internal/mleval"
)

// TaxEvaluator evaluates the full extraction + tax classification pipeline.
type TaxEvaluator struct {
	extractor   extraction.Extractor
	taxPipeline *extraction.TaxClassificationPipeline
	costTracker *mleval.CostTracker
	method      pfinancev1.ExtractionMethod
	occupation  string
}

// TaxEvaluatorConfig holds configuration for creating a TaxEvaluator.
type TaxEvaluatorConfig struct {
	GeminiKey    string
	MLServiceURL string
	Method       string
	Occupation   string
}

// NewTaxEvaluator creates and registers a new TaxEvaluator.
func NewTaxEvaluator(cfg TaxEvaluatorConfig) *TaxEvaluator {
	extractCfg := extraction.Config{
		GeminiAPIKey:     cfg.GeminiKey,
		MLServiceURL:     cfg.MLServiceURL,
		EnableML:         cfg.MLServiceURL != "",
		EnableValidation: cfg.GeminiKey != "",
	}
	extractor := extraction.NewExtractionService(extractCfg)
	taxPipeline := extraction.NewTaxClassificationPipeline(cfg.GeminiKey)

	occupation := cfg.Occupation
	if occupation == "" {
		occupation = "employee"
	}

	e := &TaxEvaluator{
		extractor:   extractor,
		taxPipeline: taxPipeline,
		costTracker: mleval.NewCostTracker(),
		method:      parseMethod(cfg.Method),
		occupation:  occupation,
	}

	mleval.Register(e)
	return e
}

func (e *TaxEvaluator) Name() string { return "tax" }
func (e *TaxEvaluator) Description() string {
	return "Tax deduction classification pipeline (extraction + ATO category classification)"
}
func (e *TaxEvaluator) FileExtensions() []string { return []string{".pdf"} }

// CostTracker returns the evaluator's cost tracker for attaching to EvalRun results.
func (e *TaxEvaluator) CostTracker() *mleval.CostTracker { return e.costTracker }

// ProcessFile reads a file, extracts transactions, and classifies them for tax.
func (e *TaxEvaluator) ProcessFile(ctx context.Context, filePath, basePath string) *mleval.FileResult {
	start := time.Now()

	relPath, err := filepath.Rel(basePath, filePath)
	if err != nil || relPath == "" {
		relPath = filepath.Base(filePath)
	}
	info, statErr := os.Stat(filePath)
	if statErr != nil {
		return &mleval.FileResult{
			Filename:     filepath.Base(filePath),
			RelativePath: relPath,
			Error:        fmt.Sprintf("stat: %v", statErr),
		}
	}

	result := &mleval.FileResult{
		Filename:     filepath.Base(filePath),
		RelativePath: relPath,
		Category:     categorizeFile(relPath),
		FileSize:     info.Size(),
	}

	data, err := os.ReadFile(filePath)
	if err != nil {
		result.Error = fmt.Sprintf("read: %v", err)
		result.ProcessingMs = time.Since(start).Milliseconds()
		return result
	}

	docType := detectDocType(result.Category, result.Filename)

	log.Printf("[mleval:tax] processing %s (%s, %d bytes)", relPath, result.Category, len(data))
	extractResult, err := e.extractor.ExtractDocumentWithMethod(
		ctx, data, result.Filename, docType, false, e.method,
	)
	if err != nil {
		result.Error = fmt.Sprintf("extraction: %v", err)
		result.ProcessingMs = time.Since(start).Milliseconds()
		return result
	}

	e.costTracker.RecordExtraction(0, 0)

	result.Extraction = &mleval.Extraction{
		TransactionCount:  len(extractResult.Transactions),
		RejectedCount:     len(extractResult.RejectedTransactions),
		OverallConfidence: extractResult.OverallConfidence,
		MethodUsed:        extractResult.MethodUsed.String(),
		ModelUsed:         extractResult.ModelUsed,
		PageCount:         int(extractResult.PageCount),
		Warnings:          extractResult.Warnings,
		Transactions:      extractResult.Transactions,
		DocumentType:      extractResult.DocumentType.String(),
	}

	if extractResult.StatementMetadata != nil {
		result.Extraction.StatementMetadata = &mleval.StatementMeta{
			BankName:    extractResult.StatementMetadata.BankName,
			AccountID:   extractResult.StatementMetadata.AccountIdentifier,
			PeriodStart: extractResult.StatementMetadata.PeriodStart,
			PeriodEnd:   extractResult.StatementMetadata.PeriodEnd,
		}
	}

	if len(extractResult.Transactions) > 0 {
		expenses := txnsToExpenses(extractResult.Transactions, relPath)

		classResults := e.taxPipeline.ClassifyExpenses(ctx, expenses, nil, e.occupation, 0.85)
		e.costTracker.RecordClassification(len(expenses))

		for i, cr := range classResults {
			catInfo, ok := mleval.ATOCategoryInfo[cr.Classification.Category]
			catCode := ""
			catName := ""
			if ok {
				catCode = catInfo.Code
				catName = catInfo.Name
			}

			amt := expenses[i].Amount
			deductibleAmt := 0.0
			if cr.Classification.IsDeductible {
				deductibleAmt = amt * cr.Classification.DeductiblePct
			}

			dateStr := ""
			if expenses[i].Date != nil {
				dateStr = expenses[i].Date.AsTime().Format("2006-01-02")
			}

			result.TaxResults = append(result.TaxResults, &mleval.TaxResult{
				Description:       expenses[i].Description,
				Amount:            amt,
				Date:              dateStr,
				Category:          expenses[i].Category.String(),
				IsDeductible:      cr.Classification.IsDeductible,
				TaxCategory:       fmt.Sprintf("%s - %s", catCode, catName),
				DeductiblePercent: cr.Classification.DeductiblePct,
				DeductibleAmount:  deductibleAmt,
				Confidence:        cr.Classification.Confidence,
				Reasoning:         cr.Classification.Reasoning,
				Source:            cr.Classification.Source,
				SourceFile:        relPath,
			})
		}
	}

	result.ProcessingMs = time.Since(start).Milliseconds()
	log.Printf("[mleval:tax] done %s: %d txns, %d deductible, %dms",
		relPath,
		result.Extraction.TransactionCount,
		countDeductible(result.TaxResults),
		result.ProcessingMs,
	)
	return result
}

// Score delegates to the shared scorer.
func (e *TaxEvaluator) Score(run *mleval.EvalRun, gtSet *mleval.GroundTruthSet) *mleval.AccuracyReport {
	return mleval.ScoreRun(run, gtSet)
}

// categorizeFile determines the document category from its path.
func categorizeFile(relPath string) string {
	parts := strings.Split(filepath.ToSlash(relPath), "/")
	if len(parts) > 1 {
		switch strings.ToLower(parts[0]) {
		case "statements":
			return "statement"
		case "maintenance":
			return "receipt"
		case "income":
			return "income"
		}
	}
	lower := strings.ToLower(relPath)
	switch {
	case strings.Contains(lower, "statement") || strings.Contains(lower, "estatement"):
		return "statement"
	case strings.Contains(lower, "invoice"):
		return "receipt"
	case strings.Contains(lower, "interest") || strings.Contains(lower, "tax"):
		return "income"
	case strings.Contains(lower, "rates"):
		return "receipt"
	default:
		return "other"
	}
}

// detectDocType maps our category to a protobuf DocumentType.
func detectDocType(category, _ string) pfinancev1.DocumentType {
	switch category {
	case "statement":
		return pfinancev1.DocumentType_DOCUMENT_TYPE_BANK_STATEMENT
	case "receipt":
		return pfinancev1.DocumentType_DOCUMENT_TYPE_RECEIPT
	case "income":
		return pfinancev1.DocumentType_DOCUMENT_TYPE_BANK_STATEMENT
	default:
		return pfinancev1.DocumentType_DOCUMENT_TYPE_RECEIPT
	}
}

// txnsToExpenses converts extracted transactions to Expense protos for classification.
func txnsToExpenses(txns []*pfinancev1.ExtractedTransaction, sourceFile string) []*pfinancev1.Expense {
	expenses := make([]*pfinancev1.Expense, len(txns))
	for i, tx := range txns {
		amt := tx.Amount
		if amt == 0 && tx.AmountCents != 0 {
			amt = float64(tx.AmountCents) / 100.0
		}

		var date *timestamppb.Timestamp
		if tx.Date != "" {
			if t, err := time.Parse("2006-01-02", tx.Date); err == nil {
				date = timestamppb.New(t)
			}
		}

		desc := tx.Description
		if tx.NormalizedMerchant != "" {
			desc = tx.NormalizedMerchant
		}

		expenses[i] = &pfinancev1.Expense{
			Id:          uuid.New().String(),
			Description: desc,
			Amount:      amt,
			AmountCents: tx.AmountCents,
			Category:    tx.SuggestedCategory,
			Date:        date,
			Tags:        []string{"source:" + sourceFile},
		}
	}
	return expenses
}

func countDeductible(results []*mleval.TaxResult) int {
	count := 0
	for _, r := range results {
		if r.IsDeductible {
			count++
		}
	}
	return count
}

// parseMethod converts a string method name to a protobuf ExtractionMethod.
func parseMethod(method string) pfinancev1.ExtractionMethod {
	switch strings.ToLower(method) {
	case "gemini":
		return pfinancev1.ExtractionMethod_EXTRACTION_METHOD_GEMINI
	case "self-hosted", "selfhosted", "ml":
		return pfinancev1.ExtractionMethod_EXTRACTION_METHOD_SELF_HOSTED
	default:
		return pfinancev1.ExtractionMethod_EXTRACTION_METHOD_GEMINI
	}
}
