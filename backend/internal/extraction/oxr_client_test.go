package extraction

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"
)

func oxrSuccessResponse(markdown string) map[string]interface{} {
	return map[string]interface{}{
		"code":     0,
		"message":  "任务成功",
		"warnings": []string{"feature_config.enable_text_cross_page=true accepted but ignored"},
		"data": map[string]interface{}{
			"task_id": "task-123",
			"error":   nil,
			"result": map[string]interface{}{
				"file_name": "synthetic-statement.pdf",
				"outputs": map[string]interface{}{
					"markdown": markdown,
				},
			},
			"metadata": map[string]interface{}{
				"page_num":           3,
				"file_type":          ".pdf",
				"processing_time_ms": 1250,
			},
		},
	}
}

func TestOXRClientParseContract(t *testing.T) {
	document := []byte("%PDF-1.4\nsynthetic statement fixture")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("method = %s, want POST", r.Method)
		}
		if r.URL.Path != "/v1/parse/sync" {
			t.Errorf("path = %s, want /v1/parse/sync", r.URL.Path)
		}
		if r.URL.Query().Get("api_key") != "" {
			t.Error("API key must not be sent in the URL")
		}
		if err := r.ParseMultipartForm(1 << 20); err != nil {
			t.Errorf("parse multipart request: %v", err)
			http.Error(w, "bad multipart", http.StatusBadRequest)
			return
		}
		if got := r.FormValue("api_key"); got != "unit-test-key" {
			t.Errorf("api_key = %q, want unit-test-key", got)
		}
		if got := r.MultipartForm.Value["output_formats"]; !reflect.DeepEqual(got, []string{"markdown"}) {
			t.Errorf("output_formats = %v, want [markdown]", got)
		}
		file, header, err := r.FormFile("file")
		if err != nil {
			t.Errorf("read file field: %v", err)
			http.Error(w, "missing file", http.StatusBadRequest)
			return
		}
		defer file.Close()
		if header.Filename != "synthetic-statement.pdf" {
			t.Errorf("filename = %q", header.Filename)
		}
		content, err := io.ReadAll(file)
		if err != nil {
			t.Errorf("read uploaded file: %v", err)
		}
		if string(content) != string(document) {
			t.Error("uploaded document bytes changed")
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(oxrSuccessResponse("\n| Date | Description | Debit |\n|---|---|---:|\n| 2024-01-15 | Shop | 10.00 |\n"))
	}))
	defer server.Close()

	client := NewOXRClient(server.URL+"/", "unit-test-key")
	result, err := client.Parse(context.Background(), document, "synthetic-statement.pdf")
	if err != nil {
		t.Fatalf("Parse failed: %v", err)
	}
	if result.TaskID != "task-123" {
		t.Errorf("TaskID = %q, want task-123", result.TaskID)
	}
	if !strings.HasPrefix(result.Markdown, "| Date |") || strings.HasSuffix(result.Markdown, "\n") {
		t.Errorf("Markdown was not trimmed correctly: %q", result.Markdown)
	}
	if result.PageCount != 3 {
		t.Errorf("PageCount = %d, want 3", result.PageCount)
	}
	if result.ProcessingTimeMS != 1250 {
		t.Errorf("ProcessingTimeMS = %d, want 1250", result.ProcessingTimeMS)
	}
	if len(result.Warnings) != 1 {
		t.Fatalf("Warnings = %v, want one warning", result.Warnings)
	}
}

func TestOXRClientRejectsFailedResponsesWithoutEchoingContent(t *testing.T) {
	const sensitiveBody = "sensitive-statement-content-and-unit-secret"
	tests := []struct {
		name     string
		status   int
		body     string
		wantCode string
	}{
		{name: "HTTP error", status: http.StatusBadGateway, body: sensitiveBody, wantCode: "502"},
		{name: "parameter envelope error", status: http.StatusOK, body: `{"code":1133,"message":"` + sensitiveBody + `","data":null}`, wantCode: "1133"},
		{name: "processing envelope error", status: http.StatusOK, body: `{"code":1137,"message":"` + sensitiveBody + `","data":null}`, wantCode: "1137"},
		{name: "missing data", status: http.StatusOK, body: `{"code":0,"data":null}`, wantCode: "no data"},
		{name: "data processing error", status: http.StatusOK, body: `{"code":0,"data":{"error":"` + sensitiveBody + `"}}`, wantCode: "processing error"},
		{name: "empty Markdown", status: http.StatusOK, body: `{"code":0,"data":{"result":{"outputs":{"markdown":"  "}}}}`, wantCode: "no Markdown"},
		{name: "malformed JSON", status: http.StatusOK, body: `{"code":0`, wantCode: "decode oxr response"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(tc.body))
			}))
			defer server.Close()

			result, err := NewOXRClient(server.URL, "unit-secret").Parse(
				context.Background(), []byte("synthetic statement"), "statement.pdf",
			)
			if err == nil {
				t.Fatal("expected an error")
			}
			if result != nil {
				t.Fatalf("result = %#v, want nil", result)
			}
			if !strings.Contains(err.Error(), tc.wantCode) {
				t.Errorf("error = %q, want substring %q", err, tc.wantCode)
			}
			if strings.Contains(err.Error(), sensitiveBody) || strings.Contains(err.Error(), "unit-secret") {
				t.Errorf("error exposed sensitive content: %v", err)
			}
		})
	}
}

func TestOXRClientResponseAndMarkdownLimits(t *testing.T) {
	t.Run("response limit", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			_, _ = w.Write([]byte(strings.Repeat("x", 128)))
		}))
		defer server.Close()
		client := NewOXRClient(server.URL, "")
		client.maxResponseBytes = 32
		if _, err := client.Parse(context.Background(), []byte("document"), "statement.pdf"); err == nil || !strings.Contains(err.Error(), "exceeds 32 bytes") {
			t.Fatalf("expected response-size error, got %v", err)
		}
	})

	t.Run("Markdown limit", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			json.NewEncoder(w).Encode(oxrSuccessResponse("12345"))
		}))
		defer server.Close()
		client := NewOXRClient(server.URL, "")
		client.maxMarkdownBytes = 4
		if _, err := client.Parse(context.Background(), []byte("document"), "statement.pdf"); err == nil || !strings.Contains(err.Error(), "Markdown output exceeds 4 bytes") {
			t.Fatalf("expected Markdown-size error, got %v", err)
		}
	})
}

func TestOXRClientTimeoutConfigurationAndCancellation(t *testing.T) {
	t.Setenv("OXR_HTTP_TIMEOUT_SECONDS", "7")
	client := NewOXRClient("http://oxr.internal", "")
	if client.httpClient.Timeout != 7*time.Second {
		t.Fatalf("timeout = %v, want 7s", client.httpClient.Timeout)
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := client.Parse(ctx, []byte("document"), "statement.pdf")
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("error = %v, want context.Canceled", err)
	}
}
