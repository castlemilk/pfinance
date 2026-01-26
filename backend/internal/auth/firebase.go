package auth

import (
	"context"
	"fmt"
	"os"
	"strings"

	"firebase.google.com/go/v4"
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
	Verified    bool
}

// NewFirebaseAuth creates a new Firebase auth client
func NewFirebaseAuth(ctx context.Context) (*FirebaseAuth, error) {
	// Initialize Firebase app
	var app *firebase.App
	var err error

	// Try to use service account key if available
	if credentialsPath := getServiceAccountPath(); credentialsPath != "" {
		opt := option.WithCredentialsFile(credentialsPath)
		app, err = firebase.NewApp(ctx, nil, opt)
	} else {
		// Use default credentials (for Cloud Run)
		app, err = firebase.NewApp(ctx, nil)
	}

	if err != nil {
		return nil, fmt.Errorf("failed to initialize Firebase app: %w", err)
	}

	// Get Auth client
	client, err := app.Auth(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize Firebase Auth client: %w", err)
	}

	return &FirebaseAuth{
		client: client,
	}, nil
}

// VerifyToken verifies a Firebase ID token and returns user claims
func (f *FirebaseAuth) VerifyToken(ctx context.Context, idToken string) (*UserClaims, error) {
	// Verify the ID token
	token, err := f.client.VerifyIDToken(ctx, idToken)
	if err != nil {
		return nil, fmt.Errorf("failed to verify ID token: %w", err)
	}

	// Extract user information
	claims := &UserClaims{
		UID:      token.UID,
		Verified: token.Claims["email_verified"].(bool),
	}

	// Get email if available
	if email, ok := token.Claims["email"].(string); ok {
		claims.Email = email
	}

	// Get display name if available
	if name, ok := token.Claims["name"].(string); ok {
		claims.DisplayName = name
	}

	return claims, nil
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
