package service

import (
	"archive/zip"
	"bytes"
	"context"
	"fmt"
	"io"
	"strings"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/auth"

	gcsstorage "cloud.google.com/go/storage"
)

// SetStorageClient sets the GCS bucket for receipt operations.
func (s *FinanceService) SetStorageClient(bucket *gcsstorage.BucketHandle) {
	s.storageBucket = bucket
}

// ExportReceipts exports receipt files for deductible expenses as a ZIP archive.
func (s *FinanceService) ExportReceipts(ctx context.Context, req *connect.Request[pfinancev1.ExportReceiptsRequest]) (*connect.Response[pfinancev1.ExportReceiptsResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}
	if err := s.requireProWithFallback(ctx, claims); err != nil {
		return nil, err
	}

	fy := req.Msg.FinancialYear
	if fy == "" {
		fy = currentAustralianFY()
	}

	start, end, err := parseFYDateRange(fy)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	// Fetch all expenses for the FY
	var allExpenses []*pfinancev1.Expense
	var pageToken string
	for {
		expenses, nextToken, listErr := s.store.ListExpenses(ctx, claims.UID, "", &start, &end, 500, pageToken)
		if listErr != nil {
			return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("list expenses: %w", listErr))
		}
		allExpenses = append(allExpenses, expenses...)
		if nextToken == "" {
			break
		}
		pageToken = nextToken
	}

	// Filter to deductible expenses with receipt storage paths
	var withReceipts []*pfinancev1.Expense
	for _, e := range allExpenses {
		if e.IsTaxDeductible && e.ReceiptStoragePath != "" {
			withReceipts = append(withReceipts, e)
		}
	}

	if len(withReceipts) == 0 {
		return nil, connect.NewError(connect.CodeNotFound,
			fmt.Errorf("no deductible expenses with receipts found for %s", fy))
	}

	if s.storageBucket == nil {
		return nil, connect.NewError(connect.CodeUnavailable,
			fmt.Errorf("storage service is not configured"))
	}

	// Build ZIP archive organized by ATO deduction category
	var buf bytes.Buffer
	zipWriter := zip.NewWriter(&buf)

	receiptCount := int32(0)
	for _, expense := range withReceipts {
		// Determine folder name from tax deduction category
		folder := categoryToFolderName(expense.TaxDeductionCategory)

		// Build filename: Description_Date_Amount.ext
		ext := extensionFromPath(expense.ReceiptStoragePath)
		amt := effectiveDollars(expense.AmountCents, expense.Amount)
		dateStr := ""
		if expense.Date != nil && expense.Date.IsValid() {
			dateStr = expense.Date.AsTime().Format("2006-01-02")
		}
		desc := sanitizeFilename(expense.Description)
		if desc == "" {
			desc = "receipt"
		}
		filename := fmt.Sprintf("%s/%s_%s_$%.2f%s", folder, desc, dateStr, amt, ext)

		// Read from GCS
		reader, readErr := s.storageBucket.Object(expense.ReceiptStoragePath).NewReader(ctx)
		if readErr != nil {
			continue // Skip files that can't be read
		}
		data, readErr := io.ReadAll(reader)
		reader.Close()
		if readErr != nil {
			continue
		}

		w, zipErr := zipWriter.Create(filename)
		if zipErr != nil {
			continue
		}
		if _, err := w.Write(data); err != nil {
			continue
		}
		receiptCount++
	}

	if err := zipWriter.Close(); err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("create zip: %w", err))
	}

	zipFilename := fmt.Sprintf("pfinance-receipts-%s.zip", fy)

	return connect.NewResponse(&pfinancev1.ExportReceiptsResponse{
		Data:         buf.Bytes(),
		Filename:     zipFilename,
		ContentType:  "application/zip",
		ReceiptCount: receiptCount,
	}), nil
}

// categoryToFolderName maps a TaxDeductionCategory to an ATO-style folder name.
func categoryToFolderName(cat pfinancev1.TaxDeductionCategory) string {
	switch cat {
	case pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_WORK_TRAVEL:
		return "D1-WorkTravel"
	case pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_UNIFORM:
		return "D2-Uniform"
	case pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_SELF_EDUCATION:
		return "D3-SelfEducation"
	case pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_OTHER_WORK:
		return "D4-OtherWork"
	case pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_HOME_OFFICE:
		return "D5-HomeOffice"
	case pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_VEHICLE:
		return "D6-Vehicle"
	case pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_DONATIONS:
		return "D7-Donations"
	case pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_TAX_AFFAIRS:
		return "D8-TaxAffairs"
	case pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_INCOME_PROTECTION:
		return "D9-IncomeProtection"
	case pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_OTHER:
		return "D10-Other"
	default:
		return "Other"
	}
}

// sanitizeFilename removes or replaces characters unsafe for filenames.
func sanitizeFilename(s string) string {
	replacer := strings.NewReplacer("/", "-", "\\", "-", ":", "-", "*", "", "?", "", "\"", "", "<", "", ">", "", "|", "")
	result := replacer.Replace(s)
	if len(result) > 50 {
		result = result[:50]
	}
	return result
}

// extensionFromPath extracts the file extension from a storage path.
func extensionFromPath(path string) string {
	idx := strings.LastIndex(path, ".")
	if idx < 0 {
		return ".bin"
	}
	return path[idx:]
}
