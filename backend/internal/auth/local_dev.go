package auth

import (
	"context"

	"connectrpc.com/connect"
)

// LocalDevInterceptor provides a mock user context for local development
func LocalDevInterceptor() connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			// Skip auth for health checks or other public endpoints
			if isPublicEndpoint(req.Spec().Procedure) {
				return next(ctx, req)
			}

			// Add a mock user context for local development
			userClaims := &UserClaims{
				UID:         "local-dev-user",
				Email:       "dev@localhost",
				DisplayName: "Local Dev User",
				Verified:    true,
			}
			ctx = withUserClaims(ctx, userClaims)

			return next(ctx, req)
		}
	}
}
