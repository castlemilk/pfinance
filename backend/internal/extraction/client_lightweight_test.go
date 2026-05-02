package extraction

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestExtractLightweight_Tier1Success(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/parse-receipt-lightweight" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		if r.Method != http.MethodPost {
			t.Errorf("unexpected method: %s", r.Method)
		}

		resp := LightweightReceiptResponse{
			Merchant: LightweightFieldResult{
				Value:      "Woolworths",
				Confidence: 0.95,
				Source:     "siglip",
			},
			Amount: LightweightFieldResult{
				Value:      "45.50",
				Confidence: 0.92,
				Source:     "siglip",
			},
			Date: LightweightFieldResult{
				Value:      "2026-01-15",
				Confidence: 0.88,
				Source:     "siglip",
			},
			LineItemsDetected: true,
			LineItemCount:     3,
			OverallConfidence: 0.91,
			RoutingTier:       1,
			ProcessingTimeMS:  22,
			ModelUsed:         "siglip-so400m-patch14-384",
			Escalated:         false,
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := NewMLClient(server.URL)
	result, err := client.ExtractLightweight(context.Background(), []byte("fake-image"), "receipt.jpg")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if result.RoutingTier != 1 {
		t.Errorf("expected tier 1, got %d", result.RoutingTier)
	}
	if result.Merchant.Value != "Woolworths" {
		t.Errorf("expected Woolworths, got %s", result.Merchant.Value)
	}
	if result.OverallConfidence != 0.91 {
		t.Errorf("expected confidence 0.91, got %f", result.OverallConfidence)
	}
	if result.Escalated {
		t.Error("expected not escalated")
	}
}

func TestExtractLightweight_Tier3Fallback(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := LightweightReceiptResponse{
			OverallConfidence: 0.0,
			RoutingTier:       3,
			ProcessingTimeMS:  150,
			ModelUsed:         "none",
			Warnings:          []string{"All self-hosted tiers failed"},
			Escalated:         true,
			Error:             "All self-hosted tiers failed",
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := NewMLClient(server.URL)
	result, err := client.ExtractLightweight(context.Background(), []byte("fake-image"), "receipt.jpg")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if result.RoutingTier != 3 {
		t.Errorf("expected tier 3, got %d", result.RoutingTier)
	}

	// ToExtractionResult should return nil for tier 3 (signal for Gemini fallback)
	protoResult := result.ToExtractionResult()
	if protoResult != nil {
		t.Error("expected nil ExtractionResult for tier 3")
	}
}

func TestExtractLightweight_ToExtractionResult(t *testing.T) {
	resp := &LightweightReceiptResponse{
		Merchant: LightweightFieldResult{
			Value:      "Coles",
			Confidence: 0.88,
			Source:     "siglip",
		},
		Amount: LightweightFieldResult{
			Value:      "23.99",
			Confidence: 0.85,
			Source:     "siglip",
		},
		Date: LightweightFieldResult{
			Value:      "2026-03-01",
			Confidence: 0.90,
			Source:     "siglip",
		},
		OverallConfidence: 0.87,
		RoutingTier:       1,
		ProcessingTimeMS:  18,
		ModelUsed:         "siglip-so400m-patch14-384",
	}

	result := resp.ToExtractionResult()
	if result == nil {
		t.Fatal("expected non-nil result")
	}

	if len(result.Transactions) != 1 {
		t.Fatalf("expected 1 transaction, got %d", len(result.Transactions))
	}

	tx := result.Transactions[0]
	if tx.NormalizedMerchant != "Coles" {
		t.Errorf("expected Coles, got %s", tx.NormalizedMerchant)
	}
	if tx.Amount != 23.99 {
		t.Errorf("expected 23.99, got %f", tx.Amount)
	}
	if tx.Date != "2026-03-01" {
		t.Errorf("expected 2026-03-01, got %s", tx.Date)
	}
	if tx.FieldConfidences == nil {
		t.Fatal("expected field confidences")
	}
	if tx.FieldConfidences.Merchant != 0.88 {
		t.Errorf("expected merchant confidence 0.88, got %f", tx.FieldConfidences.Merchant)
	}
}

func TestExtractLightweightWithTier_ForcesTier(t *testing.T) {
	var receivedTier string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.ParseMultipartForm(10 << 20)
		receivedTier = r.FormValue("force_tier")

		resp := LightweightReceiptResponse{
			RoutingTier:       2,
			OverallConfidence: 0.80,
			ModelUsed:         "qwen2vl",
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := NewMLClient(server.URL)
	_, err := client.ExtractLightweightWithTier(context.Background(), []byte("img"), "r.jpg", 2)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if receivedTier != "2" {
		t.Errorf("expected force_tier=2, got %s", receivedTier)
	}
}
