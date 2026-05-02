package mleval

import "sync"

// Model pricing constants (per 1M tokens, as of 2025).
const (
	// Gemini Flash
	GeminiFlashInputPer1M  = 0.075
	GeminiFlashOutputPer1M = 0.30

	// Gemini Pro
	GeminiProInputPer1M  = 1.25
	GeminiProOutputPer1M = 5.00

	// LayoutLMv3 (self-hosted) — estimated GPU cost amortized per token
	LayoutLMv3Per1MTokens = 0.005

	// Donut (self-hosted) — estimated GPU cost per page
	DonutPerPage = 0.0008

	// SigLIP (self-hosted) — estimated GPU cost per image
	SigLIPPerImage = 0.0003

	// Rough token estimates per operation
	ExtractionInputTokensEstimate  = 8000
	ExtractionOutputTokensEstimate = 2000
	ClassifyInputTokensEstimate    = 1500
	ClassifyOutputTokensEstimate   = 500
)

// CostTracker accumulates API call counts and estimated costs.
type CostTracker struct {
	mu                  sync.Mutex
	extractionCalls     int
	classificationCalls int
	selfHostedCalls     int
	inputTokens         int64
	outputTokens        int64
	selfHostedCostUSD   float64
}

// NewCostTracker creates a new cost tracker.
func NewCostTracker() *CostTracker {
	return &CostTracker{}
}

// RecordExtraction records an extraction API call.
func (c *CostTracker) RecordExtraction(inputTokens, outputTokens int64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.extractionCalls++
	if inputTokens > 0 {
		c.inputTokens += inputTokens
	} else {
		c.inputTokens += ExtractionInputTokensEstimate
	}
	if outputTokens > 0 {
		c.outputTokens += outputTokens
	} else {
		c.outputTokens += ExtractionOutputTokensEstimate
	}
}

// RecordClassification records a tax classification API call.
func (c *CostTracker) RecordClassification(batchSize int) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.classificationCalls++
	c.inputTokens += int64(ClassifyInputTokensEstimate * batchSize)
	c.outputTokens += int64(ClassifyOutputTokensEstimate * batchSize)
}

// RecordSelfHosted records a self-hosted model inference call with direct cost.
func (c *CostTracker) RecordSelfHosted(costUSD float64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.selfHostedCalls++
	c.selfHostedCostUSD += costUSD
}

// Summary returns the cost summary.
func (c *CostTracker) Summary() *CostSummary {
	c.mu.Lock()
	defer c.mu.Unlock()

	totalTokens := c.inputTokens + c.outputTokens
	costUSD := float64(c.inputTokens)/1_000_000*GeminiFlashInputPer1M +
		float64(c.outputTokens)/1_000_000*GeminiFlashOutputPer1M +
		c.selfHostedCostUSD

	return &CostSummary{
		TotalAPICalls:       c.extractionCalls + c.classificationCalls + c.selfHostedCalls,
		ExtractionCalls:     c.extractionCalls,
		ClassificationCalls: c.classificationCalls,
		EstimatedTokens:     totalTokens,
		EstimatedCostUSD:    costUSD,
	}
}
