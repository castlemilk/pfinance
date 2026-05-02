package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"

	"github.com/castlemilk/pfinance/backend/internal/taxeval"
)

func main() {
	dataset := flag.String("dataset", "./tax25", "Path to the document dataset directory")
	method := flag.String("method", "gemini", "Extraction method: gemini or self-hosted")
	output := flag.String("output", "", "Write raw results JSON to this path")
	report := flag.String("report", "", "Write tax report JSON to this path")
	accuracyOut := flag.String("accuracy", "", "Write accuracy report JSON to this path")
	groundTruth := flag.String("ground-truth", "", "Path to ground truth directory (defaults to dataset dir)")
	fy := flag.String("fy", "2024-25", "Financial year for the tax report (e.g., 2024-25)")
	occupation := flag.String("occupation", "software engineer", "Occupation for tax classification context")
	concurrency := flag.Int("concurrency", 3, "Number of files to process in parallel")
	geminiKey := flag.String("gemini-key", "", "Gemini API key (defaults to GEMINI_API_KEY env)")
	mlURL := flag.String("ml-url", "", "ML service URL (defaults to ML_SERVICE_URL env)")
	scoreOnly := flag.Bool("score-only", false, "Skip extraction; load results from --output and score against ground truth")

	flag.Parse()

	// Resolve API keys from env if not set via flags
	if *geminiKey == "" {
		*geminiKey = os.Getenv("GEMINI_API_KEY")
	}
	if *mlURL == "" {
		*mlURL = os.Getenv("ML_SERVICE_URL")
	}

	// Score-only mode: load existing results and run accuracy scoring
	if *scoreOnly {
		if *output == "" {
			fmt.Fprintln(os.Stderr, "error: --score-only requires --output pointing to existing results JSON")
			os.Exit(1)
		}
		run, err := taxeval.LoadResults(*output)
		if err != nil {
			log.Fatalf("failed to load results: %v", err)
		}

		gtDir := *groundTruth
		if gtDir == "" {
			gtDir = *dataset
		}
		gtSet, err := taxeval.LoadGroundTruth(gtDir)
		if err != nil {
			log.Fatalf("failed to load ground truth: %v", err)
		}
		if gtSet.Count() == 0 {
			fmt.Fprintln(os.Stderr, "warning: no ground truth files found in", gtDir)
			os.Exit(0)
		}
		log.Printf("[taxeval] loaded %d ground truth files", gtSet.Count())

		acc := taxeval.ScoreRun(run, gtSet)
		taxeval.PrintAccuracyReport(acc)

		if *accuracyOut != "" {
			if err := taxeval.WriteJSON(*accuracyOut, acc); err != nil {
				log.Fatalf("failed to write accuracy report: %v", err)
			}
			fmt.Printf("Accuracy report written to %s\n", *accuracyOut)
		}
		return
	}

	if *geminiKey == "" && *method == "gemini" {
		fmt.Fprintln(os.Stderr, "error: GEMINI_API_KEY must be set (via env or --gemini-key)")
		os.Exit(1)
	}

	// Create engine
	engine, err := taxeval.NewEngine(taxeval.EngineConfig{
		DatasetPath:  *dataset,
		Method:       *method,
		Occupation:   *occupation,
		Concurrency:  *concurrency,
		GeminiKey:    *geminiKey,
		MLServiceURL: *mlURL,
	})
	if err != nil {
		log.Fatalf("failed to create engine: %v", err)
	}

	// Run with cancellation support
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt)
	defer cancel()

	run, err := engine.Run(ctx)
	if err != nil {
		log.Fatalf("eval run failed: %v", err)
	}

	// Print summary
	taxeval.PrintSummary(run)

	// Generate and print tax report
	taxReport := taxeval.GenerateTaxReport(run, *fy)
	taxeval.PrintTaxReport(taxReport)

	// Write output files if requested
	if *output != "" {
		if err := taxeval.WriteJSON(*output, run); err != nil {
			log.Fatalf("failed to write results: %v", err)
		}
		fmt.Printf("\nResults written to %s\n", *output)
	}

	if *report != "" {
		if err := taxeval.WriteJSON(*report, taxReport); err != nil {
			log.Fatalf("failed to write tax report: %v", err)
		}
		fmt.Printf("Tax report written to %s\n", *report)
	}

	// Run accuracy scoring if ground truth is available
	gtDir := *groundTruth
	if gtDir == "" {
		gtDir = *dataset
	}
	gtSet, err := taxeval.LoadGroundTruth(gtDir)
	if err != nil {
		log.Printf("[taxeval] warning: could not load ground truth: %v", err)
	} else if gtSet.Count() > 0 {
		log.Printf("[taxeval] scoring against %d ground truth files", gtSet.Count())
		acc := taxeval.ScoreRun(run, gtSet)
		taxeval.PrintAccuracyReport(acc)

		if *accuracyOut != "" {
			if err := taxeval.WriteJSON(*accuracyOut, acc); err != nil {
				log.Fatalf("failed to write accuracy report: %v", err)
			}
			fmt.Printf("Accuracy report written to %s\n", *accuracyOut)
		}
	}
}
