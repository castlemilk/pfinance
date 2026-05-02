package mleval

import (
	"fmt"
	"log"
	"math"
	"sort"
	"strings"
)

// DedupResult holds the results of deduplication across an eval run.
type DedupResult struct {
	TotalBefore     int            `json:"total_before"`
	TotalAfter      int            `json:"total_after"`
	DuplicatesFound int            `json:"duplicates_found"`
	DuplicateGroups []*DupGroup    `json:"duplicate_groups,omitempty"`
	OverlapPairs    []*OverlapPair `json:"overlap_pairs,omitempty"`
}

// DupGroup represents a set of transactions deemed duplicates.
type DupGroup struct {
	Key          string     `json:"key"` // canonical key: date|amount|desc
	Transactions []DupEntry `json:"transactions"`
	Kept         DupEntry   `json:"kept"` // the one we keep
}

// DupEntry identifies a specific transaction within a file result.
type DupEntry struct {
	SourceFile  string  `json:"source_file"`
	Date        string  `json:"date"`
	Amount      float64 `json:"amount"`
	Description string  `json:"description"`
	Confidence  float64 `json:"confidence"`
	FileIndex   int     `json:"-"`
	TxIndex     int     `json:"-"`
}

// OverlapPair describes two files with overlapping statement periods.
type OverlapPair struct {
	FileA       string `json:"file_a"`
	FileB       string `json:"file_b"`
	OverlapDays int    `json:"overlap_days"`
}

// DeduplicateRun detects and removes duplicate transactions across files in an eval run.
// It modifies the run in-place, removing duplicates from TaxResults and updating the summary.
// Returns a DedupResult describing what was found and removed.
func DeduplicateRun(run *EvalRun) *DedupResult {
	result := &DedupResult{}

	// Count total transactions before
	for _, fr := range run.FileResults {
		result.TotalBefore += len(fr.TaxResults)
	}

	// Detect statement period overlaps
	result.OverlapPairs = detectOverlaps(run.FileResults)

	// Build index of all transactions by dedup key
	type txRef struct {
		fileIdx int
		txIdx   int
		entry   DupEntry
	}

	groups := make(map[string][]txRef)
	for fi, fr := range run.FileResults {
		for ti, tr := range fr.TaxResults {
			key := dedupKey(tr.Date, tr.Amount, tr.Description)
			ref := txRef{
				fileIdx: fi,
				txIdx:   ti,
				entry: DupEntry{
					SourceFile:  fr.RelativePath,
					Date:        tr.Date,
					Amount:      tr.Amount,
					Description: tr.Description,
					Confidence:  tr.Confidence,
					FileIndex:   fi,
					TxIndex:     ti,
				},
			}
			groups[key] = append(groups[key], ref)
		}
	}

	// Find groups with >1 member (duplicates)
	// Track which (fileIdx, txIdx) to remove
	type removal struct{ fi, ti int }
	var removals []removal

	for key, refs := range groups {
		if len(refs) <= 1 {
			continue
		}

		// Keep the transaction with highest confidence, or from the file with more transactions
		best := 0
		for i := 1; i < len(refs); i++ {
			if refs[i].entry.Confidence > refs[best].entry.Confidence {
				best = i
			}
		}

		group := &DupGroup{
			Key:  key,
			Kept: refs[best].entry,
		}
		for i, ref := range refs {
			group.Transactions = append(group.Transactions, ref.entry)
			if i != best {
				removals = append(removals, removal{fi: ref.fileIdx, ti: ref.txIdx})
			}
		}
		result.DuplicateGroups = append(result.DuplicateGroups, group)
	}

	result.DuplicatesFound = len(removals)

	if len(removals) == 0 {
		result.TotalAfter = result.TotalBefore
		return result
	}

	// Sort removals by file then tx index descending so we can remove without shifting
	sort.Slice(removals, func(i, j int) bool {
		if removals[i].fi != removals[j].fi {
			return removals[i].fi < removals[j].fi
		}
		return removals[i].ti > removals[j].ti // descending within file
	})

	// Track removals per file to update extraction counts
	removedPerFile := make(map[int]int)

	// Remove duplicates from file results
	for _, r := range removals {
		fr := run.FileResults[r.fi]
		if r.ti < len(fr.TaxResults) {
			fr.TaxResults = append(fr.TaxResults[:r.ti], fr.TaxResults[r.ti+1:]...)
			removedPerFile[r.fi]++
		}
	}

	// Update extraction transaction counts to match
	for fi, removed := range removedPerFile {
		fr := run.FileResults[fi]
		if fr.Extraction != nil {
			fr.Extraction.TransactionCount -= removed
			if fr.Extraction.TransactionCount < 0 {
				fr.Extraction.TransactionCount = 0
			}
		}
	}

	// Recount
	for _, fr := range run.FileResults {
		result.TotalAfter += len(fr.TaxResults)
	}

	// Update summary
	run.Summary = ComputeSummary(run.FileResults)

	log.Printf("[mleval:dedup] removed %d duplicates (%d groups), %d -> %d transactions",
		result.DuplicatesFound, len(result.DuplicateGroups), result.TotalBefore, result.TotalAfter)

	return result
}

// dedupKey creates a canonical key for matching duplicate transactions.
// Uses date + amount (rounded to cents) + normalized description prefix.
func dedupKey(date string, amount float64, description string) string {
	// Round amount to cents
	cents := math.Round(amount * 100)
	// Normalize description: lowercase, take first 30 chars, collapse whitespace
	desc := strings.ToLower(strings.TrimSpace(description))
	desc = strings.Join(strings.Fields(desc), " ")
	if len(desc) > 30 {
		desc = desc[:30]
	}
	return fmt.Sprintf("%s|%.0f|%s", date, cents, desc)
}

// detectOverlaps finds pairs of statement files whose date ranges overlap.
func detectOverlaps(files []*FileResult) []*OverlapPair {
	type period struct {
		file  string
		start string
		end   string
	}

	var periods []period
	for _, fr := range files {
		if fr.Category != "statement" || fr.Extraction == nil || fr.Extraction.StatementMetadata == nil {
			continue
		}
		meta := fr.Extraction.StatementMetadata
		if meta.PeriodStart != "" && meta.PeriodEnd != "" {
			periods = append(periods, period{
				file:  fr.RelativePath,
				start: meta.PeriodStart,
				end:   meta.PeriodEnd,
			})
		}
	}

	var pairs []*OverlapPair
	for i := 0; i < len(periods); i++ {
		for j := i + 1; j < len(periods); j++ {
			// Simple string-based date comparison (ISO format sorts correctly)
			overlapStart := max(periods[i].start, periods[j].start)
			overlapEnd := min(periods[i].end, periods[j].end)
			if overlapStart <= overlapEnd {
				pairs = append(pairs, &OverlapPair{
					FileA: periods[i].file,
					FileB: periods[j].file,
				})
			}
		}
	}
	return pairs
}
