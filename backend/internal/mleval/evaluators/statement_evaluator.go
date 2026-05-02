package evaluators

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/extraction"
	"github.com/castlemilk/pfinance/backend/internal/mleval"
)

// StatementEvaluator evaluates bank statement extraction accuracy.
// Focuses on transaction-level F1: correct date + amount + sign.
type StatementEvaluator struct {
	extractor          extraction.Extractor
	costTracker        *mleval.CostTracker
	method             pfinancev1.ExtractionMethod
	useStatementParser bool // Use ParseBankStatement path (LayoutLMv3 + fallback)
}

// StatementEvaluatorConfig holds configuration for creating a StatementEvaluator.
type StatementEvaluatorConfig struct {
	GeminiKey          string
	MLServiceURL       string
	StatementParserURL string
	Method             string
	UseStatementParser bool // Use ParseBankStatement instead of ExtractDocumentWithMethod
}

// NewStatementEvaluator creates and registers a new StatementEvaluator.
func NewStatementEvaluator(cfg StatementEvaluatorConfig) *StatementEvaluator {
	extractCfg := extraction.Config{
		GeminiAPIKey:       cfg.GeminiKey,
		MLServiceURL:       cfg.MLServiceURL,
		StatementParserURL: cfg.StatementParserURL,
		EnableML:           cfg.MLServiceURL != "",
		EnableValidation:   cfg.GeminiKey != "",
	}
	extractor := extraction.NewExtractionService(extractCfg)

	e := &StatementEvaluator{
		extractor:          extractor,
		costTracker:        mleval.NewCostTracker(),
		method:             parseMethod(cfg.Method),
		useStatementParser: cfg.UseStatementParser,
	}

	mleval.Register(e)
	return e
}

func (e *StatementEvaluator) Name() string { return "statement" }
func (e *StatementEvaluator) Description() string {
	return "Bank statement extraction accuracy (transaction-level F1: date + amount + sign)"
}
func (e *StatementEvaluator) FileExtensions() []string { return []string{".pdf"} }

// CostTracker returns the evaluator's cost tracker.
func (e *StatementEvaluator) CostTracker() *mleval.CostTracker { return e.costTracker }

// ProcessFile extracts transactions from a bank statement and builds results.
// Unlike TaxEvaluator, this skips tax classification — it only evaluates extraction quality.
func (e *StatementEvaluator) ProcessFile(ctx context.Context, filePath, basePath string) *mleval.FileResult {
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
		Category:     detectBankFromPath(relPath),
		FileSize:     info.Size(),
	}

	data, err := os.ReadFile(filePath)
	if err != nil {
		result.Error = fmt.Sprintf("read: %v", err)
		result.ProcessingMs = time.Since(start).Milliseconds()
		return result
	}

	log.Printf("[mleval:statement] processing %s (%s, %d bytes, parser=%v)", relPath, result.Category, len(data), e.useStatementParser)

	if e.useStatementParser {
		// Use ParseBankStatement path (LayoutLMv3 + Gemini fallback)
		bankHint := result.Category
		if bankHint == "unknown" {
			bankHint = ""
		}
		bsResult, err := e.extractor.ParseBankStatement(ctx, data, bankHint, e.method)
		if err != nil {
			result.Error = fmt.Sprintf("statement parser: %v", err)
			result.ProcessingMs = time.Since(start).Milliseconds()
			return result
		}

		e.costTracker.RecordExtraction(0, 0)
		result.Extraction = &mleval.Extraction{
			TransactionCount:  len(bsResult.Transactions),
			OverallConfidence: bsResult.Confidence,
			MethodUsed:        bsResult.MethodUsed.String(),
			PageCount:         int(bsResult.PageCount),
			Warnings:          bsResult.Warnings,
			DocumentType:      "DOCUMENT_TYPE_BANK_STATEMENT",
		}
		if bsResult.StatementMetadata != nil {
			result.Extraction.StatementMetadata = &mleval.StatementMeta{
				BankName:    bsResult.StatementMetadata.BankName,
				AccountID:   bsResult.StatementMetadata.AccountIdentifier,
				PeriodStart: bsResult.StatementMetadata.PeriodStart,
				PeriodEnd:   bsResult.StatementMetadata.PeriodEnd,
			}
		}
		result.Extraction.BalanceReconciled = bsResult.BalanceReconciled

		for _, bt := range bsResult.Transactions {
			amt := bt.Amount
			if amt == 0 && bt.AmountCents != 0 {
				amt = float64(bt.AmountCents) / 100.0
			}
			result.TaxResults = append(result.TaxResults, &mleval.TaxResult{
				Description: bt.Description,
				Amount:      amt,
				Date:        bt.Date,
				SourceFile:  relPath,
			})
		}
	} else {
		// Use ExtractDocumentWithMethod path (existing Gemini pipeline)
		extractResult, err := e.extractor.ExtractDocumentWithMethod(
			ctx, data, result.Filename, pfinancev1.DocumentType_DOCUMENT_TYPE_BANK_STATEMENT, false, e.method,
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

		// Build TaxResults as thin wrappers for the scoring pipeline to match against ground truth.
		// No tax classification is performed — IsDeductible and TaxCategory remain zero-valued.
		for _, tx := range extractResult.Transactions {
			amt := tx.Amount
			if amt == 0 && tx.AmountCents != 0 {
				amt = float64(tx.AmountCents) / 100.0
			}
			desc := tx.Description
			if tx.NormalizedMerchant != "" {
				desc = tx.NormalizedMerchant
			}

			result.TaxResults = append(result.TaxResults, &mleval.TaxResult{
				Description: desc,
				Amount:      amt,
				Date:        tx.Date,
				Category:    tx.SuggestedCategory.String(),
				SourceFile:  relPath,
			})
		}
	}

	result.ProcessingMs = time.Since(start).Milliseconds()
	log.Printf("[mleval:statement] done %s: %d txns, %dms",
		relPath, result.Extraction.TransactionCount, result.ProcessingMs)
	return result
}

// Score compares statement extraction results against ground truth.
func (e *StatementEvaluator) Score(run *mleval.EvalRun, gtSet *mleval.GroundTruthSet) *mleval.AccuracyReport {
	return mleval.ScoreRun(run, gtSet)
}

// detectBankFromPath tries to identify the bank from the file path.
func detectBankFromPath(relPath string) string {
	lower := strings.ToLower(relPath)
	banks := map[string]string{
		"cba": "cba", "commbank": "cba", "commonwealth": "cba",
		"westpac":   "westpac",
		"nab":       "nab",
		"anz":       "anz",
		"ing":       "ing",
		"macquarie": "macquarie",
		"up":        "up",
	}
	for keyword, bank := range banks {
		if strings.Contains(lower, keyword) {
			return bank
		}
	}
	return "unknown"
}
