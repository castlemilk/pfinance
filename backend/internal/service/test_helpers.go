package service

import (
	"context"

	"github.com/castlemilk/pfinance/backend/internal/auth"
)

// testContextWithUser creates a context with authenticated user claims for testing
func testContextWithUser(userID string) context.Context {
	return auth.WithUserClaims(context.Background(), &auth.UserClaims{
		UID:   userID,
		Email: userID + "@test.local",
	})
}

// testContextWithUserEmail creates a context with authenticated user claims including email
func testContextWithUserEmail(userID, email string) context.Context {
	return auth.WithUserClaims(context.Background(), &auth.UserClaims{
		UID:   userID,
		Email: email,
	})
}
