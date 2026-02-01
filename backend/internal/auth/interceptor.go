package auth

import (
	"context"

	"connectrpc.com/connect"
)

// AuthInterceptor creates a Connect interceptor for Firebase authentication
func AuthInterceptor(firebaseAuth *FirebaseAuth) connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			// Skip auth for health checks or other public endpoints
			if isPublicEndpoint(req.Spec().Procedure) {
				return next(ctx, req)
			}

			// Extract token from Authorization header
			authHeader := req.Header().Get("Authorization")
			if authHeader == "" {
				return nil, connect.NewError(connect.CodeUnauthenticated, nil)
			}

			token, err := ExtractTokenFromHeader(authHeader)
			if err != nil {
				return nil, connect.NewError(connect.CodeUnauthenticated, err)
			}

			// Verify the token
			claims, err := firebaseAuth.VerifyToken(ctx, token)
			if err != nil {
				return nil, connect.NewError(connect.CodeUnauthenticated, err)
			}

			// Add user claims to context
			ctx = withUserClaims(ctx, claims)

			return next(ctx, req)
		}
	}
}

// DebugAuthInterceptor creates an interceptor that allows impersonation via header
// ONLY use this in development - never in production!
func DebugAuthInterceptor(skipAuth bool) connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			// Only allow impersonation when auth is skipped (dev mode)
			if skipAuth {
				impersonateUser := req.Header().Get("X-Debug-Impersonate-User")
				if impersonateUser != "" {
					// Create fake claims for the impersonated user
					claims := &UserClaims{
						UID:   impersonateUser,
						Email: impersonateUser + "@debug.local",
					}
					ctx = withUserClaims(ctx, claims)
				}
			}
			return next(ctx, req)
		}
	}
}

// isPublicEndpoint checks if an endpoint should be accessible without authentication
func isPublicEndpoint(procedure string) bool {
	publicEndpoints := []string{
		"/health",
		"/ping",
		// Add other public endpoints here
	}

	for _, endpoint := range publicEndpoints {
		if procedure == endpoint {
			return true
		}
	}

	return false
}

// Context keys
type contextKey string

const userClaimsKey contextKey = "user_claims"

// withUserClaims adds user claims to the context
func withUserClaims(ctx context.Context, claims *UserClaims) context.Context {
	return context.WithValue(ctx, userClaimsKey, claims)
}

// WithUserClaims is the exported version for testing purposes
func WithUserClaims(ctx context.Context, claims *UserClaims) context.Context {
	return withUserClaims(ctx, claims)
}

// GetUserClaims extracts user claims from context
func GetUserClaims(ctx context.Context) (*UserClaims, bool) {
	claims, ok := ctx.Value(userClaimsKey).(*UserClaims)
	return claims, ok
}

// GetUserID is a convenience function to get the user ID from context
func GetUserID(ctx context.Context) (string, bool) {
	if claims, ok := GetUserClaims(ctx); ok {
		return claims.UID, true
	}
	return "", false
}

