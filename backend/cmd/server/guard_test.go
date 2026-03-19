package main

import (
	"os"
	"testing"
)

func TestValidateSkipAuth(t *testing.T) {
	// Helper to clear all relevant env vars before each subtest.
	clearEnv := func(t *testing.T) {
		t.Helper()
		for _, key := range []string{"ENV", "GOOGLE_CLOUD_PROJECT", "K_SERVICE", "SKIP_AUTH"} {
			t.Setenv(key, "")
			os.Unsetenv(key)
		}
	}

	t.Run("skip_auth_false_always_ok", func(t *testing.T) {
		clearEnv(t)
		// Even in production, SKIP_AUTH=false should be fine.
		t.Setenv("ENV", "production")
		if err := validateSkipAuth(false); err != nil {
			t.Fatalf("expected no error when skipAuth=false, got: %v", err)
		}
	})

	t.Run("local_env_allows_skip_auth", func(t *testing.T) {
		clearEnv(t)
		t.Setenv("ENV", "local")
		if err := validateSkipAuth(true); err != nil {
			t.Fatalf("expected no error for ENV=local, got: %v", err)
		}
	})

	t.Run("development_env_allows_skip_auth", func(t *testing.T) {
		clearEnv(t)
		t.Setenv("ENV", "development")
		if err := validateSkipAuth(true); err != nil {
			t.Fatalf("expected no error for ENV=development, got: %v", err)
		}
	})

	t.Run("production_env_blocks_skip_auth", func(t *testing.T) {
		clearEnv(t)
		t.Setenv("ENV", "production")
		if err := validateSkipAuth(true); err == nil {
			t.Fatal("expected error for ENV=production with skipAuth=true")
		}
	})

	t.Run("staging_env_blocks_skip_auth", func(t *testing.T) {
		clearEnv(t)
		t.Setenv("ENV", "staging")
		if err := validateSkipAuth(true); err == nil {
			t.Fatal("expected error for ENV=staging with skipAuth=true")
		}
	})

	t.Run("unset_env_blocks_skip_auth", func(t *testing.T) {
		clearEnv(t)
		// ENV unset should default to production behavior.
		if err := validateSkipAuth(true); err == nil {
			t.Fatal("expected error when ENV is unset with skipAuth=true")
		}
	})

	t.Run("google_cloud_project_blocks_skip_auth", func(t *testing.T) {
		clearEnv(t)
		// Even with a non-standard ENV, GOOGLE_CLOUD_PROJECT signals production.
		t.Setenv("ENV", "custom")
		t.Setenv("GOOGLE_CLOUD_PROJECT", "pfinance-app-1748773335")
		if err := validateSkipAuth(true); err == nil {
			t.Fatal("expected error when GOOGLE_CLOUD_PROJECT is set with skipAuth=true")
		}
	})

	t.Run("k_service_blocks_skip_auth", func(t *testing.T) {
		clearEnv(t)
		// K_SERVICE is set by Cloud Run — always means production.
		t.Setenv("ENV", "custom")
		t.Setenv("K_SERVICE", "pfinance-backend")
		if err := validateSkipAuth(true); err == nil {
			t.Fatal("expected error when K_SERVICE is set with skipAuth=true")
		}
	})

	t.Run("local_env_overrides_cloud_indicators", func(t *testing.T) {
		clearEnv(t)
		// If someone explicitly sets ENV=local, allow it even with GCP vars
		// (e.g., local testing against a real Firestore).
		t.Setenv("ENV", "local")
		t.Setenv("GOOGLE_CLOUD_PROJECT", "pfinance-app-1748773335")
		t.Setenv("K_SERVICE", "something")
		if err := validateSkipAuth(true); err != nil {
			t.Fatalf("expected no error for ENV=local even with cloud indicators, got: %v", err)
		}
	})
}
