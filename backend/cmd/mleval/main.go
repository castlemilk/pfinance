package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strings"

	"github.com/castlemilk/pfinance/backend/internal/mleval"
	"github.com/castlemilk/pfinance/backend/internal/mleval/evaluators"
)

func main() {
	evaluator := flag.String("evaluator", "", "Evaluator to run: tax, statement, receipt, or 'all' (comma-separated for multiple)")
	dataset := flag.String("dataset", "./tax25", "Path to the document dataset directory")
	method := flag.String("method", "gemini", "Extraction method: gemini or self-hosted")
	output := flag.String("output", "", "Write raw results JSON to this path")
	report := flag.String("report", "", "Write tax report JSON to this path (tax evaluator only)")
	accuracyOut := flag.String("accuracy", "", "Write accuracy report JSON to this path")
	groundTruth := flag.String("ground-truth", "", "Path to ground truth directory (defaults to dataset dir)")
	fy := flag.String("fy", "2024-25", "Financial year for the tax report")
	occupation := flag.String("occupation", "software engineer", "Occupation for tax classification context")
	concurrency := flag.Int("concurrency", 3, "Number of files to process in parallel")
	geminiKey := flag.String("gemini-key", "", "Gemini API key (defaults to GEMINI_API_KEY env)")
	mlURL := flag.String("ml-url", "", "ML service URL (defaults to ML_SERVICE_URL env)")
	scoreOnly := flag.Bool("score-only", false, "Skip extraction; load results from --output and score against ground truth")
	listEvaluators := flag.Bool("list", false, "List available evaluators and exit")

	flag.Parse()

	// Resolve API keys from env if not set via flags
	if *geminiKey == "" {
		*geminiKey = os.Getenv("GEMINI_API_KEY")
	}
	if *mlURL == "" {
		*mlURL = os.Getenv("ML_SERVICE_URL")
	}

	// Register all evaluators
	registerEvaluators(*geminiKey, *mlURL, *method, *occupation)

	if *listEvaluators {
		fmt.Println("Available evaluators:")
		for _, name := range mleval.ListEvaluators() {
			e, _ := mleval.GetEvaluator(name)
			fmt.Printf("  %-12s %s\n", name, e.Description())
		}
		return
	}

	// Score-only mode
	if *scoreOnly {
		if *output == "" {
			fmt.Fprintln(os.Stderr, "error: --score-only requires --output pointing to existing results JSON")
			os.Exit(1)
		}
		run, err := mleval.LoadResults(*output)
		if err != nil {
			log.Fatalf("failed to load results: %v", err)
		}

		gtDir := *groundTruth
		if gtDir == "" {
			gtDir = *dataset
		}
		gtSet, err := mleval.LoadGroundTruth(gtDir)
		if err != nil {
			log.Fatalf("failed to load ground truth: %v", err)
		}
		if gtSet.Count() == 0 {
			fmt.Fprintln(os.Stderr, "warning: no ground truth files found in", gtDir)
			os.Exit(0)
		}
		log.Printf("[mleval] loaded %d ground truth files", gtSet.Count())

		// Use the evaluator's scorer if available, otherwise use default
		evalName := run.EvaluatorName
		if evalName == "" {
			evalName = "tax" // backward compatibility
		}
		e, ok := mleval.GetEvaluator(evalName)
		if !ok {
			log.Printf("[mleval] evaluator %q not found, using default scorer", evalName)
			acc := mleval.ScoreRun(run, gtSet)
			mleval.PrintAccuracyReport(acc)
			writeAccuracy(acc, *accuracyOut)
			return
		}

		acc := e.Score(run, gtSet)
		mleval.PrintAccuracyReport(acc)
		writeAccuracy(acc, *accuracyOut)
		return
	}

	// Determine which evaluators to run
	evalNames := parseEvaluatorNames(*evaluator)
	if len(evalNames) == 0 {
		fmt.Fprintln(os.Stderr, "error: --evaluator is required (use 'all', or comma-separated: tax,statement,receipt)")
		fmt.Fprintln(os.Stderr, "  use --list to see available evaluators")
		os.Exit(1)
	}

	if *geminiKey == "" && *method == "gemini" {
		fmt.Fprintln(os.Stderr, "error: GEMINI_API_KEY must be set (via env or --gemini-key)")
		os.Exit(1)
	}

	engine, err := mleval.NewEngine(mleval.EngineConfig{
		DatasetPath:  *dataset,
		Evaluators:   evalNames,
		Method:       *method,
		Occupation:   *occupation,
		Concurrency:  *concurrency,
		GeminiKey:    *geminiKey,
		MLServiceURL: *mlURL,
	})
	if err != nil {
		log.Fatalf("failed to create engine: %v", err)
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt)
	defer cancel()

	results, err := engine.RunAll(ctx)
	if err != nil {
		log.Fatalf("eval run failed: %v", err)
	}

	// Print results for each evaluator
	for name, run := range results {
		// Attach cost summary from evaluator if available
		if e, ok := mleval.GetEvaluator(name); ok {
			if tc, hasTracker := e.(interface{ CostTracker() *mleval.CostTracker }); hasTracker {
				run.CostSummary = tc.CostTracker().Summary()
			}
		}

		mleval.PrintSummary(run)

		// Tax report (tax evaluator only)
		if name == "tax" && *report != "" {
			taxReport := mleval.GenerateTaxReport(run, *fy)
			mleval.PrintTaxReport(taxReport)
			if err := mleval.WriteJSON(*report, taxReport); err != nil {
				log.Fatalf("failed to write tax report: %v", err)
			}
			fmt.Printf("Tax report written to %s\n", *report)
		}

		// Write raw results
		if *output != "" {
			outPath := *output
			if len(results) > 1 {
				// Multiple evaluators: append evaluator name to filename
				ext := ".json"
				base := strings.TrimSuffix(outPath, ext)
				outPath = fmt.Sprintf("%s-%s%s", base, name, ext)
			}
			if err := mleval.WriteJSON(outPath, run); err != nil {
				log.Fatalf("failed to write results: %v", err)
			}
			fmt.Printf("\nResults written to %s\n", outPath)
		}

		// Accuracy scoring
		gtDir := *groundTruth
		if gtDir == "" {
			gtDir = *dataset
		}
		gtSet, err := mleval.LoadGroundTruth(gtDir)
		if err != nil {
			log.Printf("[mleval] warning: could not load ground truth: %v", err)
		} else if gtSet.Count() > 0 {
			log.Printf("[mleval:%s] scoring against %d ground truth files", name, gtSet.Count())
			e, _ := mleval.GetEvaluator(name)
			acc := e.Score(run, gtSet)
			mleval.PrintAccuracyReport(acc)

			if *accuracyOut != "" {
				accPath := *accuracyOut
				if len(results) > 1 {
					ext := ".json"
					base := strings.TrimSuffix(accPath, ext)
					accPath = fmt.Sprintf("%s-%s%s", base, name, ext)
				}
				writeAccuracy(acc, accPath)
			}
		}
	}
}

func registerEvaluators(geminiKey, mlURL, method, occupation string) {
	evaluators.NewTaxEvaluator(evaluators.TaxEvaluatorConfig{
		GeminiKey:    geminiKey,
		MLServiceURL: mlURL,
		Method:       method,
		Occupation:   occupation,
	})

	evaluators.NewStatementEvaluator(evaluators.StatementEvaluatorConfig{
		GeminiKey:    geminiKey,
		MLServiceURL: mlURL,
		Method:       method,
	})

	evaluators.NewReceiptEvaluator(evaluators.ReceiptEvaluatorConfig{
		GeminiKey:    geminiKey,
		MLServiceURL: mlURL,
		Method:       method,
	})
}

func parseEvaluatorNames(input string) []string {
	if input == "" {
		return nil
	}
	if strings.ToLower(input) == "all" {
		return mleval.ListEvaluators()
	}
	var names []string
	for _, name := range strings.Split(input, ",") {
		name = strings.TrimSpace(name)
		if name != "" {
			names = append(names, name)
		}
	}
	return names
}

func writeAccuracy(acc *mleval.AccuracyReport, path string) {
	if path == "" {
		return
	}
	if err := mleval.WriteJSON(path, acc); err != nil {
		log.Fatalf("failed to write accuracy report: %v", err)
	}
	fmt.Printf("Accuracy report written to %s\n", path)
}
