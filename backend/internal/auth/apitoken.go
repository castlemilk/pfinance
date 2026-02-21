package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log"
	"time"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
)

// ApiTokenStore defines the minimal store interface needed by the API token interceptor.
type ApiTokenStore interface {
	GetApiTokenByHash(ctx context.Context, hash string) (*pfinancev1.ApiToken, error)
	GetUser(ctx context.Context, userID string) (*pfinancev1.User, error)
	UpdateApiTokenLastUsed(ctx context.Context, tokenID string, lastUsed time.Time) error
}

// GenerateApiToken creates a new raw token ("pf_" + 64 hex chars from 32 random bytes),
// returning the raw token, its SHA-256 hash, and the prefix (first 8 chars of full token).
func GenerateApiToken() (raw string, hash string, prefix string, err error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", "", "", fmt.Errorf("generate random bytes: %w", err)
	}
	raw = "pf_" + hex.EncodeToString(b)
	hash = HashApiToken(raw)
	prefix = raw[:8] // "pf_" + first 5 hex chars
	return raw, hash, prefix, nil
}

// HashApiToken computes the SHA-256 hex digest of a raw token.
func HashApiToken(raw string) string {
	h := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(h[:])
}

// ApiTokenInterceptor checks the X-API-Key header, validates against the store,
// and sets UserClaims + SubscriptionInfo in context.
// If no X-API-Key header is present, the request falls through to the next interceptor.
// firebaseAuth is optional — when provided, it's used to look up subscription claims
// from Firebase custom claims if no user doc exists in the store.
func ApiTokenInterceptor(store ApiTokenStore, firebaseAuth ...*FirebaseAuth) connect.UnaryInterceptorFunc {
	var fbAuth *FirebaseAuth
	if len(firebaseAuth) > 0 {
		fbAuth = firebaseAuth[0]
	}

	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			apiKey := req.Header().Get("X-API-Key")
			if apiKey == "" {
				// No API key — fall through to normal auth
				return next(ctx, req)
			}

			// Hash the raw token
			tokenHash := HashApiToken(apiKey)

			// Look up the token
			apiToken, err := store.GetApiTokenByHash(ctx, tokenHash)
			if err != nil {
				return nil, connect.NewError(connect.CodeUnauthenticated, fmt.Errorf("invalid API token"))
			}

			// Check expiry
			if apiToken.ExpiresAt != nil && apiToken.ExpiresAt.IsValid() {
				if apiToken.ExpiresAt.AsTime().Before(time.Now()) {
					return nil, connect.NewError(connect.CodeUnauthenticated, fmt.Errorf("API token has expired"))
				}
			}

			// Look up user for current subscription status and profile info
			user, userErr := store.GetUser(ctx, apiToken.UserId)

			// Set UserClaims in context — even if user doc doesn't exist, we know the UID from the token
			claims := &UserClaims{
				UID:      apiToken.UserId,
				Verified: true,
			}
			subInfo := &SubscriptionInfo{}

			if userErr == nil && user != nil {
				// User doc found — use it for profile and subscription info
				claims.Email = user.Email
				claims.DisplayName = user.DisplayName
				subInfo.Tier = user.SubscriptionTier
				subInfo.Status = user.SubscriptionStatus
			} else if fbAuth != nil {
				// User doc not found — fall back to Firebase custom claims
				log.Printf("[API Token] User doc not found for %s, checking Firebase custom claims", apiToken.UserId)
				fbUser, fbErr := fbAuth.client.GetUser(ctx, apiToken.UserId)
				if fbErr == nil && fbUser != nil {
					claims.Email = fbUser.Email
					claims.DisplayName = fbUser.DisplayName
					if fbUser.CustomClaims != nil {
						subInfo = GetSubscriptionClaimsFromToken(fbUser.CustomClaims)
					}
					log.Printf("[API Token] Got Firebase claims for %s: tier=%v status=%v", apiToken.UserId, subInfo.Tier, subInfo.Status)
				} else {
					log.Printf("[API Token] Firebase lookup also failed for %s: %v", apiToken.UserId, fbErr)
				}
			} else {
				log.Printf("[API Token] User doc not found for %s, no Firebase Auth available: %v", apiToken.UserId, userErr)
			}

			ctx = withUserClaims(ctx, claims)
			ctx = WithSubscription(ctx, subInfo)

			log.Printf("[API Token] Authenticated user %s via token %s (tier=%v)", claims.UID, apiToken.TokenPrefix, subInfo.Tier)

			// Fire-and-forget: update last_used_at
			go func() {
				bgCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()
				if err := store.UpdateApiTokenLastUsed(bgCtx, apiToken.Id, time.Now()); err != nil {
					log.Printf("[API Token] Failed to update last_used_at for token %s: %v", apiToken.Id, err)
				}
			}()

			return next(ctx, req)
		}
	}
}
