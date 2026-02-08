package auth

import (
	"context"
	"fmt"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
)

type subscriptionKey struct{}

// SubscriptionInfo holds the user's subscription details extracted during auth
type SubscriptionInfo struct {
	Tier   pfinancev1.SubscriptionTier
	Status pfinancev1.SubscriptionStatus
}

// WithSubscription adds subscription info to context
func WithSubscription(ctx context.Context, info *SubscriptionInfo) context.Context {
	return context.WithValue(ctx, subscriptionKey{}, info)
}

// GetSubscription retrieves subscription info from context
func GetSubscription(ctx context.Context) *SubscriptionInfo {
	info, _ := ctx.Value(subscriptionKey{}).(*SubscriptionInfo)
	return info
}

// RequireProTier checks if the user has a Pro subscription. Returns an error if not.
func RequireProTier(ctx context.Context) error {
	info := GetSubscription(ctx)
	if info == nil || info.Tier != pfinancev1.SubscriptionTier_SUBSCRIPTION_TIER_PRO {
		return connect.NewError(connect.CodePermissionDenied,
			fmt.Errorf("this feature requires a Pro subscription"))
	}
	if info.Status != pfinancev1.SubscriptionStatus_SUBSCRIPTION_STATUS_ACTIVE &&
		info.Status != pfinancev1.SubscriptionStatus_SUBSCRIPTION_STATUS_TRIALING {
		return connect.NewError(connect.CodePermissionDenied,
			fmt.Errorf("your subscription is not active"))
	}
	return nil
}
