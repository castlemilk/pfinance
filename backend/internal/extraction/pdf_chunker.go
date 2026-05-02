package extraction

import (
	"bytes"
	"fmt"
	"io"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
)

// PDFChunk is a contiguous page range carved out of a larger PDF, kept as a
// standalone valid PDF document.
type PDFChunk struct {
	// PageStart is the 1-indexed first page in the original PDF.
	PageStart int
	// PageEnd is the 1-indexed last page (inclusive) in the original PDF.
	PageEnd int
	// Data is the new PDF containing only [PageStart, PageEnd].
	Data []byte
}

// ChunkPDF splits a PDF into chunks of up to pagesPerChunk consecutive pages.
// Returns the original PDF as a single chunk if pagesPerChunk <= 0 or the PDF
// has fewer pages than the chunk size. Each chunk is itself a valid PDF.
//
// Wrapped in a recover() so pdfcpu panics on malformed PDFs surface as errors
// rather than crashing the request handler.
func ChunkPDF(data []byte, pagesPerChunk int) (chunks []PDFChunk, err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("pdfcpu panicked while chunking: %v", r)
			chunks = nil
		}
	}()

	if len(data) == 0 {
		return nil, fmt.Errorf("empty pdf data")
	}
	if pagesPerChunk <= 0 {
		return []PDFChunk{{PageStart: 1, PageEnd: 0, Data: data}}, nil
	}

	conf := pdfcpuRelaxedConfig()

	pageCount, err := api.PageCount(bytes.NewReader(data), conf)
	if err != nil {
		return nil, fmt.Errorf("count pages: %w", err)
	}
	if pageCount <= pagesPerChunk {
		return []PDFChunk{{PageStart: 1, PageEnd: pageCount, Data: data}}, nil
	}

	chunks = make([]PDFChunk, 0, (pageCount+pagesPerChunk-1)/pagesPerChunk)
	for start := 1; start <= pageCount; start += pagesPerChunk {
		end := start + pagesPerChunk - 1
		if end > pageCount {
			end = pageCount
		}
		out, err := trimToRange(data, start, end, conf)
		if err != nil {
			return nil, fmt.Errorf("extract pages %d-%d: %w", start, end, err)
		}
		chunks = append(chunks, PDFChunk{
			PageStart: start,
			PageEnd:   end,
			Data:      out,
		})
	}
	return chunks, nil
}

// pdfcpuRelaxedConfig returns a pdfcpu config tuned for slightly malformed
// but still-readable bank-statement PDFs (a common case in the wild).
func pdfcpuRelaxedConfig() *model.Configuration {
	conf := model.NewDefaultConfiguration()
	conf.ValidationMode = model.ValidationRelaxed
	return conf
}

// trimToRange writes a new PDF containing pages [start..end] of src.
func trimToRange(src []byte, start, end int, conf *model.Configuration) ([]byte, error) {
	selection := []string{fmt.Sprintf("%d-%d", start, end)}
	var buf bytes.Buffer
	rs := bytes.NewReader(src)
	if err := api.Trim(rs, &buf, selection, conf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// ensure io.ReadSeeker is the interface pdfcpu expects (defensive — if pdfcpu
// upgrades and changes the signature, this file is the canary that catches it).
var _ io.ReadSeeker = (*bytes.Reader)(nil)
