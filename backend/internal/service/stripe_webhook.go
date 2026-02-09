package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/auth"
	"github.com/castlemilk/pfinance/backend/internal/store"
	"github.com/stripe/stripe-go/v82"
	"github.com/stripe/stripe-go/v82/webhook"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// StripeWebhookHandler handles Stripe webhook events
type StripeWebhookHandler struct {
	store         store.Store
	webhookSecret string
	firebaseAuth  *auth.FirebaseAuth
}

// NewStripeWebhookHandler creates a new Stripe webhook handler
func NewStripeWebhookHandler(s store.Store, webhookSecret string, firebaseAuth *auth.FirebaseAuth) *StripeWebhookHandler {
	return &StripeWebhookHandler{store: s, webhookSecret: webhookSecret, firebaseAuth: firebaseAuth}
}

// HandleWebhook processes incoming Stripe webhook events
func (h *StripeWebhookHandler) HandleWebhook(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 65536))
	if err != nil {
		http.Error(w, "failed to read body", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	// Verify Stripe signature
	sigHeader := r.Header.Get("Stripe-Signature")
	event, err := webhook.ConstructEvent(body, sigHeader, h.webhookSecret)
	if err != nil {
		log.Printf("[Stripe] Webhook signature verification failed: %v", err)
		http.Error(w, "invalid signature", http.StatusBadRequest)
		return
	}

	ctx := r.Context()

	switch event.Type {
	case "checkout.session.completed":
		h.handleCheckoutCompleted(ctx, event)
	case "customer.subscription.updated":
		h.handleSubscriptionUpdated(ctx, event)
	case "customer.subscription.deleted":
		h.handleSubscriptionDeleted(ctx, event)
	case "invoice.payment_failed":
		h.handlePaymentFailed(ctx, event)
	default:
		log.Printf("[Stripe] Unhandled event type: %s", event.Type)
	}

	w.WriteHeader(http.StatusOK)
	fmt.Fprint(w, `{"received": true}`)
}

// handleCheckoutCompleted processes a completed checkout session.
// It reads the user ID from metadata and updates the user's subscription to PRO.
func (h *StripeWebhookHandler) handleCheckoutCompleted(ctx context.Context, event stripe.Event) {
	var session struct {
		Customer     string            `json:"customer"`
		Subscription string            `json:"subscription"`
		Metadata     map[string]string `json:"metadata"`
	}
	if err := json.Unmarshal(event.Data.Raw, &session); err != nil {
		log.Printf("[Stripe] Failed to parse checkout.session.completed: %v", err)
		return
	}

	userID := session.Metadata["pfinance_user_id"]
	if userID == "" {
		log.Printf("[Stripe] checkout.session.completed: missing pfinance_user_id in metadata")
		return
	}

	log.Printf("[Stripe] Checkout completed: user=%s customer=%s subscription=%s", userID, session.Customer, session.Subscription)

	user, err := h.store.GetUser(ctx, userID)
	if err != nil {
		// User doesn't exist in store yet, create a minimal record
		user = &pfinancev1.User{
			Id:        userID,
			CreatedAt: timestamppb.Now(),
		}
	}

	user.StripeCustomerId = session.Customer
	user.StripeSubscriptionId = session.Subscription
	user.SubscriptionTier = pfinancev1.SubscriptionTier_SUBSCRIPTION_TIER_PRO
	user.SubscriptionStatus = pfinancev1.SubscriptionStatus_SUBSCRIPTION_STATUS_ACTIVE
	user.UpdatedAt = timestamppb.Now()

	if err := h.store.UpdateUser(ctx, user); err != nil {
		log.Printf("[Stripe] Failed to update user %s after checkout: %v", userID, err)
	}

	// Update Firebase custom claims
	if h.firebaseAuth != nil {
		if err := h.firebaseAuth.SetSubscriptionClaims(ctx, userID, user.SubscriptionTier, user.SubscriptionStatus); err != nil {
			log.Printf("[Stripe] Warning: failed to set custom claims for user %s: %v", userID, err)
		}
	}
}

// handleSubscriptionUpdated maps Stripe subscription status to our proto enum.
func (h *StripeWebhookHandler) handleSubscriptionUpdated(ctx context.Context, event stripe.Event) {
	var sub struct {
		ID       string            `json:"id"`
		Status   string            `json:"status"`
		Metadata map[string]string `json:"metadata"`
	}
	if err := json.Unmarshal(event.Data.Raw, &sub); err != nil {
		log.Printf("[Stripe] Failed to parse customer.subscription.updated: %v", err)
		return
	}

	userID := sub.Metadata["pfinance_user_id"]
	if userID == "" {
		log.Printf("[Stripe] subscription.updated: missing pfinance_user_id in metadata (sub=%s)", sub.ID)
		return
	}

	log.Printf("[Stripe] Subscription updated: user=%s status=%s", userID, sub.Status)

	user, err := h.store.GetUser(ctx, userID)
	if err != nil {
		log.Printf("[Stripe] Failed to get user %s for subscription update: %v", userID, err)
		return
	}

	user.SubscriptionStatus = mapStripeStatus(sub.Status)
	user.UpdatedAt = timestamppb.Now()

	if err := h.store.UpdateUser(ctx, user); err != nil {
		log.Printf("[Stripe] Failed to update user %s subscription status: %v", userID, err)
	}

	// Update Firebase custom claims
	if h.firebaseAuth != nil {
		if err := h.firebaseAuth.SetSubscriptionClaims(ctx, userID, user.SubscriptionTier, user.SubscriptionStatus); err != nil {
			log.Printf("[Stripe] Warning: failed to set custom claims for user %s: %v", userID, err)
		}
	}
}

// handleSubscriptionDeleted downgrades user to FREE tier.
func (h *StripeWebhookHandler) handleSubscriptionDeleted(ctx context.Context, event stripe.Event) {
	var sub struct {
		ID       string            `json:"id"`
		Metadata map[string]string `json:"metadata"`
	}
	if err := json.Unmarshal(event.Data.Raw, &sub); err != nil {
		log.Printf("[Stripe] Failed to parse customer.subscription.deleted: %v", err)
		return
	}

	userID := sub.Metadata["pfinance_user_id"]
	if userID == "" {
		log.Printf("[Stripe] subscription.deleted: missing pfinance_user_id in metadata (sub=%s)", sub.ID)
		return
	}

	log.Printf("[Stripe] Subscription deleted: user=%s", userID)

	user, err := h.store.GetUser(ctx, userID)
	if err != nil {
		log.Printf("[Stripe] Failed to get user %s for subscription deletion: %v", userID, err)
		return
	}

	user.SubscriptionTier = pfinancev1.SubscriptionTier_SUBSCRIPTION_TIER_FREE
	user.SubscriptionStatus = pfinancev1.SubscriptionStatus_SUBSCRIPTION_STATUS_CANCELED
	user.UpdatedAt = timestamppb.Now()

	if err := h.store.UpdateUser(ctx, user); err != nil {
		log.Printf("[Stripe] Failed to update user %s after subscription deletion: %v", userID, err)
	}

	// Update Firebase custom claims
	if h.firebaseAuth != nil {
		if err := h.firebaseAuth.SetSubscriptionClaims(ctx, userID, user.SubscriptionTier, user.SubscriptionStatus); err != nil {
			log.Printf("[Stripe] Warning: failed to set custom claims for user %s: %v", userID, err)
		}
	}
}

// handlePaymentFailed marks the subscription as past due.
func (h *StripeWebhookHandler) handlePaymentFailed(ctx context.Context, event stripe.Event) {
	var invoice struct {
		Subscription string            `json:"subscription"`
		Metadata     map[string]string `json:"metadata"`
		// Customer-level metadata may also carry the user ID
		Customer string `json:"customer"`
	}
	if err := json.Unmarshal(event.Data.Raw, &invoice); err != nil {
		log.Printf("[Stripe] Failed to parse invoice.payment_failed: %v", err)
		return
	}

	// Try invoice metadata first, then fall back
	userID := invoice.Metadata["pfinance_user_id"]
	if userID == "" {
		log.Printf("[Stripe] invoice.payment_failed: missing pfinance_user_id (sub=%s customer=%s)", invoice.Subscription, invoice.Customer)
		return
	}

	log.Printf("[Stripe] Payment failed: user=%s", userID)

	user, err := h.store.GetUser(ctx, userID)
	if err != nil {
		log.Printf("[Stripe] Failed to get user %s for payment failure: %v", userID, err)
		return
	}

	user.SubscriptionStatus = pfinancev1.SubscriptionStatus_SUBSCRIPTION_STATUS_PAST_DUE
	user.UpdatedAt = timestamppb.Now()

	if err := h.store.UpdateUser(ctx, user); err != nil {
		log.Printf("[Stripe] Failed to update user %s subscription status to past_due: %v", userID, err)
	}

	// Update Firebase custom claims
	if h.firebaseAuth != nil {
		if err := h.firebaseAuth.SetSubscriptionClaims(ctx, userID, user.SubscriptionTier, user.SubscriptionStatus); err != nil {
			log.Printf("[Stripe] Warning: failed to set custom claims for user %s: %v", userID, err)
		}
	}
}

// mapStripeStatus converts a Stripe subscription status string to the proto enum.
func mapStripeStatus(status string) pfinancev1.SubscriptionStatus {
	switch status {
	case "active":
		return pfinancev1.SubscriptionStatus_SUBSCRIPTION_STATUS_ACTIVE
	case "past_due":
		return pfinancev1.SubscriptionStatus_SUBSCRIPTION_STATUS_PAST_DUE
	case "canceled", "unpaid":
		return pfinancev1.SubscriptionStatus_SUBSCRIPTION_STATUS_CANCELED
	case "trialing":
		return pfinancev1.SubscriptionStatus_SUBSCRIPTION_STATUS_TRIALING
	default:
		return pfinancev1.SubscriptionStatus_SUBSCRIPTION_STATUS_UNSPECIFIED
	}
}
