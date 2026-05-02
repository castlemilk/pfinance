package mleval

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
)

// EngineConfig holds configuration for the eval engine.
type EngineConfig struct {
	DatasetPath  string
	Evaluators   []string // Evaluator names to run (empty = all registered)
	Method       string   // "gemini" or "self-hosted"
	Occupation   string
	Concurrency  int
	GeminiKey    string
	MLServiceURL string
}

// Engine orchestrates the evaluation pipeline using pluggable evaluators.
type Engine struct {
	cfg        EngineConfig
	evaluators []Evaluator
}

// NewEngine creates a new eval engine with the specified evaluators.
func NewEngine(cfg EngineConfig) (*Engine, error) {
	if cfg.Concurrency <= 0 {
		cfg.Concurrency = 3
	}
	if cfg.Occupation == "" {
		cfg.Occupation = "employee"
	}

	var evaluators []Evaluator
	if len(cfg.Evaluators) == 0 {
		for _, e := range Registry {
			evaluators = append(evaluators, e)
		}
	} else {
		for _, name := range cfg.Evaluators {
			e, ok := GetEvaluator(name)
			if !ok {
				return nil, fmt.Errorf("unknown evaluator: %s (available: %v)", name, ListEvaluators())
			}
			evaluators = append(evaluators, e)
		}
	}

	if len(evaluators) == 0 {
		return nil, fmt.Errorf("no evaluators registered")
	}

	return &Engine{
		cfg:        cfg,
		evaluators: evaluators,
	}, nil
}

// RunAll runs all configured evaluators and returns results keyed by evaluator name.
func (e *Engine) RunAll(ctx context.Context) (map[string]*EvalRun, error) {
	results := make(map[string]*EvalRun)
	for _, eval := range e.evaluators {
		run, err := e.RunEvaluator(ctx, eval)
		if err != nil {
			return results, fmt.Errorf("evaluator %s: %w", eval.Name(), err)
		}
		results[eval.Name()] = run
	}
	return results, nil
}

// RunEvaluator runs a single evaluator against the dataset.
func (e *Engine) RunEvaluator(ctx context.Context, eval Evaluator) (*EvalRun, error) {
	start := time.Now()

	resolvedDataset, err := filepath.EvalSymlinks(e.cfg.DatasetPath)
	if err != nil {
		return nil, fmt.Errorf("resolve dataset path: %w", err)
	}

	files, err := discoverFiles(resolvedDataset, eval.FileExtensions())
	if err != nil {
		return nil, fmt.Errorf("discover files: %w", err)
	}
	if len(files) == 0 {
		return nil, fmt.Errorf("no matching files found in %s for evaluator %s", e.cfg.DatasetPath, eval.Name())
	}
	log.Printf("[mleval:%s] found %d files in %s", eval.Name(), len(files), e.cfg.DatasetPath)

	results := e.processFiles(ctx, eval, files, resolvedDataset)

	run := &EvalRun{
		ID:            uuid.New().String(),
		EvaluatorName: eval.Name(),
		StartedAt:     start,
		CompletedAt:   time.Now(),
		DurationMs:    time.Since(start).Milliseconds(),
		DatasetPath:   e.cfg.DatasetPath,
		Method:        e.cfg.Method,
		Occupation:    e.cfg.Occupation,
		Concurrency:   e.cfg.Concurrency,
		FileResults:   results,
		Summary:       ComputeSummary(results),
	}

	log.Printf("[mleval:%s] complete: %d files, %d transactions, %dms",
		eval.Name(),
		run.Summary.TotalFiles,
		run.Summary.TotalTransactions,
		run.DurationMs,
	)

	return run, nil
}

// processFiles runs the evaluator on all files with bounded concurrency and retries.
func (e *Engine) processFiles(ctx context.Context, eval Evaluator, files []string, basePath string) []*FileResult {
	results := make([]*FileResult, len(files))
	sem := make(chan struct{}, e.cfg.Concurrency)
	var wg sync.WaitGroup

	for i, f := range files {
		wg.Add(1)
		go func(idx int, path string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			results[idx] = e.processFileWithRetry(ctx, eval, path, basePath)
		}(i, f)
	}

	wg.Wait()
	return results
}

// processFileWithRetry wraps ProcessFile with retry logic for transient errors.
func (e *Engine) processFileWithRetry(ctx context.Context, eval Evaluator, filePath, basePath string) *FileResult {
	maxRetries := 2
	backoff := []time.Duration{1 * time.Second, 3 * time.Second}

	for attempt := 0; attempt <= maxRetries; attempt++ {
		result := eval.ProcessFile(ctx, filePath, basePath)

		// Success or non-retryable error
		if result.Error == "" || !isTransientError(result.Error) {
			return result
		}

		if attempt < maxRetries {
			delay := backoff[attempt]
			log.Printf("[mleval] retrying %s (attempt %d/%d) after %v: %s",
				filepath.Base(filePath), attempt+1, maxRetries, delay, result.Error)
			select {
			case <-ctx.Done():
				return result
			case <-time.After(delay):
			}
		}
	}
	// Shouldn't reach here, but return last result
	return eval.ProcessFile(ctx, filePath, basePath)
}

// isTransientError checks if an error message indicates a transient/retryable failure.
func isTransientError(errMsg string) bool {
	lower := strings.ToLower(errMsg)
	transientPatterns := []string{
		"timeout", "deadline exceeded", "connection refused",
		"429", "rate limit", "too many requests",
		"503", "service unavailable", "temporarily unavailable",
		"500", "internal server error",
		"eof", "connection reset",
	}
	for _, p := range transientPatterns {
		if strings.Contains(lower, p) {
			return true
		}
	}
	return false
}

// discoverFiles walks the dataset directory and returns files matching the given extensions.
func discoverFiles(root string, extensions []string) ([]string, error) {
	extSet := make(map[string]bool)
	for _, ext := range extensions {
		extSet[strings.ToLower(ext)] = true
	}

	var files []string
	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}
		ext := strings.ToLower(filepath.Ext(path))
		if extSet[ext] {
			files = append(files, path)
		}
		return nil
	})
	return files, err
}

// ComputeSummary aggregates metrics across all file results.
func ComputeSummary(results []*FileResult) *RunSummary {
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
