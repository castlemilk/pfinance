package extraction

import (
	"context"
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

	// Skip chunking for PDFs below the threshold — fewer pages than the chunk
	// boundary means we'd produce a single chunk anyway, with extra overhead.
	pageCount := CountPDFPagesAccurate(documentData)
	if pageCount < cfg.pageThreshold {
		return v.extractWithGeminiRetryAdvanced(ctx, documentData, maxOutputTokens)
	}

	chunks, err := ChunkPDF(documentData, cfg.pagesPerChunk)
	if err != nil {
		// Chunking failed — log and fall back to the single-shot pipeline so
		// we don't make the user's situation worse than it already is.
		log.Printf("[gemini-chunked] PDF chunking failed (%v) — falling back to single-shot", err)
		return v.extractWithGeminiRetryAdvanced(ctx, documentData, maxOutputTokens)
	}
	if len(chunks) <= 1 {
		return v.extractWithGeminiRetryAdvanced(ctx, documentData, maxOutputTokens)
	}

	// Total page count across all chunks (last chunk's PageEnd) — used as
	// chunk context to tell Gemini "you're seeing pages X-Y of Z".
	totalPages := chunks[len(chunks)-1].PageEnd

	log.Printf("[gemini-chunked] processing %d chunk(s) of up to %d page(s) each, parallelism=%d",
		len(chunks), cfg.pagesPerChunk, cfg.parallelism)
	startedAt := time.Now()

	// Per-chunk wall-clock budget. Default 120s lets Gemini retry once and
	// still leave room for slower chunks; tunable via env.
	perChunkTimeout := time.Duration(envInt("GEMINI_CHUNK_TIMEOUT_SECONDS", 120)) * time.Second

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

			perChunkTokens := perChunkOutputTokens(ch.PageEnd - ch.PageStart + 1)
			chunkCtxInfo := &chunkInfo{
				PageStart:  ch.PageStart,
				PageEnd:    ch.PageEnd,
				TotalPages: totalPages,
			}
			resp, err := WithRetry(chunkCtx, chunkRetry, func(c context.Context) (*GeminiResponse, error) {
				return v.extractWithGeminiOpts(c, ch.Data, geminiExtractOpts{
					MaxOutputTokens: perChunkTokens,
					Chunk:           chunkCtxInfo,
				})
			})
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

	// Count how many chunks succeeded.
	successCount := 0
	for _, r := range responses {
		if r != nil {
			successCount++
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
	log.Printf("[gemini-chunked] merged %d/%d successful chunks into %d transactions in %s",
		successCount, len(chunks), len(merged.Transactions), time.Since(startedAt))
	return merged, nil
}

// perChunkOutputTokens scales the per-chunk token budget by chunk size.
// Soft cap ~1500 tokens per page, never below 4k or above 16k.
func perChunkOutputTokens(chunkPages int) int {
	per := chunkPages * 1500
	if per < 4096 {
		per = 4096
	}
	if per > 16384 {
		per = 16384
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
