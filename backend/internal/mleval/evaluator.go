package mleval

import "context"

// Evaluator defines a pluggable evaluation capability.
// Each evaluator handles a specific ML pipeline (tax, statement parsing, receipt extraction, etc.).
type Evaluator interface {
	// Name returns the evaluator's identifier (e.g., "tax", "statement", "receipt").
	Name() string

	// Description returns a short human-readable description.
	Description() string

	// FileExtensions returns file extensions this evaluator handles (e.g., [".pdf", ".png"]).
	FileExtensions() []string

	// ProcessFile processes a single file and returns a FileResult.
	ProcessFile(ctx context.Context, filePath, basePath string) *FileResult

	// Score compares an eval run's results against ground truth.
	Score(run *EvalRun, gtSet *GroundTruthSet) *AccuracyReport
}

// Registry holds registered evaluators keyed by name.
var Registry = make(map[string]Evaluator)

// Register adds an evaluator to the global registry.
func Register(e Evaluator) {
	Registry[e.Name()] = e
}

// GetEvaluator returns a registered evaluator by name.
func GetEvaluator(name string) (Evaluator, bool) {
	e, ok := Registry[name]
	return e, ok
}

// ListEvaluators returns the names of all registered evaluators.
func ListEvaluators() []string {
	names := make([]string, 0, len(Registry))
	for name := range Registry {
		names = append(names, name)
	}
	return names
}
