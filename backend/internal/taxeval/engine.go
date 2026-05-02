package taxeval

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/extraction"
)

// EngineConfig holds configuration for the eval engine.
type EngineConfig struct {
	DatasetPath  string
	Method       string // "gemini" or "self-hosted"
	Occupation   string
	Concurrency  int
	GeminiKey    string
	MLServiceURL string
}

// Engine orchestrates the full tax eval pipeline.
type Engine struct {
	cfg         EngineConfig
	extractor   extraction.Extractor
	taxPipeline *extraction.TaxClassificationPipeline
	costTracker *CostTracker
}

// NewEngine creates a new eval engine.
func NewEngine(cfg EngineConfig) (*Engine, error) {
	if cfg.Concurrency <= 0 {
		cfg.Concurrency = 3
	}
	if cfg.Occupation == "" {
		cfg.Occupation = "employee"
	}

	// Create extraction service
	extractCfg := extraction.Config{
		GeminiAPIKey:     cfg.GeminiKey,
		MLServiceURL:     cfg.MLServiceURL,
		EnableML:         cfg.MLServiceURL != "",
		EnableValidation: cfg.GeminiKey != "",
	}
	extractor := extraction.NewExtractionService(extractCfg)

	// Create tax classification pipeline
	taxPipeline := extraction.NewTaxClassificationPipeline(cfg.GeminiKey)

	return &Engine{
		cfg:         cfg,
		extractor:   extractor,
		taxPipeline: taxPipeline,
		costTracker: NewCostTracker(),
	}, nil
}

// Run processes all files in the dataset and returns the full eval run result.
func (e *Engine) Run(ctx context.Context) (*EvalRun, error) {
	start := time.Now()

	// Resolve symlinks once and use the resolved path everywhere so that
	// filepath.Rel works correctly when computing relative paths.
	resolvedDataset, err := filepath.EvalSymlinks(e.cfg.DatasetPath)
	if err != nil {
		return nil, fmt.Errorf("resolve dataset path: %w", err)
	}
	files, err := discoverFiles(resolvedDataset)
	if err != nil {
		return nil, fmt.Errorf("discover files: %w", err)
	}
	if len(files) == 0 {
		return nil, fmt.Errorf("no PDF files found in %s", e.cfg.DatasetPath)
	}
	log.Printf("[taxeval] found %d PDF files in %s", len(files), e.cfg.DatasetPath)

	// Parse extraction method
	method := parseMethod(e.cfg.Method)

	// Create runner
	runner := NewFileRunner(e.extractor, e.taxPipeline, e.costTracker, method, e.cfg.Occupation)

	// Process files with concurrency
	results := e.processFiles(ctx, runner, files, resolvedDataset)

	run := &EvalRun{
		ID:          uuid.New().String(),
		StartedAt:   start,
		CompletedAt: time.Now(),
		DurationMs:  time.Since(start).Milliseconds(),
		DatasetPath: e.cfg.DatasetPath,
		Method:      e.cfg.Method,
		Occupation:  e.cfg.Occupation,
		Concurrency: e.cfg.Concurrency,
		FileResults: results,
		Summary:     computeSummary(results),
		CostSummary: e.costTracker.Summary(),
	}

	log.Printf("[taxeval] complete: %d files, %d transactions, %d deductible, $%.4f estimated cost, %dms",
		run.Summary.TotalFiles,
		run.Summary.TotalTransactions,
		run.Summary.TotalDeductible,
		run.CostSummary.EstimatedCostUSD,
		run.DurationMs,
	)

	return run, nil
}

// processFiles runs the pipeline on all files with bounded concurrency.
func (e *Engine) processFiles(ctx context.Context, runner *FileRunner, files []string, basePath string) []*FileResult {
	results := make([]*FileResult, len(files))
	sem := make(chan struct{}, e.cfg.Concurrency)
	var wg sync.WaitGroup

	for i, f := range files {
		wg.Add(1)
		go func(idx int, path string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			results[idx] = runner.ProcessFile(ctx, path, basePath)
		}(i, f)
	}

	wg.Wait()
	return results
}

// discoverFiles walks the dataset directory and returns all PDF file paths.
// Expects an already-resolved (symlink-free) root path.
func discoverFiles(root string) ([]string, error) {
	var files []string
	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}
		ext := strings.ToLower(filepath.Ext(path))
		if ext == ".pdf" {
			files = append(files, path)
		}
		return nil
	})
	return files, err
}

// parseMethod converts a string method name to a protobuf ExtractionMethod.
func parseMethod(method string) pfinancev1.ExtractionMethod {
	switch strings.ToLower(method) {
	case "gemini":
		return pfinancev1.ExtractionMethod_EXTRACTION_METHOD_GEMINI
	case "self-hosted", "selfhosted", "ml":
		return pfinancev1.ExtractionMethod_EXTRACTION_METHOD_SELF_HOSTED
	default:
		return pfinancev1.ExtractionMethod_EXTRACTION_METHOD_GEMINI
	}
}

// computeSummary aggregates metrics across all file results.
func computeSummary(results []*FileResult) *RunSummary {
	s := &RunSummary{
		TotalFiles: len(results),
	}

	var totalConf float64
	var confCount int

	for _, r := range results {
		if r.Error != "" {
			s.FailedFiles++
			continue
		}
		s.SuccessfulFiles++
		s.TotalProcessingMs += r.ProcessingMs

		if r.Extraction != nil {
			s.TotalTransactions += r.Extraction.TransactionCount
			s.TotalRejected += r.Extraction.RejectedCount
			if r.Extraction.OverallConfidence > 0 {
				totalConf += r.Extraction.OverallConfidence
				confCount++
			}
		}

		for _, tr := range r.TaxResults {
			if tr.IsDeductible {
				s.TotalDeductible++
			} else {
				s.TotalNonDeductible++
			}
		}
	}

	if confCount > 0 {
		s.AvgConfidence = totalConf / float64(confCount)
	}
	if s.SuccessfulFiles > 0 {
		s.AvgProcessingMs = float64(s.TotalProcessingMs) / float64(s.SuccessfulFiles)
	}

	return s
}
