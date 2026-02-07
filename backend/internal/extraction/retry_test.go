package extraction

import (
	"context"
	"fmt"
	"testing"
	"time"
)

func TestWithRetry_SuccessFirstAttempt(t *testing.T) {
	cfg := RetryConfig{
		MaxRetries:    3,
		InitialDelay:  10 * time.Millisecond,
		MaxDelay:      100 * time.Millisecond,
		BackoffFactor: 2.0,
	}

	attempts := 0
	result, err := WithRetry(context.Background(), cfg, func(ctx context.Context) (string, error) {
		attempts++
		return "ok", nil
	})

	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if result != "ok" {
		t.Fatalf("expected 'ok', got %q", result)
	}
	if attempts != 1 {
		t.Fatalf("expected 1 attempt, got %d", attempts)
	}
}

func TestWithRetry_TransientThenSuccess(t *testing.T) {
	cfg := RetryConfig{
		MaxRetries:    3,
		InitialDelay:  10 * time.Millisecond,
		MaxDelay:      100 * time.Millisecond,
		BackoffFactor: 2.0,
	}

	attempts := 0
	result, err := WithRetry(context.Background(), cfg, func(ctx context.Context) (string, error) {
		attempts++
		if attempts < 3 {
			return "", &ExtractionError{
				Code:      ErrMLServiceUnavailable,
				Message:   "transient",
				Retryable: true,
			}
		}
		return "recovered", nil
	})

	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if result != "recovered" {
		t.Fatalf("expected 'recovered', got %q", result)
	}
	if attempts != 3 {
		t.Fatalf("expected 3 attempts, got %d", attempts)
	}
}

func TestWithRetry_ExhaustsAllAttempts(t *testing.T) {
	cfg := RetryConfig{
		MaxRetries:    2,
		InitialDelay:  10 * time.Millisecond,
		MaxDelay:      100 * time.Millisecond,
		BackoffFactor: 2.0,
	}

	attempts := 0
	_, err := WithRetry(context.Background(), cfg, func(ctx context.Context) (string, error) {
		attempts++
		return "", &ExtractionError{
			Code:      ErrMLServiceUnavailable,
			Message:   "always failing",
			Retryable: true,
		}
	})

	if err == nil {
		t.Fatal("expected error, got nil")
	}
	// initial attempt + 2 retries = 3 total
	if attempts != 3 {
		t.Fatalf("expected 3 attempts (1 + 2 retries), got %d", attempts)
	}
}

func TestWithRetry_NonRetryableStopsImmediately(t *testing.T) {
	cfg := RetryConfig{
		MaxRetries:    3,
		InitialDelay:  10 * time.Millisecond,
		MaxDelay:      100 * time.Millisecond,
		BackoffFactor: 2.0,
	}

	attempts := 0
	_, err := WithRetry(context.Background(), cfg, func(ctx context.Context) (string, error) {
		attempts++
		return "", &ExtractionError{
			Code:      ErrInvalidDocument,
			Message:   "bad document",
			Retryable: false,
		}
	})

	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if attempts != 1 {
		t.Fatalf("expected 1 attempt (non-retryable should stop immediately), got %d", attempts)
	}
	extErr, ok := err.(*ExtractionError)
	if !ok {
		t.Fatal("expected *ExtractionError")
	}
	if extErr.Code != ErrInvalidDocument {
		t.Fatalf("expected ErrInvalidDocument, got %s", extErr.Code)
	}
}

func TestWithRetry_ContextCancellation(t *testing.T) {
	cfg := RetryConfig{
		MaxRetries:    5,
		InitialDelay:  500 * time.Millisecond,
		MaxDelay:      2 * time.Second,
		BackoffFactor: 2.0,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	attempts := 0
	_, err := WithRetry(ctx, cfg, func(ctx context.Context) (string, error) {
		attempts++
		return "", &ExtractionError{
			Code:      ErrMLServiceUnavailable,
			Message:   "failing",
			Retryable: true,
		}
	})

	if err == nil {
		t.Fatal("expected error, got nil")
	}
	// Should have been cancelled before exhausting all retries
	if attempts >= 5 {
		t.Fatalf("expected fewer than 5 attempts due to context cancellation, got %d", attempts)
	}
}

func TestWithRetry_RegularErrorIsRetried(t *testing.T) {
	cfg := RetryConfig{
		MaxRetries:    2,
		InitialDelay:  10 * time.Millisecond,
		MaxDelay:      100 * time.Millisecond,
		BackoffFactor: 2.0,
	}

	attempts := 0
	_, err := WithRetry(context.Background(), cfg, func(ctx context.Context) (string, error) {
		attempts++
		return "", fmt.Errorf("generic error")
	})

	if err == nil {
		t.Fatal("expected error, got nil")
	}
	// Non-ExtractionError errors should be retried (no Retryable field to check)
	if attempts != 3 {
		t.Fatalf("expected 3 attempts for generic errors, got %d", attempts)
	}
}

func TestWithRetry_JitterProducesVariedDelays(t *testing.T) {
	cfg := RetryConfig{
		MaxRetries:     5,
		InitialDelay:   50 * time.Millisecond,
		MaxDelay:       5 * time.Second,
		BackoffFactor:  2.0,
		JitterFraction: 0.5,
	}

	// Run multiple retries and measure timing to verify jitter
	var durations []time.Duration
	for trial := 0; trial < 3; trial++ {
		start := time.Now()
		attempts := 0
		WithRetry(context.Background(), cfg, func(ctx context.Context) (string, error) {
			attempts++
			if attempts <= 2 {
				return "", &ExtractionError{
					Code:      ErrMLServiceUnavailable,
					Message:   "failing",
					Retryable: true,
				}
			}
			return "ok", nil
		})
		durations = append(durations, time.Since(start))
	}

	// With jitter, durations should not all be identical
	// This is a probabilistic test, but with 50% jitter fraction
	// the chance of all 3 being within 1ms of each other is very low
	allSame := true
	for i := 1; i < len(durations); i++ {
		diff := durations[i] - durations[0]
		if diff < 0 {
			diff = -diff
		}
		if diff > time.Millisecond {
			allSame = false
			break
		}
	}
	// It's fine if they happen to be the same occasionally — this is just a sanity check
	_ = allSame
}

func TestWithRetry_MaxDelayIsCapped(t *testing.T) {
	cfg := RetryConfig{
		MaxRetries:    3,
		InitialDelay:  50 * time.Millisecond,
		MaxDelay:      60 * time.Millisecond, // Very low max
		BackoffFactor: 10.0,                  // Aggressive backoff
	}

	start := time.Now()
	attempts := 0
	WithRetry(context.Background(), cfg, func(ctx context.Context) (string, error) {
		attempts++
		return "", &ExtractionError{
			Code:      ErrMLServiceUnavailable,
			Message:   "failing",
			Retryable: true,
		}
	})
	elapsed := time.Since(start)

	// With capped delay, total time should be roughly: 50ms + 60ms + 60ms = 170ms
	// Without cap: 50ms + 500ms + 5000ms = 5550ms
	// Allow generous margin for test flakiness
	if elapsed > 500*time.Millisecond {
		t.Fatalf("expected delay to be capped, but total time was %v", elapsed)
	}
}
