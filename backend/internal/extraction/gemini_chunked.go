package extraction

import (
	"context"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"golang.org/x/sync/errgroup"
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

	log.Printf("[gemini-chunked] processing %d chunk(s) of up to %d page(s) each, parallelism=%d",
		len(chunks), cfg.pagesPerChunk, cfg.parallelism)
	startedAt := time.Now()

	responses := make([]*GeminiResponse, len(chunks))

	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(cfg.parallelism)

	for i := range chunks {
		i := i
		ch := chunks[i]
		g.Go(func() error {
			perChunkTokens := perChunkOutputTokens(ch.PageEnd - ch.PageStart + 1)
			resp, err := v.extractWithGeminiRetryAdvanced(gctx, ch.Data, perChunkTokens)
			if err != nil {
				log.Printf("[gemini-chunked] chunk %d (pages %d-%d) failed: %v",
					i, ch.PageStart, ch.PageEnd, err)
				return fmt.Errorf("chunk %d (pages %d-%d): %w", i, ch.PageStart, ch.PageEnd, err)
			}
			responses[i] = resp
			log.Printf("[gemini-chunked] chunk %d (pages %d-%d) → %d transactions",
				i, ch.PageStart, ch.PageEnd, len(resp.Transactions))
			return nil
		})
	}

	if err := g.Wait(); err != nil {
		return nil, fmt.Errorf("chunked gemini extraction: %w", err)
	}

	merged := mergeChunkedResponses(responses)
	log.Printf("[gemini-chunked] merged %d chunks into %d transactions in %s",
		len(chunks), len(merged.Transactions), time.Since(startedAt))
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

// mergeChunkedResponses combines per-chunk Gemini responses into one, applying
// boundary dedup. Two transactions are considered duplicates when they share
// the same date, amount (rounded to cents), and a 16-char prefix of the
// (case-insensitive, trimmed) description. Order is preserved by chunk index
// then in-chunk position. The first non-nil chunk's metadata is used, with
// transaction_count overwritten to the merged total.
func mergeChunkedResponses(responses []*GeminiResponse) *GeminiResponse {
	merged := &GeminiResponse{}
	seen := make(map[string]struct{})
	var firstMeta *GeminiMetadata

	for _, r := range responses {
		if r == nil {
			continue
		}
		if firstMeta == nil && r.Metadata != nil {
			firstMeta = r.Metadata
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

	if firstMeta != nil {
		firstMeta.TransactionCount = len(merged.Transactions)
		merged.Metadata = firstMeta
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
