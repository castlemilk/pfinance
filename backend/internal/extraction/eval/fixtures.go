package eval

import (
	"embed"
	"encoding/json"
	"fmt"
	"strings"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
)

//go:embed fixtures/*.txt fixtures/*.json
var fixtureFS embed.FS

// Fixture bundles text input with ground truth for evaluation.
type Fixture struct {
	Name         string
	Text         string // raw text (simulates PDF text extraction output)
	DocumentType pfinancev1.DocumentType
	GroundTruth  *GroundTruth
	PageCount    int // simulated page count for PDFAnalysis
}

// LoadFixtures loads all embedded fixture pairs (txt + json).
func LoadFixtures() ([]*Fixture, error) {
	names := []struct {
		name      string
		docType   pfinancev1.DocumentType
		pageCount int
	}{
		{"simple_receipt", pfinancev1.DocumentType_DOCUMENT_TYPE_RECEIPT, 1},
		{"monthly_statement", pfinancev1.DocumentType_DOCUMENT_TYPE_BANK_STATEMENT, 1},
		{"large_statement", pfinancev1.DocumentType_DOCUMENT_TYPE_BANK_STATEMENT, 4},
		{"messy_statement", pfinancev1.DocumentType_DOCUMENT_TYPE_BANK_STATEMENT, 2},
	}

	var fixtures []*Fixture
	for _, n := range names {
		f, err := loadFixture(n.name, n.docType, n.pageCount)
		if err != nil {
			return nil, fmt.Errorf("load fixture %q: %w", n.name, err)
		}
		fixtures = append(fixtures, f)
	}
	return fixtures, nil
}

func loadFixture(name string, docType pfinancev1.DocumentType, pageCount int) (*Fixture, error) {
	textBytes, err := fixtureFS.ReadFile("fixtures/" + name + ".txt")
	if err != nil {
		return nil, fmt.Errorf("read text: %w", err)
	}

	jsonBytes, err := fixtureFS.ReadFile("fixtures/" + name + ".json")
	if err != nil {
		return nil, fmt.Errorf("read ground truth: %w", err)
	}

	var gt GroundTruth
	if err := json.Unmarshal(jsonBytes, &gt); err != nil {
		return nil, fmt.Errorf("parse ground truth: %w", err)
	}

	// Build text lines (non-empty)
	text := string(textBytes)
	var lines []string
	for _, line := range strings.Split(text, "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" {
			lines = append(lines, trimmed)
		}
	}

	return &Fixture{
		Name:         name,
		Text:         text,
		DocumentType: docType,
		GroundTruth:  &gt,
		PageCount:    pageCount,
	}, nil
}
