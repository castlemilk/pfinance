package taxeval

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// GroundTruth holds the expected results for a single document.
type GroundTruth struct {
	Filename     string           `json:"filename"`
	Transactions []*ExpectedTxn   `json:"transactions"`
	Metadata     *GroundTruthMeta `json:"metadata,omitempty"`
}

// GroundTruthMeta holds optional metadata about the ground truth file.
type GroundTruthMeta struct {
	Annotator   string `json:"annotator,omitempty"`
	AnnotatedAt string `json:"annotated_at,omitempty"`
	Notes       string `json:"notes,omitempty"`
}

// ExpectedTxn is a single expected transaction with its tax classification.
type ExpectedTxn struct {
	Description       string  `json:"description"`
	Amount            float64 `json:"amount"`
	Date              string  `json:"date,omitempty"`
	IsDeductible      bool    `json:"is_deductible"`
	TaxCategory       string  `json:"tax_category,omitempty"`       // ATO code: "D1", "D5", etc.
	DeductiblePercent float64 `json:"deductible_percent,omitempty"` // 0.0-1.0
}

// GroundTruthSet maps relative file paths to their ground truth.
type GroundTruthSet struct {
	Files map[string]*GroundTruth // keyed by relative path (e.g., "statements/westpac-oct-24.pdf")
}

// LoadGroundTruth loads all ground truth JSON files from a directory.
// Ground truth files follow the naming convention: <original-filename>.ground-truth.json
// They can be placed alongside the PDFs or in a separate directory.
func LoadGroundTruth(dir string) (*GroundTruthSet, error) {
	// Resolve symlinks so filepath.Walk can traverse the real directory.
	resolved, err := filepath.EvalSymlinks(dir)
	if err != nil {
		return nil, fmt.Errorf("resolve ground truth dir: %w", err)
	}

	set := &GroundTruthSet{Files: make(map[string]*GroundTruth)}

	err = filepath.Walk(resolved, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}
		if !strings.HasSuffix(path, ".ground-truth.json") {
			return nil
		}

		data, err := os.ReadFile(path)
		if err != nil {
			return fmt.Errorf("read %s: %w", path, err)
		}

		var gt GroundTruth
		if err := json.Unmarshal(data, &gt); err != nil {
			return fmt.Errorf("parse %s: %w", path, err)
		}

		// Derive the PDF relative path from the ground truth filename.
		// e.g., "tax25/statements/westpac-oct-24.pdf.ground-truth.json"
		//     → "statements/westpac-oct-24.pdf"
		relPath, err := filepath.Rel(resolved, path)
		if err != nil {
			relPath = filepath.Base(path)
		}
		pdfRelPath := strings.TrimSuffix(relPath, ".ground-truth.json")

		// Use filename from ground truth if set, otherwise derive from path.
		if gt.Filename == "" {
			gt.Filename = filepath.Base(pdfRelPath)
		}

		set.Files[pdfRelPath] = &gt
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("walk ground truth dir: %w", err)
	}

	return set, nil
}

// Lookup finds the ground truth for a given relative file path.
// Tries exact match first, then falls back to filename-only match.
func (s *GroundTruthSet) Lookup(relPath string) *GroundTruth {
	if gt, ok := s.Files[relPath]; ok {
		return gt
	}
	// Fallback: match by filename only
	base := filepath.Base(relPath)
	for _, gt := range s.Files {
		if gt.Filename == base {
			return gt
		}
	}
	return nil
}

// Count returns the number of ground truth files loaded.
func (s *GroundTruthSet) Count() int {
	return len(s.Files)
}
