package service

import (
	"context"
	"fmt"
	"log"
	"os"
	"sync"
	"time"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"google.golang.org/protobuf/types/known/timestamppb"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/mleval"
	"github.com/castlemilk/pfinance/backend/internal/mleval/evaluators"
)

// taxEvalJobStore manages in-memory async tax eval jobs.
type taxEvalJobStore struct {
	mu   sync.RWMutex
	jobs map[string]*pfinancev1.TaxEvalJob
}

var evalJobs = &taxEvalJobStore{
	jobs: make(map[string]*pfinancev1.TaxEvalJob),
}

func (s *taxEvalJobStore) create(job *pfinancev1.TaxEvalJob) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.jobs[job.Id] = job
}

func (s *taxEvalJobStore) get(id string) (*pfinancev1.TaxEvalJob, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	job, ok := s.jobs[id]
	return job, ok
}

func (s *taxEvalJobStore) update(job *pfinancev1.TaxEvalJob) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.jobs[job.Id] = job
}

// RunTaxEval starts an async tax evaluation job.
func (s *FinanceService) RunTaxEval(
	ctx context.Context,
	req *connect.Request[pfinancev1.RunTaxEvalRequest],
) (*connect.Response[pfinancev1.RunTaxEvalResponse], error) {
	datasetPath := req.Msg.DatasetPath
	if datasetPath == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("dataset_path is required"))
	}

	// Verify dataset path exists
	info, err := os.Stat(datasetPath)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("dataset path not found: %s", datasetPath))
	}
	if !info.IsDir() {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("dataset path is not a directory: %s", datasetPath))
	}

	method := req.Msg.Method
	if method == "" {
		method = "gemini"
	}

	occupation := req.Msg.Occupation
	if occupation == "" {
		occupation = "employee"
	}

	concurrency := int(req.Msg.Concurrency)
	if concurrency <= 0 {
		concurrency = 3
	}

	jobID := fmt.Sprintf("taxeval_%s", uuid.New().String()[:8])

	job := &pfinancev1.TaxEvalJob{
		Id:              jobID,
		Status:          "processing",
		TotalFiles:      0,
		ProcessedFiles:  0,
		ProgressPercent: 0,
		CreatedAt:       timestamppb.Now(),
	}

	evalJobs.create(job)

	// Run in background using mleval engine
	go s.processTaxEval(jobID, datasetPath, method, occupation, concurrency)

	return connect.NewResponse(&pfinancev1.RunTaxEvalResponse{
		JobId: jobID,
	}), nil
}

// GetTaxEvalJob returns the status and results of a tax eval job.
func (s *FinanceService) GetTaxEvalJob(
	ctx context.Context,
	req *connect.Request[pfinancev1.GetTaxEvalJobRequest],
) (*connect.Response[pfinancev1.GetTaxEvalJobResponse], error) {
	if req.Msg.JobId == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("job_id is required"))
	}

	job, ok := evalJobs.get(req.Msg.JobId)
	if !ok {
		return nil, connect.NewError(connect.CodeNotFound, fmt.Errorf("job not found: %s", req.Msg.JobId))
	}

	return connect.NewResponse(&pfinancev1.GetTaxEvalJobResponse{
		Job: job,
	}), nil
}

// processTaxEval runs the mleval engine in the background using the tax evaluator.
func (s *FinanceService) processTaxEval(jobID, datasetPath, method, occupation string, concurrency int) {
	geminiKey := os.Getenv("GEMINI_API_KEY")
	mlServiceURL := os.Getenv("ML_SERVICE_URL")

	// Register the tax evaluator via mleval framework
	taxEval := evaluators.NewTaxEvaluator(evaluators.TaxEvaluatorConfig{
		GeminiKey:    geminiKey,
		MLServiceURL: mlServiceURL,
		Method:       method,
		Occupation:   occupation,
	})

	engine, err := mleval.NewEngine(mleval.EngineConfig{
		DatasetPath:  datasetPath,
		Evaluators:   []string{"tax"},
		Method:       method,
		Occupation:   occupation,
		Concurrency:  concurrency,
		GeminiKey:    geminiKey,
		MLServiceURL: mlServiceURL,
	})
	if err != nil {
		log.Printf("[mleval:tax] engine creation failed: %v", err)
		job, ok := evalJobs.get(jobID)
		if ok {
			job.Status = "failed"
			job.ErrorMessage = fmt.Sprintf("engine creation failed: %v", err)
			job.CompletedAt = timestamppb.Now()
			evalJobs.update(job)
		}
		return
	}

	start := time.Now()
	run, err := engine.RunEvaluator(context.Background(), taxEval)
	if err != nil {
		log.Printf("[mleval:tax] run failed: %v", err)
		job, ok := evalJobs.get(jobID)
		if ok {
			job.Status = "failed"
			job.ErrorMessage = fmt.Sprintf("eval run failed: %v", err)
			job.CompletedAt = timestamppb.Now()
			evalJobs.update(job)
		}
		return
	}

	// Attach cost summary
	run.CostSummary = taxEval.CostTracker().Summary()

	// Deduplicate overlapping transactions across statement files
	dedupResult := mleval.DeduplicateRun(run)
	if dedupResult.DuplicatesFound > 0 {
		log.Printf("[mleval:tax] dedup: removed %d duplicates across %d groups",
			dedupResult.DuplicatesFound, len(dedupResult.DuplicateGroups))
	}

	// Convert EvalRun to proto TaxEvalResult
	result := convertEvalRunToProto(run)

	job, ok := evalJobs.get(jobID)
	if !ok {
		return
	}

	// Run accuracy scoring if ground truth files exist
	gtSet, err := mleval.LoadGroundTruth(datasetPath)
	if err == nil && gtSet.Count() > 0 {
		log.Printf("[mleval:tax] scoring against %d ground truth files", gtSet.Count())
		acc := taxEval.Score(run, gtSet)
		result.Accuracy = convertAccuracyToProto(acc)
	}

	job.Status = "completed"
	job.TotalFiles = int32(run.Summary.TotalFiles)
	job.ProcessedFiles = int32(run.Summary.SuccessfulFiles + run.Summary.FailedFiles)
	job.ProgressPercent = 100
	job.CompletedAt = timestamppb.Now()
	job.Result = result

	evalJobs.update(job)

	log.Printf("[mleval:tax] job %s completed in %v: %d files, %d transactions, $%.4f cost",
		jobID, time.Since(start), run.Summary.TotalFiles, run.Summary.TotalTransactions, run.CostSummary.EstimatedCostUSD)
}

// convertEvalRunToProto converts an mleval.EvalRun to a proto TaxEvalResult.
func convertEvalRunToProto(run *mleval.EvalRun) *pfinancev1.TaxEvalResult {
	result := &pfinancev1.TaxEvalResult{
		DurationMs:         run.DurationMs,
		DatasetPath:        run.DatasetPath,
		Method:             run.Method,
		Occupation:         run.Occupation,
		Concurrency:        int32(run.Concurrency),
		TotalFiles:         int32(run.Summary.TotalFiles),
		SuccessfulFiles:    int32(run.Summary.SuccessfulFiles),
		FailedFiles:        int32(run.Summary.FailedFiles),
		TotalTransactions:  int32(run.Summary.TotalTransactions),
		TotalDeductible:    int32(run.Summary.TotalDeductible),
		TotalNonDeductible: int32(run.Summary.TotalNonDeductible),
		AvgConfidence:      run.Summary.AvgConfidence,
		AvgProcessingMs:    run.Summary.AvgProcessingMs,
	}

	if run.CostSummary != nil {
		result.TotalApiCalls = int32(run.CostSummary.TotalAPICalls)
		result.EstimatedCostUsd = run.CostSummary.EstimatedCostUSD
	}

	categoryMap := make(map[string]*pfinancev1.TaxEvalDeductionCategory)
	var totalExpenses, totalDeductions float64

	for _, fr := range run.FileResults {
		pfr := &pfinancev1.TaxEvalFileResult{
			Filename:      fr.Filename,
			RelativePath:  fr.RelativePath,
			Category:      fr.Category,
			FileSizeBytes: fr.FileSize,
			ProcessingMs:  fr.ProcessingMs,
			Error:         fr.Error,
		}
		if fr.Extraction != nil {
			pfr.TransactionCount = int32(fr.Extraction.TransactionCount)
			pfr.OverallConfidence = fr.Extraction.OverallConfidence
			pfr.DocumentType = fr.Extraction.DocumentType
		}

		for _, tr := range fr.TaxResults {
			item := convertTaxResultToProto(tr)
			pfr.TaxResults = append(pfr.TaxResults, item)
			totalExpenses += tr.Amount

			if tr.IsDeductible && tr.TaxCategory != "" {
				cat, ok := categoryMap[tr.TaxCategory]
				if !ok {
					cat = &pfinancev1.TaxEvalDeductionCategory{
						Code: tr.TaxCategory,
						Name: taxCategoryName(tr.TaxCategory),
					}
					categoryMap[tr.TaxCategory] = cat
				}
				cat.ItemCount++
				cat.TotalAmount += tr.Amount
				cat.DeductibleAmount += tr.DeductibleAmount
				cat.Items = append(cat.Items, item)
				totalDeductions += tr.DeductibleAmount
			}
		}

		result.FileResults = append(result.FileResults, pfr)
	}

	for _, cat := range categoryMap {
		result.Deductions = append(result.Deductions, cat)
	}

	result.TotalExpenses = totalExpenses
	result.TotalDeductionsAmount = totalDeductions

	return result
}

func convertTaxResultToProto(tr *mleval.TaxResult) *pfinancev1.TaxEvalItem {
	return &pfinancev1.TaxEvalItem{
		Description:       tr.Description,
		Amount:            tr.Amount,
		Date:              tr.Date,
		ExpenseCategory:   tr.Category,
		IsDeductible:      tr.IsDeductible,
		TaxCategory:       tr.TaxCategory,
		DeductiblePercent: tr.DeductiblePercent,
		DeductibleAmount:  tr.DeductibleAmount,
		Confidence:        tr.Confidence,
		Reasoning:         tr.Reasoning,
		Source:            tr.Source,
		SourceFile:        tr.SourceFile,
	}
}

// convertAccuracyToProto converts an mleval.AccuracyReport to a proto TaxEvalAccuracy.
func convertAccuracyToProto(acc *mleval.AccuracyReport) *pfinancev1.TaxEvalAccuracy {
	result := &pfinancev1.TaxEvalAccuracy{
		FilesWithGroundTruth: int32(acc.FilesWithGroundTruth),
		FilesEvaluated:       int32(acc.FilesEvaluated),
		Extraction: &pfinancev1.TaxEvalExtractionAccuracy{
			ExpectedTotal:  int32(acc.Extraction.ExpectedTotal),
			ExtractedTotal: int32(acc.Extraction.ExtractedTotal),
			MatchedCount:   int32(acc.Extraction.MatchedCount),
			Precision:      acc.Extraction.Precision,
			Recall:         acc.Extraction.Recall,
			F1:             acc.Extraction.F1,
		},
		Deductibility: &pfinancev1.TaxEvalClassAccuracy{
			Total:     int32(acc.Deductibility.Total),
			Correct:   int32(acc.Deductibility.Correct),
			Incorrect: int32(acc.Deductibility.Incorrect),
			Accuracy:  acc.Deductibility.Accuracy,
		},
		TaxCategory: &pfinancev1.TaxEvalClassAccuracy{
			Total:     int32(acc.TaxCategory.Total),
			Correct:   int32(acc.TaxCategory.Correct),
			Incorrect: int32(acc.TaxCategory.Incorrect),
			Accuracy:  acc.TaxCategory.Accuracy,
		},
		Amount: &pfinancev1.TaxEvalAmountAccuracy{
			Total:        int32(acc.AmountAccuracy.Total),
			ExactMatches: int32(acc.AmountAccuracy.ExactMatches),
			CloseMatches: int32(acc.AmountAccuracy.CloseMatches),
			MeanAbsError: acc.AmountAccuracy.MeanAbsError,
			MeanPctError: acc.AmountAccuracy.MeanPctError,
		},
	}

	for _, pf := range acc.PerFile {
		fa := &pfinancev1.TaxEvalFileAccuracy{
			Filename:              pf.Filename,
			RelativePath:          pf.RelativePath,
			ExpectedTransactions:  int32(pf.Expected),
			ExtractedTransactions: int32(pf.Extracted),
			Matched:               int32(pf.Matched),
		}
		if pf.Deductibility != nil {
			fa.Deductibility = &pfinancev1.TaxEvalClassAccuracy{
				Total:     int32(pf.Deductibility.Total),
				Correct:   int32(pf.Deductibility.Correct),
				Incorrect: int32(pf.Deductibility.Incorrect),
				Accuracy:  pf.Deductibility.Accuracy,
			}
		}
		if pf.TaxCategory != nil {
			fa.TaxCategory = &pfinancev1.TaxEvalClassAccuracy{
				Total:     int32(pf.TaxCategory.Total),
				Correct:   int32(pf.TaxCategory.Correct),
				Incorrect: int32(pf.TaxCategory.Incorrect),
				Accuracy:  pf.TaxCategory.Accuracy,
			}
		}
		result.PerFile = append(result.PerFile, fa)
	}

	return result
}

func taxCategoryName(code string) string {
	names := map[string]string{
		"D1":    "Work-related travel",
		"D2":    "Uniform, laundry, dry-cleaning",
		"D3":    "Self-education expenses",
		"D4":    "Other work-related expenses",
		"D5":    "Working from home",
		"D6":    "Car expenses",
		"D10":   "Cost of managing tax affairs",
		"D12":   "Income protection insurance",
		"D15":   "Gifts and donations",
		"Other": "Other deductions",
	}
	if name, ok := names[code]; ok {
		return name
	}
	return code
}
