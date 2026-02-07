package extraction

import "fmt"

// ExtractionErrorCode represents specific extraction error types.
type ExtractionErrorCode string

const (
	ErrMLServiceUnavailable ExtractionErrorCode = "ML_SERVICE_UNAVAILABLE"
	ErrMLServiceTimeout     ExtractionErrorCode = "ML_SERVICE_TIMEOUT"
	ErrGeminiUnavailable    ExtractionErrorCode = "GEMINI_UNAVAILABLE"
	ErrGeminiRateLimited    ExtractionErrorCode = "GEMINI_RATE_LIMITED"
	ErrInvalidDocument      ExtractionErrorCode = "INVALID_DOCUMENT"
	ErrNoTransactionsFound  ExtractionErrorCode = "NO_TRANSACTIONS_FOUND"
	ErrAllMethodsFailed     ExtractionErrorCode = "ALL_METHODS_FAILED"
)

// ExtractionError is a structured error for extraction failures.
type ExtractionError struct {
	Code              ExtractionErrorCode
	Message           string
	Method            string // e.g. "self-hosted" or "gemini"
	Retryable         bool
	SuggestedFallback string // e.g. "gemini" if ML failed
	Cause             error
}

func (e *ExtractionError) Error() string {
	if e.Cause != nil {
		return fmt.Sprintf("[%s] %s: %v", e.Code, e.Message, e.Cause)
	}
	return fmt.Sprintf("[%s] %s", e.Code, e.Message)
}

func (e *ExtractionError) Unwrap() error {
	return e.Cause
}

// IsRetryable returns whether this error is retryable.
func (e *ExtractionError) IsRetryable() bool {
	return e.Retryable
}
