package extraction

import (
	"context"
	"math"
	"math/rand"
	"time"
)

// RetryConfig configures retry behavior with exponential backoff.
type RetryConfig struct {
	MaxRetries     int
	InitialDelay   time.Duration
	MaxDelay       time.Duration
	BackoffFactor  float64
	JitterFraction float64 // 0.0 to 1.0 — fraction of delay to randomize
}

// DefaultMLRetryConfig is tuned for Modal cold starts.
var DefaultMLRetryConfig = RetryConfig{
	MaxRetries:     3,
	InitialDelay:   2 * time.Second,
	MaxDelay:       30 * time.Second,
	BackoffFactor:  2.0,
	JitterFraction: 0.3,
}

// DefaultGeminiRetryConfig is tuned for Gemini API transient errors.
var DefaultGeminiRetryConfig = RetryConfig{
	MaxRetries:     2,
	InitialDelay:   1 * time.Second,
	MaxDelay:       10 * time.Second,
	BackoffFactor:  2.0,
	JitterFraction: 0.2,
}

// WithRetry executes fn with exponential backoff + jitter.
// It stops retrying if the error is non-retryable (ExtractionError with Retryable=false),
// the context is cancelled, or max retries are exhausted.
func WithRetry[T any](ctx context.Context, cfg RetryConfig, fn func(ctx context.Context) (T, error)) (T, error) {
	var lastErr error
	var zero T

	for attempt := 0; attempt <= cfg.MaxRetries; attempt++ {
		result, err := fn(ctx)
		if err == nil {
			return result, nil
		}
		lastErr = err

		// Don't retry non-retryable errors
		if extErr, ok := err.(*ExtractionError); ok && !extErr.Retryable {
			return zero, err
		}

		// Don't retry if we've exhausted attempts
		if attempt >= cfg.MaxRetries {
			break
		}

		// Calculate delay with exponential backoff
		delay := float64(cfg.InitialDelay) * math.Pow(cfg.BackoffFactor, float64(attempt))
		if delay > float64(cfg.MaxDelay) {
			delay = float64(cfg.MaxDelay)
		}

		// Add jitter
		if cfg.JitterFraction > 0 {
			jitter := delay * cfg.JitterFraction * (rand.Float64()*2 - 1) // +/- jitter
			delay += jitter
			if delay < 0 {
				delay = float64(cfg.InitialDelay)
			}
		}

		select {
		case <-ctx.Done():
			return zero, ctx.Err()
		case <-time.After(time.Duration(delay)):
			// continue to next attempt
		}
	}

	return zero, lastErr
}
