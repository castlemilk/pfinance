package auth

import (
	"context"
	"fmt"
	"log"

	"firebase.google.com/go/v4/auth"
	"google.golang.org/api/iterator"
)

// FirebaseUserRecord is a flat view of a Firebase user used by the admin UI.
type FirebaseUserRecord struct {
	UID            string
	Email          string
	DisplayName    string
	PhotoURL       string
	Disabled       bool
	CreatedAtMS    int64 // milliseconds since epoch (UserMetadata.CreationTimestamp)
	LastSignInAtMS int64
	CustomClaims   map[string]interface{}
}

// ListAllUsersPage returns one page of Firebase users plus the next page token.
// pageToken should be empty on the first call. pageSize is clamped to [1, 1000].
func (f *FirebaseAuth) ListAllUsersPage(ctx context.Context, pageSize int, pageToken string) ([]*FirebaseUserRecord, string, error) {
	if f == nil || f.client == nil {
		return nil, "", fmt.Errorf("firebase auth not initialized")
	}
	if pageSize <= 0 || pageSize > 1000 {
		pageSize = 200
	}

	iter := f.client.Users(ctx, pageToken)
	out := make([]*FirebaseUserRecord, 0, pageSize)
	nextToken := ""
	for i := 0; i < pageSize; i++ {
		exported, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return nil, "", fmt.Errorf("iterate firebase users: %w", err)
		}
		out = append(out, recordFromExported(exported))
	}
	// Firebase Auth iterators expose the next-page token via PageInfo.
	if pi := iter.PageInfo(); pi != nil {
		nextToken = pi.Token
	}
	return out, nextToken, nil
}

// GetFirebaseUser returns a single Firebase user record by UID.
func (f *FirebaseAuth) GetFirebaseUser(ctx context.Context, uid string) (*FirebaseUserRecord, error) {
	if f == nil || f.client == nil {
		return nil, fmt.Errorf("firebase auth not initialized")
	}
	u, err := f.client.GetUser(ctx, uid)
	if err != nil {
		return nil, err
	}
	return recordFromUserRecord(u), nil
}

// SetAdminClaim grants or revokes the `admin: true` Firebase custom claim
// while preserving any existing custom claims (e.g. subscription claims).
func (f *FirebaseAuth) SetAdminClaim(ctx context.Context, uid string, isAdmin bool) error {
	if f == nil || f.client == nil {
		return fmt.Errorf("firebase auth not initialized")
	}
	user, err := f.client.GetUser(ctx, uid)
	if err != nil {
		return fmt.Errorf("get user %s: %w", uid, err)
	}
	claims := map[string]interface{}{}
	for k, v := range user.CustomClaims {
		claims[k] = v
	}
	if isAdmin {
		claims["admin"] = true
	} else {
		delete(claims, "admin")
	}
	if err := f.client.SetCustomUserClaims(ctx, uid, claims); err != nil {
		return fmt.Errorf("set admin claim for %s: %w", uid, err)
	}
	log.Printf("[Auth] Set admin=%v for user %s", isAdmin, uid)
	return nil
}

func recordFromExported(u *auth.ExportedUserRecord) *FirebaseUserRecord {
	if u == nil || u.UserRecord == nil {
		return &FirebaseUserRecord{}
	}
	return recordFromUserRecord(u.UserRecord)
}

func recordFromUserRecord(u *auth.UserRecord) *FirebaseUserRecord {
	r := &FirebaseUserRecord{
		UID:          u.UID,
		Email:        u.Email,
		DisplayName:  u.DisplayName,
		PhotoURL:     u.PhotoURL,
		Disabled:     u.Disabled,
		CustomClaims: map[string]interface{}{},
	}
	for k, v := range u.CustomClaims {
		r.CustomClaims[k] = v
	}
	if u.UserMetadata != nil {
		r.CreatedAtMS = u.UserMetadata.CreationTimestamp
		r.LastSignInAtMS = u.UserMetadata.LastLogInTimestamp
	}
	return r
}
