package taxeval

import "sync"

// Gemini pricing (per 1M tokens, as of 2025)
const (
	geminiFlashInputPer1M  = 0.075 // USD per 1M input tokens
	geminiFlashOutputPer1M = 0.30  // USD per 1M output tokens
	geminiProInputPer1M    = 1.25  // USD per 1M input tokens
	geminiProOutputPer1M   = 5.00  // USD per 1M output tokens

	// Rough token estimates per operation
	extractionInputTokensEstimate  = 8000 // avg for a multi-page PDF
	extractionOutputTokensEstimate = 2000 // avg transaction list
	classifyInputTokensEstimate    = 1500 // batch of expenses
	classifyOutputTokensEstimate   = 500  // classification results
)

// CostTracker accumulates API call counts and estimated costs.
type CostTracker struct {
	mu                  sync.Mutex
	extractionCalls     int
	classificationCalls int
	inputTokens         int64
	outputTokens        int64
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
		c.inputTokens += extractionInputTokensEstimate
	}
	if outputTokens > 0 {
		c.outputTokens += outputTokens
	} else {
		c.outputTokens += extractionOutputTokensEstimate
	}
}

// RecordClassification records a tax classification API call.
func (c *CostTracker) RecordClassification(batchSize int) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.classificationCalls++
	c.inputTokens += int64(classifyInputTokensEstimate * batchSize)
	c.outputTokens += int64(classifyOutputTokensEstimate * batchSize)
}

// Summary returns the cost summary.
func (c *CostTracker) Summary() *CostSummary {
	c.mu.Lock()
	defer c.mu.Unlock()

	totalTokens := c.inputTokens + c.outputTokens
	// Use Flash pricing as default
	costUSD := float64(c.inputTokens)/1_000_000*geminiFlashInputPer1M +
		float64(c.outputTokens)/1_000_000*geminiFlashOutputPer1M

	return &CostSummary{
		TotalAPICalls:       c.extractionCalls + c.classificationCalls,
		ExtractionCalls:     c.extractionCalls,
		ClassificationCalls: c.classificationCalls,
		EstimatedTokens:     totalTokens,
		EstimatedCostUSD:    costUSD,
	}
}
