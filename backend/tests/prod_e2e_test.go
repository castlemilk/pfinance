//go:build prod_e2e

package tests

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"connectrpc.com/connect"
	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/auth"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/gen/pfinance/v1/pfinancev1connect"
)

const (
	prodBackendURL = "https://pfinance-backend-tvj6nmevta-uc.a.run.app"
	firebaseAPIKey = "AIzaSyBbSWgNm4JW3wk_QyzVrUgfTdNruWMI2IM"
	testPassword   = "TestP@ss123!"
)

// bearerTokenInterceptor adds a Bearer token to all outgoing requests.
func bearerTokenInterceptor(token string) connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			req.Header().Set("Authorization", "Bearer "+token)
			return next(ctx, req)
		}
	}
}

// signInResponse is the Firebase REST API response for email/password sign-in.
type signInResponse struct {
	IDToken string `json:"idToken"`
	Email   string `json:"email"`
}

// signInWithPassword exchanges email/password for a Firebase ID token via REST API.
func signInWithPassword(email, password string) (string, error) {
	url := fmt.Sprintf("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=%s", firebaseAPIKey)

	body, err := json.Marshal(map[string]interface{}{
		"email":             email,
		"password":          password,
		"returnSecureToken": true,
	})
	if err != nil {
		return "", fmt.Errorf("marshal sign-in body: %w", err)
	}

	resp, err := http.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("sign-in request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("sign-in failed (status %d): %s", resp.StatusCode, string(respBody))
	}

	var result signInResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decode sign-in response: %w", err)
	}

	return result.IDToken, nil
}

// TestProdMLFeedback runs ordered subtests against the production backend
// to verify the 4 ML feedback loop RPCs.
//
// Prerequisites:
//
//	export GOOGLE_APPLICATION_CREDENTIALS=../pfinance-app-1748773335-firebase-adminsdk-fbsvc-4adcc18be2.json
//
// Run:
//
//	cd backend && go test -tags prod_e2e ./tests/ -v -run TestProdMLFeedback -timeout 60s
func TestProdMLFeedback(t *testing.T) {
	ctx := context.Background()

	// --- Setup: Firebase Admin SDK ---
	app, err := firebase.NewApp(ctx, nil)
	if err != nil {
		t.Fatalf("Failed to init Firebase app (is GOOGLE_APPLICATION_CREDENTIALS set?): %v", err)
	}

	authClient, err := app.Auth(ctx)
	if err != nil {
		t.Fatalf("Failed to get Firebase Auth client: %v", err)
	}

	// --- Setup: Create ephemeral test user ---
	email := fmt.Sprintf("pfinance-e2e-%d@test.pfinance.dev", time.Now().UnixNano())
	t.Logf("Creating test user: %s", email)

	params := (&auth.UserToCreate{}).Email(email).Password(testPassword)
	user, err := authClient.CreateUser(ctx, params)
	if err != nil {
		t.Fatalf("Failed to create test user: %v", err)
	}
	t.Logf("Created user: %s (UID: %s)", email, user.UID)

	t.Cleanup(func() {
		t.Logf("Deleting test user: %s", user.UID)
		if err := authClient.DeleteUser(ctx, user.UID); err != nil {
			t.Errorf("Failed to delete test user %s: %v", user.UID, err)
		}
	})

	// --- Setup: Exchange credentials for ID token ---
	idToken, err := signInWithPassword(email, testPassword)
	if err != nil {
		t.Fatalf("Failed to sign in test user: %v", err)
	}
	t.Logf("Obtained ID token (length=%d)", len(idToken))

	// --- Setup: Create authenticated Connect client ---
	client := pfinancev1connect.NewFinanceServiceClient(
		http.DefaultClient,
		prodBackendURL,
		connect.WithInterceptors(bearerTokenInterceptor(idToken)),
	)

	// --- Subtests (ordered, each depends on prior state) ---

	t.Run("GetMerchantSuggestions_static", func(t *testing.T) {
		resp, err := client.GetMerchantSuggestions(ctx, connect.NewRequest(&pfinancev1.GetMerchantSuggestionsRequest{
			UserId:       user.UID,
			MerchantText: "Woolworths",
		}))
		if err != nil {
			t.Fatalf("GetMerchantSuggestions(Woolworths) failed: %v", err)
		}

		msg := resp.Msg
		t.Logf("Suggestion: name=%q category=%s confidence=%.2f source=%s",
			msg.SuggestedName, msg.SuggestedCategory, msg.Confidence, msg.Source)

		if msg.SuggestedCategory != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD {
			t.Errorf("Expected FOOD category for Woolworths, got %s", msg.SuggestedCategory)
		}
		if msg.Source != "static" {
			t.Errorf("Expected source=static, got %q", msg.Source)
		}
		if msg.Confidence < 0.5 {
			t.Errorf("Expected confidence >= 0.5, got %.2f", msg.Confidence)
		}
	})

	t.Run("GetMerchantSuggestions_unknown", func(t *testing.T) {
		resp, err := client.GetMerchantSuggestions(ctx, connect.NewRequest(&pfinancev1.GetMerchantSuggestionsRequest{
			UserId:       user.UID,
			MerchantText: "xyz123abc_unknown_merchant",
		}))
		if err != nil {
			t.Fatalf("GetMerchantSuggestions(unknown) failed: %v", err)
		}

		msg := resp.Msg
		t.Logf("Suggestion: name=%q category=%s confidence=%.2f source=%s",
			msg.SuggestedName, msg.SuggestedCategory, msg.Confidence, msg.Source)

		if msg.SuggestedCategory != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER {
			t.Errorf("Expected OTHER category for unknown merchant, got %s", msg.SuggestedCategory)
		}
		if msg.Confidence > 0.5 {
			t.Errorf("Expected low confidence for unknown merchant, got %.2f", msg.Confidence)
		}
	})

	// correctedMerchant is used across subtests to verify learned suggestions.
	correctedMerchant := fmt.Sprintf("TestMerchant_%d", time.Now().UnixNano())

	t.Run("SubmitCorrections", func(t *testing.T) {
		resp, err := client.SubmitCorrections(ctx, connect.NewRequest(&pfinancev1.SubmitCorrectionsRequest{
			UserId: user.UID,
			Corrections: []*pfinancev1.CorrectionRecord{
				{
					UserId:            user.UID,
					ExtractionId:      "test-extraction-1",
					TransactionId:     "test-tx-1",
					OriginalMerchant:  "TESTMERCH RAW",
					CorrectedMerchant: correctedMerchant,
					OriginalCategory:  pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER,
					CorrectedCategory: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT,
					Corrections: []*pfinancev1.FieldCorrection{
						{
							Field:          pfinancev1.CorrectionFieldType_CORRECTION_FIELD_TYPE_MERCHANT,
							OriginalValue:  "TESTMERCH RAW",
							CorrectedValue: correctedMerchant,
						},
						{
							Field:          pfinancev1.CorrectionFieldType_CORRECTION_FIELD_TYPE_CATEGORY,
							OriginalValue:  "OTHER",
							CorrectedValue: "ENTERTAINMENT",
						},
					},
				},
			},
		}))
		if err != nil {
			t.Fatalf("SubmitCorrections failed: %v", err)
		}

		msg := resp.Msg
		t.Logf("Corrections: processedCount=%d mappingsUpdated=%d",
			msg.ProcessedCount, msg.MerchantMappingsUpdated)

		if msg.ProcessedCount != 1 {
			t.Errorf("Expected processedCount=1, got %d", msg.ProcessedCount)
		}
		if msg.MerchantMappingsUpdated < 1 {
			t.Errorf("Expected mappingsUpdated >= 1, got %d", msg.MerchantMappingsUpdated)
		}
	})

	t.Run("GetMerchantSuggestions_learned", func(t *testing.T) {
		// Brief pause to allow Firestore writes from SubmitCorrections to propagate.
		time.Sleep(2 * time.Second)

		// Query using the original merchant text — the mapping stores RawPattern as
		// strings.ToLower(OriginalMerchant), and lookup checks if the query contains that pattern.
		resp, err := client.GetMerchantSuggestions(ctx, connect.NewRequest(&pfinancev1.GetMerchantSuggestionsRequest{
			UserId:       user.UID,
			MerchantText: "TESTMERCH RAW",
		}))
		if err != nil {
			t.Fatalf("GetMerchantSuggestions(learned) failed: %v", err)
		}

		msg := resp.Msg
		t.Logf("Suggestion: name=%q category=%s confidence=%.2f source=%s",
			msg.SuggestedName, msg.SuggestedCategory, msg.Confidence, msg.Source)

		if msg.Source != "user_history" {
			t.Errorf("Expected source=user_history after correction, got %q", msg.Source)
		}
		if msg.SuggestedName != correctedMerchant {
			t.Errorf("Expected suggested name=%q, got %q", correctedMerchant, msg.SuggestedName)
		}
		if msg.SuggestedCategory != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT {
			t.Errorf("Expected ENTERTAINMENT category from learned mapping, got %s", msg.SuggestedCategory)
		}
	})

	t.Run("CheckDuplicates_no_matches", func(t *testing.T) {
		resp, err := client.CheckDuplicates(ctx, connect.NewRequest(&pfinancev1.CheckDuplicatesRequest{
			UserId: user.UID,
			Transactions: []*pfinancev1.ExtractedTransaction{
				{
					Id:                 "unique-tx-1",
					Date:               time.Now().Format("2006-01-02"),
					Description:        "Completely unique transaction for e2e test",
					NormalizedMerchant: "UniqueE2EMerchant",
					Amount:             99.99,
					AmountCents:        9999,
					SuggestedCategory:  pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER,
					Confidence:         0.9,
					IsDebit:            true,
				},
			},
		}))
		if err != nil {
			t.Fatalf("CheckDuplicates failed: %v", err)
		}

		msg := resp.Msg
		t.Logf("Duplicates map has %d entries", len(msg.Duplicates))

		if len(msg.Duplicates) != 0 {
			for txID, candidates := range msg.Duplicates {
				t.Errorf("Unexpected duplicate for tx %s: %d candidates", txID, len(candidates.Candidates))
			}
		}
	})

	t.Run("GetExtractionMetrics", func(t *testing.T) {
		resp, err := client.GetExtractionMetrics(ctx, connect.NewRequest(&pfinancev1.GetExtractionMetricsRequest{
			UserId: user.UID,
			Days:   30,
		}))
		if err != nil {
			// Firestore composite index may not exist yet — log and skip rather than fail.
			if strings.Contains(err.Error(), "requires an index") {
				t.Skipf("Skipping: Firestore composite index not yet created: %v", err)
			}
			t.Fatalf("GetExtractionMetrics failed: %v", err)
		}

		msg := resp.Msg
		t.Logf("Metrics: extractions=%d transactions=%d corrections=%d rate=%.2f avgConfidence=%.2f",
			msg.TotalExtractions, msg.TotalTransactions, msg.TotalCorrections,
			msg.CorrectionRate, msg.AverageConfidence)

		// Fresh user should have the 1 correction we just submitted
		if msg.TotalCorrections < 1 {
			t.Errorf("Expected at least 1 correction (from SubmitCorrections test), got %d", msg.TotalCorrections)
		}

		// Extraction count should be 0 for fresh user (we didn't run any extractions)
		if msg.TotalExtractions != 0 {
			t.Logf("Note: TotalExtractions=%d (expected 0 for fresh user, non-fatal)", msg.TotalExtractions)
		}
	})
}
