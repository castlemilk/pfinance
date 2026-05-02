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

// ReceiptEvaluator evaluates receipt extraction accuracy.
// Focuses on field-level accuracy: merchant, total amount, date.
type ReceiptEvaluator struct {
	extractor   extraction.Extractor
	costTracker *mleval.CostTracker
	method      pfinancev1.ExtractionMethod
}

// ReceiptEvaluatorConfig holds configuration for creating a ReceiptEvaluator.
type ReceiptEvaluatorConfig struct {
	GeminiKey    string
	MLServiceURL string
	Method       string
}

// NewReceiptEvaluator creates and registers a new ReceiptEvaluator.
func NewReceiptEvaluator(cfg ReceiptEvaluatorConfig) *ReceiptEvaluator {
	extractCfg := extraction.Config{
		GeminiAPIKey:     cfg.GeminiKey,
		MLServiceURL:     cfg.MLServiceURL,
		EnableML:         cfg.MLServiceURL != "",
		EnableValidation: cfg.GeminiKey != "",
	}
	extractor := extraction.NewExtractionService(extractCfg)

	e := &ReceiptEvaluator{
		extractor:   extractor,
		costTracker: mleval.NewCostTracker(),
		method:      parseMethod(cfg.Method),
	}

	mleval.Register(e)
	return e
}

func (e *ReceiptEvaluator) Name() string { return "receipt" }
func (e *ReceiptEvaluator) Description() string {
	return "Receipt extraction accuracy (merchant, total amount, date)"
}
func (e *ReceiptEvaluator) FileExtensions() []string {
	return []string{".pdf", ".png", ".jpg", ".jpeg"}
}

// CostTracker returns the evaluator's cost tracker.
func (e *ReceiptEvaluator) CostTracker() *mleval.CostTracker { return e.costTracker }

// ProcessFile extracts data from a receipt image or PDF.
func (e *ReceiptEvaluator) ProcessFile(ctx context.Context, filePath, basePath string) *mleval.FileResult {
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
		Category:     "receipt",
		FileSize:     info.Size(),
	}

	data, err := os.ReadFile(filePath)
	if err != nil {
		result.Error = fmt.Sprintf("read: %v", err)
		result.ProcessingMs = time.Since(start).Milliseconds()
		return result
	}

	log.Printf("[mleval:receipt] processing %s (%d bytes)", relPath, len(data))

	// Detect if this is an image or PDF for the correct doc type
	ext := strings.ToLower(filepath.Ext(filePath))
	docType := pfinancev1.DocumentType_DOCUMENT_TYPE_RECEIPT
	if ext == ".pdf" {
		// Could be a scanned receipt PDF — still use RECEIPT type
		docType = pfinancev1.DocumentType_DOCUMENT_TYPE_RECEIPT
	}

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

	// Build results for scoring — receipt typically has 1 "transaction" (the total)
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

	result.ProcessingMs = time.Since(start).Milliseconds()
	log.Printf("[mleval:receipt] done %s: %d items, %dms",
		relPath, result.Extraction.TransactionCount, result.ProcessingMs)
	return result
}

// Score compares receipt extraction results against ground truth.
func (e *ReceiptEvaluator) Score(run *mleval.EvalRun, gtSet *mleval.GroundTruthSet) *mleval.AccuracyReport {
	return mleval.ScoreRun(run, gtSet)
}
