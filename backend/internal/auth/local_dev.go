package auth

import (
	"context"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
)

// LocalDevInterceptor provides a mock user context for local development
// It supports impersonation via the X-Debug-User-ID header for testing different users
func LocalDevInterceptor() connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			// Skip auth for health checks or other public endpoints
			if isPublicEndpoint(req.Spec().Procedure) {
				return next(ctx, req)
			}

			// Skip if already authenticated (e.g., by API token interceptor)
			if _, ok := GetUserClaims(ctx); ok {
				return next(ctx, req)
			}

			// Check for debug user ID header (sent by frontend in dev mode)
			debugUserID := req.Header().Get("X-Debug-User-ID")
			debugUserEmail := req.Header().Get("X-Debug-User-Email")
			debugUserName := req.Header().Get("X-Debug-User-Name")

			// Also check the impersonate header for backwards compatibility
			if debugUserID == "" {
				debugUserID = req.Header().Get("X-Debug-Impersonate-User")
			}

			// Use debug headers if provided, otherwise fall back to default dev user
			userClaims := &UserClaims{
				UID:         "local-dev-user",
				Email:       "dev@localhost",
				DisplayName: "Local Dev User",
				Verified:    true,
			}

			if debugUserID != "" {
				userClaims.UID = debugUserID
				if debugUserEmail != "" {
					userClaims.Email = debugUserEmail
				} else {
					userClaims.Email = debugUserID + "@debug.local"
				}
				if debugUserName != "" {
					userClaims.DisplayName = debugUserName
				} else {
					userClaims.DisplayName = "Debug User"
				}
			}

			ctx = withUserClaims(ctx, userClaims)

			// In local dev, grant Pro subscription so all features are testable
			ctx = WithSubscription(ctx, &SubscriptionInfo{
				Tier:   pfinancev1.SubscriptionTier_SUBSCRIPTION_TIER_PRO,
				Status: pfinancev1.SubscriptionStatus_SUBSCRIPTION_STATUS_ACTIVE,
			})

			return next(ctx, req)
		}
	}
}
