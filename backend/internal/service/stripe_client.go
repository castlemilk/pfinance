package service

import (
	"fmt"
	"time"

	"github.com/stripe/stripe-go/v82"
	"github.com/stripe/stripe-go/v82/checkout/session"
	"github.com/stripe/stripe-go/v82/customer"
	stripesub "github.com/stripe/stripe-go/v82/subscription"
)

// StripeClient wraps the Stripe API for subscription management.
type StripeClient struct {
	priceID string
}

// NewStripeClient creates a new Stripe API wrapper.
// stripe.Key must be set globally before calling Stripe APIs.
func NewStripeClient(priceID string) *StripeClient {
	return &StripeClient{priceID: priceID}
}

// GetOrCreateCustomer finds an existing Stripe customer by email or creates a new one.
// The PFinance user ID is stored in the customer metadata.
func (c *StripeClient) GetOrCreateCustomer(email, userID string) (string, error) {
	// Search for existing customer by email
	params := &stripe.CustomerSearchParams{}
	params.Query = fmt.Sprintf("email:'%s'", email)
	iter := customer.Search(params)
	for iter.Next() {
		return iter.Customer().ID, nil
	}
	if err := iter.Err(); err != nil {
		return "", fmt.Errorf("search customers: %w", err)
	}

	// Create new customer
	createParams := &stripe.CustomerParams{
		Email: stripe.String(email),
		Metadata: map[string]string{
			"pfinance_user_id": userID,
		},
	}
	cust, err := customer.New(createParams)
	if err != nil {
		return "", fmt.Errorf("create customer: %w", err)
	}
	return cust.ID, nil
}

// CheckoutResult holds the result of creating a checkout session.
type CheckoutResult struct {
	URL       string
	SessionID string
}

// CreateCheckoutSession creates a Stripe Checkout session for the Pro plan.
func (c *StripeClient) CreateCheckoutSession(customerID, userID, successURL, cancelURL string) (*CheckoutResult, error) {
	params := &stripe.CheckoutSessionParams{
		Customer: stripe.String(customerID),
		Mode:     stripe.String(string(stripe.CheckoutSessionModeSubscription)),
		LineItems: []*stripe.CheckoutSessionLineItemParams{
			{
				Price:    stripe.String(c.priceID),
				Quantity: stripe.Int64(1),
			},
		},
		SuccessURL: stripe.String(successURL),
		CancelURL:  stripe.String(cancelURL),
		Metadata: map[string]string{
			"pfinance_user_id": userID,
		},
		SubscriptionData: &stripe.CheckoutSessionSubscriptionDataParams{
			Metadata: map[string]string{
				"pfinance_user_id": userID,
			},
		},
	}

	sess, err := session.New(params)
	if err != nil {
		return nil, fmt.Errorf("create checkout session: %w", err)
	}
	return &CheckoutResult{URL: sess.URL, SessionID: sess.ID}, nil
}

// SubscriptionInfo holds details about a Stripe subscription.
type StripeSubscriptionInfo struct {
	ID                 string
	Status             stripe.SubscriptionStatus
	CurrentPeriodEnd   time.Time
	CancelAtPeriodEnd  bool
}

// GetSubscription retrieves a Stripe subscription by ID.
func (c *StripeClient) GetSubscription(subscriptionID string) (*StripeSubscriptionInfo, error) {
	sub, err := stripesub.Get(subscriptionID, nil)
	if err != nil {
		return nil, fmt.Errorf("get subscription: %w", err)
	}
	return subscriptionToInfo(sub), nil
}

// CancelSubscriptionAtPeriodEnd cancels a subscription at the end of the current period.
func (c *StripeClient) CancelSubscriptionAtPeriodEnd(subscriptionID string) (*StripeSubscriptionInfo, error) {
	params := &stripe.SubscriptionParams{
		CancelAtPeriodEnd: stripe.Bool(true),
	}
	sub, err := stripesub.Update(subscriptionID, params)
	if err != nil {
		return nil, fmt.Errorf("cancel subscription: %w", err)
	}
	return subscriptionToInfo(sub), nil
}

// subscriptionToInfo converts a Stripe subscription to our info struct.
// In stripe-go v82, CurrentPeriodEnd lives on the subscription items.
func subscriptionToInfo(sub *stripe.Subscription) *StripeSubscriptionInfo {
	var periodEnd time.Time
	if sub.Items != nil && len(sub.Items.Data) > 0 {
		periodEnd = time.Unix(sub.Items.Data[0].CurrentPeriodEnd, 0)
	}
	return &StripeSubscriptionInfo{
		ID:                sub.ID,
		Status:            sub.Status,
		CurrentPeriodEnd:  periodEnd,
		CancelAtPeriodEnd: sub.CancelAtPeriodEnd,
	}
}
