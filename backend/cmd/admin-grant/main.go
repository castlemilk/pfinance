// admin-grant grants or revokes the `admin: true` Firebase custom claim.
//
// Usage:
//
//	go run ./cmd/admin-grant -email user@example.com         # grant
//	go run ./cmd/admin-grant -email user@example.com -revoke # revoke
package main

import (
	"context"
	"flag"
	"log"
	"strings"
	"time"

	firebase "firebase.google.com/go/v4"
	authpkg "github.com/castlemilk/pfinance/backend/internal/auth"
)

func main() {
	emailFlag := flag.String("email", "", "user email")
	uidFlag := flag.String("uid", "", "user UID (alternative to -email)")
	revokeFlag := flag.Bool("revoke", false, "revoke admin instead of granting it")
	flag.Parse()

	if *emailFlag == "" && *uidFlag == "" {
		log.Fatal("provide either -email or -uid")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

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

	if err := fbAuth.SetAdminClaim(ctx, uid, !*revokeFlag); err != nil {
		log.Fatalf("set admin claim: %v", err)
	}
	log.Printf("✅ Admin claim updated (revoke=%v) for %s", *revokeFlag, uid)
}
