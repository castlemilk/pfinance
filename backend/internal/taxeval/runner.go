package taxeval

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
)

// FileRunner processes individual files through the extraction and classification pipeline.
type FileRunner struct {
	extractor   extraction.Extractor
	taxPipeline *extraction.TaxClassificationPipeline
	costTracker *CostTracker
	method      pfinancev1.ExtractionMethod
	occupation  string
}

// NewFileRunner creates a new file runner.
func NewFileRunner(
	extractor extraction.Extractor,
	taxPipeline *extraction.TaxClassificationPipeline,
	costTracker *CostTracker,
	method pfinancev1.ExtractionMethod,
	occupation string,
) *FileRunner {
	return &FileRunner{
		extractor:   extractor,
		taxPipeline: taxPipeline,
		costTracker: costTracker,
		method:      method,
		occupation:  occupation,
	}
}

// ProcessFile reads a file, extracts transactions, and classifies them for tax.
func (r *FileRunner) ProcessFile(ctx context.Context, filePath, basePath string) *FileResult {
	start := time.Now()

	relPath, err := filepath.Rel(basePath, filePath)
	if err != nil || relPath == "" {
		// Fallback to filename if relative path computation fails
		relPath = filepath.Base(filePath)
	}
	info, statErr := os.Stat(filePath)
	if statErr != nil {
		return &FileResult{
			Filename:     filepath.Base(filePath),
			RelativePath: relPath,
			Error:        fmt.Sprintf("stat: %v", statErr),
		}
	}

	result := &FileResult{
		Filename:     filepath.Base(filePath),
		RelativePath: relPath,
		Category:     categorizeFile(relPath),
		FileSize:     info.Size(),
	}

	// Read file
	data, err := os.ReadFile(filePath)
	if err != nil {
		result.Error = fmt.Sprintf("read: %v", err)
		result.ProcessingMs = time.Since(start).Milliseconds()
		return result
	}

	// Detect document type
	docType := detectDocType(result.Category, result.Filename)

	// Extract transactions
	log.Printf("[taxeval] processing %s (%s, %d bytes)", relPath, result.Category, len(data))
	extractResult, err := r.extractor.ExtractDocumentWithMethod(
		ctx, data, result.Filename, docType, false, r.method,
	)
	if err != nil {
		result.Error = fmt.Sprintf("extraction: %v", err)
		result.ProcessingMs = time.Since(start).Milliseconds()
		return result
	}

	r.costTracker.RecordExtraction(0, 0) // estimated tokens

	// Build extraction summary
	result.Extraction = &Extraction{
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
		result.Extraction.StatementMetadata = &StatementMeta{
			BankName:    extractResult.StatementMetadata.BankName,
			AccountID:   extractResult.StatementMetadata.AccountIdentifier,
			PeriodStart: extractResult.StatementMetadata.PeriodStart,
			PeriodEnd:   extractResult.StatementMetadata.PeriodEnd,
		}
	}

	// Convert extracted transactions to expenses for tax classification
	if len(extractResult.Transactions) > 0 {
		expenses := txnsToExpenses(extractResult.Transactions, relPath)

		// Run tax classification pipeline
		classResults := r.taxPipeline.ClassifyExpenses(ctx, expenses, nil, r.occupation, 0.85)
		r.costTracker.RecordClassification(len(expenses))

		// Build tax results
		for i, cr := range classResults {
			catInfo, ok := ATOCategoryInfo[cr.Classification.Category]
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

			result.TaxResults = append(result.TaxResults, &TaxResult{
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
	log.Printf("[taxeval] done %s: %d txns, %d deductible, %dms",
		relPath,
		result.Extraction.TransactionCount,
		countDeductible(result.TaxResults),
		result.ProcessingMs,
	)
	return result
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
	// Root-level files — guess from filename
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
		return pfinancev1.DocumentType_DOCUMENT_TYPE_BANK_STATEMENT // income docs are statement-like
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

// countDeductible counts how many tax results are deductible.
func countDeductible(results []*TaxResult) int {
	count := 0
	for _, r := range results {
		if r.IsDeductible {
			count++
		}
	}
	return count
}
