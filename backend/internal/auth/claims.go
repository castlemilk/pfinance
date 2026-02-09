package auth

import (
	"context"
	"fmt"
	"log"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
)

// SetSubscriptionClaims sets custom claims on a Firebase user for subscription info.
// These claims are included in the user's ID token and can be checked client-side.
func (f *FirebaseAuth) SetSubscriptionClaims(ctx context.Context, uid string, tier pfinancev1.SubscriptionTier, status pfinancev1.SubscriptionStatus) error {
	claims := map[string]interface{}{
		"subscription_tier":   tierToClaimString(tier),
		"subscription_status": statusToClaimString(status),
	}

	if err := f.client.SetCustomUserClaims(ctx, uid, claims); err != nil {
		return fmt.Errorf("set custom claims for user %s: %w", uid, err)
	}

	log.Printf("[Auth] Updated custom claims for user %s: tier=%s status=%s", uid, tierToClaimString(tier), statusToClaimString(status))
	return nil
}

// tierToClaimString converts a proto SubscriptionTier enum to a simple string for Firebase custom claims.
func tierToClaimString(tier pfinancev1.SubscriptionTier) string {
	switch tier {
	case pfinancev1.SubscriptionTier_SUBSCRIPTION_TIER_PRO:
		return "PRO"
	default:
		return "FREE"
	}
}

// statusToClaimString converts a proto SubscriptionStatus enum to a simple string for Firebase custom claims.
func statusToClaimString(status pfinancev1.SubscriptionStatus) string {
	switch status {
	case pfinancev1.SubscriptionStatus_SUBSCRIPTION_STATUS_ACTIVE:
		return "ACTIVE"
	case pfinancev1.SubscriptionStatus_SUBSCRIPTION_STATUS_TRIALING:
		return "TRIALING"
	case pfinancev1.SubscriptionStatus_SUBSCRIPTION_STATUS_PAST_DUE:
		return "PAST_DUE"
	case pfinancev1.SubscriptionStatus_SUBSCRIPTION_STATUS_CANCELED:
		return "CANCELED"
	default:
		return ""
	}
}

// GetSubscriptionClaimsFromToken extracts subscription info from Firebase token custom claims.
func GetSubscriptionClaimsFromToken(claims map[string]interface{}) *SubscriptionInfo {
	info := &SubscriptionInfo{
		Tier:   pfinancev1.SubscriptionTier_SUBSCRIPTION_TIER_FREE,
		Status: pfinancev1.SubscriptionStatus_SUBSCRIPTION_STATUS_UNSPECIFIED,
	}

	if tierStr, ok := claims["subscription_tier"].(string); ok {
		switch tierStr {
		case "PRO":
			info.Tier = pfinancev1.SubscriptionTier_SUBSCRIPTION_TIER_PRO
		default:
			info.Tier = pfinancev1.SubscriptionTier_SUBSCRIPTION_TIER_FREE
		}
	}

	if statusStr, ok := claims["subscription_status"].(string); ok {
		switch statusStr {
		case "ACTIVE":
			info.Status = pfinancev1.SubscriptionStatus_SUBSCRIPTION_STATUS_ACTIVE
		case "TRIALING":
			info.Status = pfinancev1.SubscriptionStatus_SUBSCRIPTION_STATUS_TRIALING
		case "PAST_DUE":
			info.Status = pfinancev1.SubscriptionStatus_SUBSCRIPTION_STATUS_PAST_DUE
		case "CANCELED":
			info.Status = pfinancev1.SubscriptionStatus_SUBSCRIPTION_STATUS_CANCELED
		}
	}

	return info
}
