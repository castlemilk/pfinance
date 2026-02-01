package auth

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestExtractTokenFromHeader(t *testing.T) {
	tests := []struct {
		name        string
		authHeader  string
		expectedErr bool
		errContains string
		wantToken   string
	}{
		{
			name:        "empty header",
			authHeader:  "",
			expectedErr: true,
			errContains: "authorization header is required",
		},
		{
			name:        "no bearer prefix",
			authHeader:  "token123",
			expectedErr: true,
			errContains: "must be Bearer token",
		},
		{
			name:        "wrong prefix",
			authHeader:  "Basic token123",
			expectedErr: true,
			errContains: "must be Bearer token",
		},
		{
			name:        "bearer only no token",
			authHeader:  "Bearer",
			expectedErr: true,
			errContains: "must be Bearer token",
		},
		{
			name:        "valid bearer token",
			authHeader:  "Bearer mytoken123",
			expectedErr: false,
			wantToken:   "mytoken123",
		},
		{
			name:        "bearer lowercase",
			authHeader:  "bearer mytoken456",
			expectedErr: false,
			wantToken:   "mytoken456",
		},
		{
			name:        "bearer mixed case",
			authHeader:  "BEARER mytoken789",
			expectedErr: false,
			wantToken:   "mytoken789",
		},
		{
			name:        "token with spaces",
			authHeader:  "Bearer token with spaces",
			expectedErr: false,
			wantToken:   "token with spaces",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			token, err := ExtractTokenFromHeader(tt.authHeader)

			if tt.expectedErr {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tt.errContains)
				assert.Empty(t, token)
			} else {
				require.NoError(t, err)
				assert.Equal(t, tt.wantToken, token)
			}
		})
	}
}

func TestContextUserClaims(t *testing.T) {
	t.Run("WithUserClaims adds claims to context", func(t *testing.T) {
		ctx := context.Background()
		claims := &UserClaims{
			UID:         "test-uid",
			Email:       "test@example.com",
			DisplayName: "Test User",
			Picture:     "https://example.com/pic.jpg",
			Verified:    true,
		}

		newCtx := WithUserClaims(ctx, claims)

		retrievedClaims, ok := GetUserClaims(newCtx)
		require.True(t, ok)
		assert.Equal(t, claims.UID, retrievedClaims.UID)
		assert.Equal(t, claims.Email, retrievedClaims.Email)
		assert.Equal(t, claims.DisplayName, retrievedClaims.DisplayName)
		assert.Equal(t, claims.Picture, retrievedClaims.Picture)
		assert.Equal(t, claims.Verified, retrievedClaims.Verified)
	})

	t.Run("GetUserClaims returns false for empty context", func(t *testing.T) {
		ctx := context.Background()

		claims, ok := GetUserClaims(ctx)
		assert.False(t, ok)
		assert.Nil(t, claims)
	})

	t.Run("GetUserID returns UID when claims exist", func(t *testing.T) {
		ctx := context.Background()
		claims := &UserClaims{UID: "user-123"}
		ctx = WithUserClaims(ctx, claims)

		uid, ok := GetUserID(ctx)
		assert.True(t, ok)
		assert.Equal(t, "user-123", uid)
	})

	t.Run("GetUserID returns empty for empty context", func(t *testing.T) {
		ctx := context.Background()

		uid, ok := GetUserID(ctx)
		assert.False(t, ok)
		assert.Empty(t, uid)
	})
}

func TestIsPublicEndpoint(t *testing.T) {
	tests := []struct {
		name      string
		procedure string
		expected  bool
	}{
		{"health endpoint", "/health", true},
		{"ping endpoint", "/ping", true},
		{"finance service endpoint", "/pfinance.v1.FinanceService/CreateExpense", false},
		{"other endpoint", "/api/v1/users", false},
		{"empty endpoint", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := isPublicEndpoint(tt.procedure)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestUserClaims(t *testing.T) {
	t.Run("UserClaims struct holds all fields", func(t *testing.T) {
		claims := &UserClaims{
			UID:         "uid-12345",
			Email:       "user@example.com",
			DisplayName: "John Doe",
			Picture:     "https://example.com/avatar.png",
			Verified:    true,
		}

		assert.Equal(t, "uid-12345", claims.UID)
		assert.Equal(t, "user@example.com", claims.Email)
		assert.Equal(t, "John Doe", claims.DisplayName)
		assert.Equal(t, "https://example.com/avatar.png", claims.Picture)
		assert.True(t, claims.Verified)
	})

	t.Run("UserClaims can be partially filled", func(t *testing.T) {
		claims := &UserClaims{
			UID:   "uid-only",
			Email: "email@test.com",
		}

		assert.Equal(t, "uid-only", claims.UID)
		assert.Equal(t, "email@test.com", claims.Email)
		assert.Empty(t, claims.DisplayName)
		assert.Empty(t, claims.Picture)
		assert.False(t, claims.Verified)
	})
}
