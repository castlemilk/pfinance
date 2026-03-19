package main

import (
	"fmt"
	"os"
)

// isProductionEnvironment returns true if the current environment appears to be
// production based on ENV, GOOGLE_CLOUD_PROJECT, or K_SERVICE (Cloud Run).
func isProductionEnvironment() bool {
	env := os.Getenv("ENV")
	if env == "local" || env == "development" {
		return false
	}

	// Explicit production env
	if env == "production" || env == "staging" {
		return true
	}

	// Cloud Run always sets K_SERVICE
	if os.Getenv("K_SERVICE") != "" {
		return true
	}

	// GOOGLE_CLOUD_PROJECT indicates GCP deployment
	if os.Getenv("GOOGLE_CLOUD_PROJECT") != "" {
		return true
	}

	// ENV unset and no cloud indicators — assume production (safe default)
	if env == "" {
		return true
	}

	return false
}

// validateSkipAuth checks that SKIP_AUTH is not enabled in a production
// environment. Returns an error describing the violation if it is.
func validateSkipAuth(skipAuth bool) error {
	if !skipAuth {
		return nil
	}
	if !isProductionEnvironment() {
		return nil
	}

	env := os.Getenv("ENV")
	if env == "" {
		env = "(unset, defaults to production)"
	}
	return fmt.Errorf(
		"FATAL: SKIP_AUTH=true is forbidden in production environments "+
			"(ENV=%s, GOOGLE_CLOUD_PROJECT=%q, K_SERVICE=%q). "+
			"Set ENV=local or ENV=development for non-production use",
		env, os.Getenv("GOOGLE_CLOUD_PROJECT"), os.Getenv("K_SERVICE"),
	)
}
