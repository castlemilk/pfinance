package extraction

import (
	"testing"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
)

func TestNormalizeMerchant(t *testing.T) {
	tests := []struct {
		name          string
		rawMerchant   string
		wantName      string
		wantCategory  pfinancev1.ExpenseCategory
		minConfidence float64
	}{
		{
			name:          "Woolworths grocery store",
			rawMerchant:   "WOOLWORTHS 1234 SYDNEY",
			wantName:      "Woolworths",
			wantCategory:  pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
			minConfidence: 0.9,
		},
		{
			name:          "McDonald's fast food",
			rawMerchant:   "MCDONALD'S #12345",
			wantName:      "McDonald's",
			wantCategory:  pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
			minConfidence: 0.9,
		},
		{
			name:          "Uber rideshare",
			rawMerchant:   "UBER *TRIP",
			wantName:      "Uber",
			wantCategory:  pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION,
			minConfidence: 0.9,
		},
		{
			name:          "Netflix streaming",
			rawMerchant:   "NETFLIX.COM 123456789",
			wantName:      "Netflix",
			wantCategory:  pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT,
			minConfidence: 0.9,
		},
		{
			name:          "Amazon shopping",
			rawMerchant:   "AMAZON.COM*1234567",
			wantName:      "Amazon",
			wantCategory:  pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING,
			minConfidence: 0.9,
		},
		{
			name:          "Visa prefix removal",
			rawMerchant:   "VISA *STARBUCKS #123",
			wantName:      "Starbucks",
			wantCategory:  pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
			minConfidence: 0.9,
		},
		{
			name:          "Generic restaurant keyword",
			rawMerchant:   "SOME RANDOM RESTAURANT",
			wantCategory:  pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
			minConfidence: 0.5,
		},
		{
			name:          "Generic pharmacy keyword",
			rawMerchant:   "LOCAL PHARMACY",
			wantCategory:  pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HEALTHCARE,
			minConfidence: 0.5,
		},
		{
			name:          "Unknown merchant",
			rawMerchant:   "XYZABC PTY LTD",
			wantCategory:  pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER,
			minConfidence: 0.2,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := NormalizeMerchant(tt.rawMerchant)

			if tt.wantName != "" && got.Name != tt.wantName {
				t.Errorf("NormalizeMerchant(%q).Name = %q, want %q", tt.rawMerchant, got.Name, tt.wantName)
			}

			if got.Category != tt.wantCategory {
				t.Errorf("NormalizeMerchant(%q).Category = %v, want %v", tt.rawMerchant, got.Category, tt.wantCategory)
			}

			if got.Confidence < tt.minConfidence {
				t.Errorf("NormalizeMerchant(%q).Confidence = %f, want >= %f", tt.rawMerchant, got.Confidence, tt.minConfidence)
			}
		})
	}
}

func TestFormatMerchantName(t *testing.T) {
	tests := []struct {
		raw  string
		want string
	}{
		{"WOOLWORTHS", "Woolworths"},
		{"VISA *STARBUCKS", "Starbucks"},
		{"POS COFFEE SHOP PTY LTD", "Coffee Shop Pty"}, // PTY at end gets truncated
		{"EFTPOS SOME STORE 123456789", "Some Store"},
	}

	for _, tt := range tests {
		t.Run(tt.raw, func(t *testing.T) {
			got := formatMerchantName(tt.raw)
			if got != tt.want {
				t.Errorf("formatMerchantName(%q) = %q, want %q", tt.raw, got, tt.want)
			}
		})
	}
}

func TestCategoryToString(t *testing.T) {
	tests := []struct {
		cat  pfinancev1.ExpenseCategory
		want string
	}{
		{pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, "Food"},
		{pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION, "Transportation"},
		{pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT, "Entertainment"},
		{pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER, "Other"},
		{pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UNSPECIFIED, "Other"},
	}

	for _, tt := range tests {
		t.Run(tt.want, func(t *testing.T) {
			got := CategoryToString(tt.cat)
			if got != tt.want {
				t.Errorf("CategoryToString(%v) = %q, want %q", tt.cat, got, tt.want)
			}
		})
	}
}
