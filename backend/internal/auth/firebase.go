package auth

import (
	"context"
	"fmt"
	"os"
	"strings"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/auth"
	"google.golang.org/api/option"
)

// FirebaseAuth handles Firebase authentication
type FirebaseAuth struct {
	client *auth.Client
}

// UserClaims represents the authenticated user information
type UserClaims struct {
	UID         string
	Email       string
	DisplayName string
	Picture     string
	Verified    bool
}

// NewFirebaseAuth creates a new FirebaseAuth instance
func NewFirebaseAuth(ctx context.Context) (*FirebaseAuth, error) {
	opts := []option.ClientOption{}

	// Check if running on Cloud Run (default credentials work automatically)
	// If locally, check for service account key
	if creds := getServiceAccountPath(); creds != "" {
		opts = append(opts, option.WithCredentialsFile(creds))
	}

	app, err := firebase.NewApp(ctx, nil, opts...)
	if err != nil {
		return nil, fmt.Errorf("error initializing app: %v", err)
	}

	client, err := app.Auth(ctx)
	if err != nil {
		return nil, fmt.Errorf("error getting Auth client: %v", err)
	}

	return &FirebaseAuth{
		client: client,
	}, nil
}

// VerifyToken verifies a Firebase ID token and returns user claims plus the raw token claims map.
func (f *FirebaseAuth) VerifyToken(ctx context.Context, idToken string) (*UserClaims, map[string]interface{}, error) {
	// Verify the ID token
	token, err := f.client.VerifyIDToken(ctx, idToken)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to verify ID token: %w", err)
	}

	// Extract user information
	verified, _ := token.Claims["email_verified"].(bool)
	claims := &UserClaims{
		UID:      token.UID,
		Verified: verified,
	}

	// Get email if available
	if email, ok := token.Claims["email"].(string); ok {
		claims.Email = email
	}

	// Get display name if available
	if name, ok := token.Claims["name"].(string); ok {
		claims.DisplayName = name
	}

	// Get picture URL if available
	if picture, ok := token.Claims["picture"].(string); ok {
		claims.Picture = picture
	}

	return claims, token.Claims, nil
}

// ExtractTokenFromHeader extracts the Bearer token from Authorization header
func ExtractTokenFromHeader(authHeader string) (string, error) {
	if authHeader == "" {
		return "", fmt.Errorf("authorization header is required")
	}

	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
		return "", fmt.Errorf("authorization header must be Bearer token")
	}

	return parts[1], nil
}

// getServiceAccountPath returns the path to service account key file if available
func getServiceAccountPath() string {
	// Check common environment variables
	paths := []string{
		"GOOGLE_APPLICATION_CREDENTIALS",
		"FIREBASE_SERVICE_ACCOUNT_KEY",
	}

	for _, envVar := range paths {
		if path := getEnv(envVar); path != "" {
			return path
		}
	}

	return ""
}

// getEnv gets environment variable
func getEnv(key string) string {
	return os.Getenv(key)
}
