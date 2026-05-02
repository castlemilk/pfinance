// admin-tier is a one-shot CLI for granting/revoking Pro tier on a Firebase user.
//
// Usage:
//
//	go run ./cmd/admin-tier -email user@example.com -tier pro
//	go run ./cmd/admin-tier -uid abc123                -tier free
//
// Requires GOOGLE_APPLICATION_CREDENTIALS pointing at a Firebase service account
// JSON (the same one the server uses) and GOOGLE_CLOUD_PROJECT for Firestore.
//
// Updates Firebase custom claims AND the Firestore user doc, matching what the
// admin UI's SetUserTier RPC does.
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"cloud.google.com/go/firestore"
	firebase "firebase.google.com/go/v4"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	authpkg "github.com/castlemilk/pfinance/backend/internal/auth"
	"github.com/castlemilk/pfinance/backend/internal/store"
)

func main() {
	var (
		emailFlag = flag.String("email", "", "user email")
		uidFlag   = flag.String("uid", "", "user UID (alternative to -email)")
		tierFlag  = flag.String("tier", "pro", "target tier: pro|free")
	)
	flag.Parse()

	if *emailFlag == "" && *uidFlag == "" {
		log.Fatal("provide either -email or -uid")
	}

	tier, status := parseTier(*tierFlag)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Initialize Firebase SDK directly — we need both the wrapper (for
	// SetSubscriptionClaims) and the raw auth client (for GetUserByEmail).
	app, err := firebase.NewApp(ctx, nil)
	if err != nil {
		log.Fatalf("init firebase app: %v", err)
	}
	rawAuth, err := app.Auth(ctx)
	if err != nil {
		log.Fatalf("init firebase auth client: %v", err)
	}
	fbAuth, err := authpkg.NewFirebaseAuth(ctx)
	if err != nil {
		log.Fatalf("init firebase auth wrapper: %v", err)
	}

	uid := *uidFlag
	if uid == "" {
		userRecord, err := rawAuth.GetUserByEmail(ctx, strings.TrimSpace(*emailFlag))
		if err != nil {
			log.Fatalf("look up email %s: %v", *emailFlag, err)
		}
		uid = userRecord.UID
		log.Printf("Resolved %s -> uid=%s", *emailFlag, uid)
	}

	// 1. Update Firebase custom claims
	if err := fbAuth.SetSubscriptionClaims(ctx, uid, tier, status); err != nil {
		log.Fatalf("set subscription claims: %v", err)
	}
	log.Printf("✅ Updated Firebase custom claims for %s: tier=%v status=%v", uid, tier, status)

	// 2. Update Firestore user doc (if Firestore is configured)
	projectID := os.Getenv("GOOGLE_CLOUD_PROJECT")
	if projectID == "" {
		projectID = "pfinance-app-1748773335"
	}
	fsClient, err := firestore.NewClient(ctx, projectID)
	if err != nil {
		log.Printf("⚠️  Firestore client unavailable (%v) — claims-only update", err)
		return
	}
	defer fsClient.Close()

	storeImpl := store.NewFirestoreStore(fsClient)
	user, err := storeImpl.GetUser(ctx, uid)
	if err != nil || user == nil {
		fbUser, fbErr := rawAuth.GetUser(ctx, uid)
		if fbErr != nil {
			log.Fatalf("user %s not found in Firebase: %v", uid, fbErr)
		}
		user = &pfinancev1.User{
			Id:          uid,
			Email:       fbUser.Email,
			DisplayName: fbUser.DisplayName,
			PhotoUrl:    fbUser.PhotoURL,
		}
	}
	user.SubscriptionTier = tier
	user.SubscriptionStatus = status
	if err := storeImpl.UpdateUser(ctx, user); err != nil {
		log.Fatalf("update user store: %v", err)
	}
	log.Printf("✅ Updated Firestore user doc for %s", uid)
	fmt.Println("Done. The user must refresh their ID token (sign out / sign in) to see Pro features.")
}

func parseTier(s string) (pfinancev1.SubscriptionTier, pfinancev1.SubscriptionStatus) {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "pro":
		return pfinancev1.SubscriptionTier_SUBSCRIPTION_TIER_PRO,
			pfinancev1.SubscriptionStatus_SUBSCRIPTION_STATUS_ACTIVE
	case "free":
		return pfinancev1.SubscriptionTier_SUBSCRIPTION_TIER_FREE,
			pfinancev1.SubscriptionStatus_SUBSCRIPTION_STATUS_UNSPECIFIED
	default:
		log.Fatalf("invalid tier %q (must be pro|free)", s)
		return 0, 0
	}
}
