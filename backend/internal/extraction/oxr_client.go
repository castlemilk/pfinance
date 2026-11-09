package extraction

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strings"
	"time"
)

const (
	defaultOXRTimeoutSeconds = 300
	defaultOXRResponseLimit  = 16 << 20
	defaultOXRMarkdownLimit  = 1 << 20
)

// OXRClient calls a self-hosted SoMark OXR parsing API. OXR performs document
// recognition only; its Markdown still needs semantic transaction extraction.
type OXRClient struct {
	baseURL          string
	apiKey           string
	httpClient       *http.Client
	maxResponseBytes int64
	maxMarkdownBytes int
}

// OXRParseResult is the statement recognition output used by the extraction
// pipeline. ProcessingTimeMS is OXR's own timing, excluding Gemini structuring.
type OXRParseResult struct {
	TaskID           string
	Markdown         string
	PageCount        int
	ProcessingTimeMS int64
	Warnings         []string
}

// NewOXRClient creates a client for the open-source OXR sync parsing endpoint.
func NewOXRClient(baseURL, apiKey string) *OXRClient {
	timeoutSeconds := envInt("OXR_HTTP_TIMEOUT_SECONDS", defaultOXRTimeoutSeconds)
	if timeoutSeconds <= 0 {
		timeoutSeconds = defaultOXRTimeoutSeconds
	}
	return &OXRClient{
		baseURL: strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		apiKey:  apiKey,
		httpClient: &http.Client{
			Timeout: time.Duration(timeoutSeconds) * time.Second,
		},
		maxResponseBytes: defaultOXRResponseLimit,
		maxMarkdownBytes: defaultOXRMarkdownLimit,
	}
}

type oxrSyncResponse struct {
	Code     int      `json:"code"`
	Message  string   `json:"message"`
	Warnings []string `json:"warnings"`
	Data     *struct {
		TaskID string `json:"task_id"`
		Error  string `json:"error"`
		Result struct {
			FileName string `json:"file_name"`
			Outputs  struct {
				Markdown string `json:"markdown"`
			} `json:"outputs"`
		} `json:"result"`
		Metadata struct {
			PageNum          int    `json:"page_num"`
			FileType         string `json:"file_type"`
			ProcessingTimeMS int64  `json:"processing_time_ms"`
		} `json:"metadata"`
	} `json:"data"`
}

// Parse sends a document to OXR and requests Markdown only. The API can return
// processing errors with HTTP 200, so the envelope code and data are mandatory.
func (c *OXRClient) Parse(ctx context.Context, documentData []byte, filename string) (*OXRParseResult, error) {
	if c == nil || c.baseURL == "" {
		return nil, fmt.Errorf("oxr service is not configured")
	}
	if len(documentData) == 0 {
		return nil, fmt.Errorf("oxr document is empty")
	}
	if filename == "" {
		filename = "statement.pdf"
	}

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	// The open-source route requires this field even when a deployment leaves
	// verification to an authenticated proxy. Never put the key in the URL.
	if err := writer.WriteField("api_key", c.apiKey); err != nil {
		return nil, fmt.Errorf("write oxr api key: %w", err)
	}
	if err := writer.WriteField("output_formats", "markdown"); err != nil {
		return nil, fmt.Errorf("write oxr output format: %w", err)
	}
	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		return nil, fmt.Errorf("create oxr file field: %w", err)
	}
	if _, err := part.Write(documentData); err != nil {
		return nil, fmt.Errorf("write oxr document: %w", err)
	}
	if err := writer.Close(); err != nil {
		return nil, fmt.Errorf("close oxr multipart body: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/v1/parse/sync", &body)
	if err != nil {
		return nil, fmt.Errorf("create oxr request: %w", err)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("execute oxr request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		// Do not include the response body: upstream errors can echo document
		// content, which must not enter application logs or RPC errors.
		return nil, fmt.Errorf("oxr request failed with HTTP status %d", resp.StatusCode)
	}

	responseBody, err := io.ReadAll(io.LimitReader(resp.Body, c.maxResponseBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read oxr response: %w", err)
	}
	if int64(len(responseBody)) > c.maxResponseBytes {
		return nil, fmt.Errorf("oxr response exceeds %d bytes", c.maxResponseBytes)
	}

	var envelope oxrSyncResponse
	if err := json.Unmarshal(responseBody, &envelope); err != nil {
		return nil, fmt.Errorf("decode oxr response: %w", err)
	}
	if envelope.Code != 0 {
		// OXR uses codes such as 1133 (invalid parameters) and 1137
		// (processing failure) with HTTP 200. Its message may contain input
		// details, so only propagate the machine-readable code.
		return nil, fmt.Errorf("oxr processing failed with code %d", envelope.Code)
	}
	if envelope.Data == nil {
		return nil, fmt.Errorf("oxr response has no data")
	}
	if envelope.Data.Error != "" {
		return nil, fmt.Errorf("oxr response contains a processing error")
	}

	markdown := strings.TrimSpace(envelope.Data.Result.Outputs.Markdown)
	if markdown == "" {
		return nil, fmt.Errorf("oxr response has no Markdown output")
	}
	if len(markdown) > c.maxMarkdownBytes {
		return nil, fmt.Errorf("oxr Markdown output exceeds %d bytes", c.maxMarkdownBytes)
	}

	return &OXRParseResult{
		TaskID:           envelope.Data.TaskID,
		Markdown:         markdown,
		PageCount:        envelope.Data.Metadata.PageNum,
		ProcessingTimeMS: envelope.Data.Metadata.ProcessingTimeMS,
		Warnings:         append([]string(nil), envelope.Warnings...),
	}, nil
}
