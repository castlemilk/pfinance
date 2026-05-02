package extraction

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Chunked-extraction defaults. Tunable via env vars at startup.
const (
	defaultChunkPagesPerChunk = 5
	defaultChunkParallelism   = 3
	// Below this page count we skip chunking — single-shot is faster and the
	// boundary-dedup tax isn't worth it.
	defaultChunkPageThreshold = 6
)

// chunkedConfig captures the runtime knobs for chunked Gemini extraction.
type chunkedConfig struct {
	pagesPerChunk int
	parallelism   int
	pageThreshold int
}

func loadChunkedConfig() chunkedConfig {
	return chunkedConfig{
		pagesPerChunk: envInt("GEMINI_CHUNK_PAGES", defaultChunkPagesPerChunk),
		parallelism:   envInt("GEMINI_CHUNK_PARALLELISM", defaultChunkParallelism),
		pageThreshold: envInt("GEMINI_CHUNK_THRESHOLD", defaultChunkPageThreshold),
	}
}

func envInt(name string, def int) int {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return def
	}
	v, err := strconv.Atoi(raw)
	if err != nil || v <= 0 {
		return def
	}
	return v
}

// extractWithGeminiChunked is the chunked counterpart to
// extractWithGeminiRetryAdvanced. It splits the PDF into page-range chunks,
// runs them in parallel, and merges the results — eliminating the single-call
// timeout / token-truncation cliff that 20-page statements hit when sent in
// one shot.
//
// For non-PDFs and small PDFs it falls through to the existing single-shot
// path, so callers don't need to know whether chunking applied.
func (v *ValidationService) extractWithGeminiChunked(
	ctx context.Context,
	documentData []byte,
	maxOutputTokens int,
) (*GeminiResponse, error) {
	cfg := loadChunkedConfig()

	// Non-PDFs: nothing to chunk. Single-shot.
	if detectMimeType(documentData) != "application/pdf" {
		return v.extractWithGeminiRetryAdvanced(ctx, documentData, maxOutputTokens)
	}

	// Skip chunking ONLY when we know the PDF is small. When pageCount is 0
	// it means CountPDFPagesAccurate (ledongthuc/pdf) panicked or failed —
	// for malformed PDFs, pdfcpu is often more tolerant, so let ChunkPDF have
	// a go. If chunking returns ≤1 chunk we'll fall back to single-shot.
	pageCount := CountPDFPagesAccurate(documentData)
	if pageCount > 0 && pageCount < cfg.pageThreshold {
		return v.extractWithGeminiRetryAdvanced(ctx, documentData, maxOutputTokens)
	}
	if pageCount == 0 {
		log.Printf("[gemini-chunked] page count unknown (likely malformed PDF); trying pdfcpu chunking anyway")
	}

	chunks, err := ChunkPDF(documentData, cfg.pagesPerChunk)
	if err != nil {
		// Chunking failed — log and fall back to single-shot with the highest
		// reasonable token budget so a multi-page statement isn't truncated
		// mid-JSON. This is the path malformed PDFs end up on when pdfcpu
		// also can't read the structure.
		log.Printf("[gemini-chunked] PDF chunking failed (%v) — falling back to single-shot with max tokens", err)
		return v.extractWithGeminiRetryAdvanced(ctx, documentData, maxFallbackTokens(maxOutputTokens))
	}
	if len(chunks) <= 1 {
		log.Printf("[gemini-chunked] only 1 chunk produced (pageCount=%d) — single-shot with max tokens", pageCount)
		return v.extractWithGeminiRetryAdvanced(ctx, documentData, maxFallbackTokens(maxOutputTokens))
	}

	// Total page count across all chunks (last chunk's PageEnd) — used as
	// chunk context to tell Gemini "you're seeing pages X-Y of Z".
	totalPages := chunks[len(chunks)-1].PageEnd

	log.Printf("[gemini-chunked] processing %d chunk(s) of up to %d page(s) each, parallelism=%d",
		len(chunks), cfg.pagesPerChunk, cfg.parallelism)
	startedAt := time.Now()

	// Per-chunk wall-clock budget. Default 180s leaves room for the
	// original attempt (~60-90s on dense 5-page chunks) PLUS adaptive
	// sub-chunking (parallel halves, another ~60-90s in the worst case).
	// Production logs showed the previous 120s budget was exhausted when
	// adaptive sub-splitting recursed on dense chunks.
	perChunkTimeout := time.Duration(envInt("GEMINI_CHUNK_TIMEOUT_SECONDS", 180)) * time.Second

	// Slimmer retry config for chunked calls — when one chunk fails we still
	// have N-1 other chunks; fail fast so we don't burn the whole 5-min Cloud
	// Run budget retrying a doomed chunk.
	chunkRetry := RetryConfig{
		MaxRetries:     1,
		InitialDelay:   500 * time.Millisecond,
		MaxDelay:       3 * time.Second,
		BackoffFactor:  2.0,
		JitterFraction: 0.2,
	}

	responses := make([]*GeminiResponse, len(chunks))
	errs := make([]error, len(chunks))

	// Manual semaphore so a single chunk failure doesn't cancel the others
	// (errgroup's auto-cancel would). We collect partial results: as long as
	// at least one chunk succeeds, the user gets transactions instead of an
	// "all methods failed" error.
	sem := make(chan struct{}, cfg.parallelism)
	var wg sync.WaitGroup

	for i := range chunks {
		i := i
		ch := chunks[i]
		wg.Add(1)
		sem <- struct{}{}
		go func() {
			defer wg.Done()
			defer func() { <-sem }()

			chunkCtx, cancel := context.WithTimeout(ctx, perChunkTimeout)
			defer cancel()

			resp, err := v.extractChunkAdaptive(chunkCtx, ch, totalPages, chunkRetry, 0)
			if err != nil {
				log.Printf("[gemini-chunked] chunk %d (pages %d-%d) failed: %v",
					i, ch.PageStart, ch.PageEnd, err)
				errs[i] = fmt.Errorf("chunk %d (pages %d-%d): %w", i, ch.PageStart, ch.PageEnd, err)
				return
			}
			responses[i] = resp
			log.Printf("[gemini-chunked] chunk %d (pages %d-%d) → %d transactions",
				i, ch.PageStart, ch.PageEnd, len(resp.Transactions))
		}()
	}
	wg.Wait()

	// Count how many chunks succeeded and collect per-chunk failure context
	// for the user-visible warning. Truncation gets a more actionable hint
	// than generic errors.
	successCount := 0
	var failedRanges []string
	var truncatedRanges []string
	for i, r := range responses {
		if r != nil {
			successCount++
			continue
		}
		ch := chunks[i]
		rangeStr := fmt.Sprintf("pages %d-%d", ch.PageStart, ch.PageEnd)
		if errs[i] != nil && errors.Is(errs[i], ErrTruncatedJSON) {
			truncatedRanges = append(truncatedRanges, rangeStr)
		} else {
			failedRanges = append(failedRanges, rangeStr)
		}
	}
	if successCount == 0 {
		// Every chunk failed — return the first error we saw.
		for _, e := range errs {
			if e != nil {
				return nil, fmt.Errorf("all %d chunks failed; first: %w", len(chunks), e)
			}
		}
		return nil, fmt.Errorf("all %d chunks failed (no error captured)", len(chunks))
	}

	merged := mergeChunkedResponses(responses)

	// User-visible warnings — attached to the merged response and
	// eventually surfaced via ExtractionResult.warnings on the wire.
	if len(truncatedRanges) > 0 {
		merged.Warnings = append(merged.Warnings, fmt.Sprintf(
			"Some pages had too many transactions to fit in one Gemini call and were skipped: %s. The remaining pages were extracted successfully. Consider splitting the PDF into smaller files.",
			strings.Join(truncatedRanges, ", "),
		))
	}
	if len(failedRanges) > 0 {
		merged.Warnings = append(merged.Warnings, fmt.Sprintf(
			"Some pages could not be extracted and were skipped: %s. The remaining pages were extracted successfully.",
			strings.Join(failedRanges, ", "),
		))
	}

	log.Printf("[gemini-chunked] merged %d/%d successful chunks into %d transactions in %s (failed=%d truncated=%d)",
		successCount, len(chunks), len(merged.Transactions), time.Since(startedAt),
		len(failedRanges), len(truncatedRanges))
	return merged, nil
}

// extractChunkAdaptive runs Gemini extraction on a chunk and, if the call
// fails specifically because Gemini truncated mid-JSON, recursively halves
// the page range and retries each half. This recovers chunks too dense to
// fit in the token budget without giving up the whole page range.
//
// Recursion is sequential (not parallel) to keep total wall time bounded
// by the parent chunkCtx — typical worst case is ~2-3 levels of halving
// for a heavily-loaded chunk, well inside 120s.
//
// Non-truncation errors short-circuit and propagate up unchanged so we
// don't waste retries on rate limits or schema mismatches.
//
// maxRecursionDepth is set to 4 because halving from 5 pages reaches
// single pages in ⌈log2(5)⌉ = 3 splits; one level of slack catches the
// rare case of a page so dense it truncates on its own.
const maxAdaptiveRecursion = 4

func (v *ValidationService) extractChunkAdaptive(
	ctx context.Context,
	ch PDFChunk,
	totalPages int,
	retryCfg RetryConfig,
	depth int,
) (*GeminiResponse, error) {
	pages := ch.PageEnd - ch.PageStart + 1
	tokens := perChunkOutputTokens(pages)
	resp, err := WithRetry(ctx, retryCfg, func(c context.Context) (*GeminiResponse, error) {
		return v.extractWithGeminiOpts(c, ch.Data, geminiExtractOpts{
			MaxOutputTokens: tokens,
			Chunk: &chunkInfo{
				PageStart:  ch.PageStart,
				PageEnd:    ch.PageEnd,
				TotalPages: totalPages,
			},
		})
	})
	if err == nil {
		return resp, nil
	}

	// Only adapt for truncation. Other errors (rate limits, schema rejects)
	// don't get better with smaller chunks.
	if !errors.Is(err, ErrTruncatedJSON) {
		return nil, err
	}
	// Stop conditions: single page can't be split further; depth budget hit.
	if pages <= 1 || depth >= maxAdaptiveRecursion {
		return nil, err
	}

	// Halve the chunk's page range and re-trim each half from the original
	// chunk's PDF data via pdfcpu. We use the chunk's own bytes (already a
	// valid sub-PDF) so each split halves the work cleanly.
	half := pages / 2
	leftEndAbs := ch.PageStart + half - 1
	leftCh, err := subTrim(ch, ch.PageStart, leftEndAbs)
	if err != nil {
		log.Printf("[gemini-chunked] could not sub-trim left half of pages %d-%d: %v",
			ch.PageStart, ch.PageEnd, err)
		return nil, err
	}
	rightCh, err := subTrim(ch, leftEndAbs+1, ch.PageEnd)
	if err != nil {
		log.Printf("[gemini-chunked] could not sub-trim right half of pages %d-%d: %v",
			ch.PageStart, ch.PageEnd, err)
		return nil, err
	}

	log.Printf("[gemini-chunked] chunk pages %d-%d truncated; sub-splitting into %d-%d and %d-%d (depth=%d)",
		ch.PageStart, ch.PageEnd, leftCh.PageStart, leftCh.PageEnd, rightCh.PageStart, rightCh.PageEnd, depth)

	// Run the two halves concurrently so total wall time stays bounded by
	// the slower half rather than the sum. Sequential sub-splits hit
	// "context deadline exceeded" in production when the parent attempt
	// already burned 60-80s of the 120s budget.
	var leftResp, rightResp *GeminiResponse
	var leftErr, rightErr error
	var subWg sync.WaitGroup
	subWg.Add(2)
	go func() {
		defer subWg.Done()
		leftResp, leftErr = v.extractChunkAdaptive(ctx, leftCh, totalPages, retryCfg, depth+1)
	}()
	go func() {
		defer subWg.Done()
		rightResp, rightErr = v.extractChunkAdaptive(ctx, rightCh, totalPages, retryCfg, depth+1)
	}()
	subWg.Wait()

	// If both halves fail, surface the more specific error. If only one
	// fails, keep the other half's transactions — partial success here is
	// better than dropping the whole parent chunk.
	if leftErr != nil && rightErr != nil {
		return nil, fmt.Errorf("both sub-halves failed: left=%w right=%v", leftErr, rightErr)
	}

	merged := mergeChunkedResponses([]*GeminiResponse{leftResp, rightResp})
	if leftErr != nil {
		merged.Warnings = append(merged.Warnings, fmt.Sprintf("sub-half pages %d-%d failed: %v", leftCh.PageStart, leftCh.PageEnd, leftErr))
	}
	if rightErr != nil {
		merged.Warnings = append(merged.Warnings, fmt.Sprintf("sub-half pages %d-%d failed: %v", rightCh.PageStart, rightCh.PageEnd, rightErr))
	}
	return merged, nil
}

// subTrim re-trims a sub-range from a parent chunk's PDF data. The parent
// chunk's PageStart/PageEnd are the absolute page numbers in the original
// document; pdfcpu's Trim, however, operates on local page indices in
// ch.Data. So we translate absolute → local before calling Trim, then
// stamp the absolute range back onto the result.
func subTrim(parent PDFChunk, absStart, absEnd int) (PDFChunk, error) {
	localStart := absStart - parent.PageStart + 1
	localEnd := absEnd - parent.PageStart + 1
	conf := pdfcpuRelaxedConfig()
	out, err := trimToRange(parent.Data, localStart, localEnd, conf)
	if err != nil {
		return PDFChunk{}, err
	}
	return PDFChunk{
		PageStart: absStart,
		PageEnd:   absEnd,
		Data:      out,
	}, nil
}

// maxFallbackTokens picks the output-token budget for the single-shot
// fallback path (used when chunking didn't fire). For a malformed or
// uncountable PDF we'd rather pay for max tokens than have Gemini truncate
// mid-JSON and trigger an unparseable response. If the caller passed a
// hint, respect it as the floor.
func maxFallbackTokens(callerHint int) int {
	const cap = 32768 // Gemini 2.0 Flash hard ceiling
	if callerHint <= 0 {
		return cap
	}
	if callerHint < cap {
		return cap
	}
	return callerHint
}

// perChunkOutputTokens scales the per-chunk token budget by chunk size.
//
// Empirically, dense bank statements run ~85–100 transactions per 5 pages
// at ~80 tokens each = 7000–8000 output tokens. The previous 1500/page
// budget sat right at that limit, so chunks with ≥95 rows truncated and
// the response failed to parse. Bumped to 2500/page (≈12.5k for a
// 5-page chunk) with a 32k ceiling matching Gemini 2.0 Flash's hard cap.
func perChunkOutputTokens(chunkPages int) int {
	per := chunkPages * 2500
	if per < 6144 {
		per = 6144
	}
	if per > 32768 {
		per = 32768
	}
	return per
}

// mergeChunkedResponses combines per-chunk Gemini responses into one. Each
// chunk represents a slice of pages from the same source PDF, so we:
//
//   - dedupe transactions on (date, amount-cents, description-prefix) so a
//     row that straddles a chunk boundary isn't counted twice
//   - preserve order: chunk index, then in-chunk position
//   - merge metadata across chunks: bank/account/currency from the first
//     chunk that supplied a non-empty value; period_start = MIN over chunks,
//     period_end = MAX over chunks (lexicographic on YYYY-MM-DD)
//   - set transaction_count to the merged total
func mergeChunkedResponses(responses []*GeminiResponse) *GeminiResponse {
	merged := &GeminiResponse{}
	seen := make(map[string]struct{})

	var (
		bankName   string
		accountID  string
		currency   string
		periodMin  string
		periodMax  string
		anyMetaSet bool
	)

	pickFirstNonEmpty := func(dst *string, src string) {
		if *dst == "" && strings.TrimSpace(src) != "" {
			*dst = strings.TrimSpace(src)
		}
	}

	for _, r := range responses {
		if r == nil {
			continue
		}
		if r.Metadata != nil {
			anyMetaSet = true
			pickFirstNonEmpty(&bankName, r.Metadata.BankName)
			pickFirstNonEmpty(&accountID, r.Metadata.AccountIdentifier)
			pickFirstNonEmpty(&currency, r.Metadata.Currency)
			if s := strings.TrimSpace(r.Metadata.PeriodStart); s != "" {
				if periodMin == "" || s < periodMin {
					periodMin = s
				}
			}
			if e := strings.TrimSpace(r.Metadata.PeriodEnd); e != "" {
				if periodMax == "" || e > periodMax {
					periodMax = e
				}
			}
		}
		for _, tx := range r.Transactions {
			key := dedupKey(tx)
			if _, dup := seen[key]; dup {
				continue
			}
			seen[key] = struct{}{}
			merged.Transactions = append(merged.Transactions, tx)
		}
	}

	if anyMetaSet {
		merged.Metadata = &GeminiMetadata{
			BankName:          bankName,
			AccountIdentifier: accountID,
			Currency:          currency,
			PeriodStart:       periodMin,
			PeriodEnd:         periodMax,
			TransactionCount:  len(merged.Transactions),
		}
	}
	return merged
}

func dedupKey(tx GeminiTransaction) string {
	desc := strings.TrimSpace(strings.ToLower(tx.Description))
	if len(desc) > 16 {
		desc = desc[:16]
	}
	cents := int64(tx.Amount*100 + 0.5)
	return fmt.Sprintf("%s|%d|%s", strings.TrimSpace(tx.Date), cents, desc)
}
