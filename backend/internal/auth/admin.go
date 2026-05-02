package auth

import (
	"context"
	"fmt"
	"os"
	"strings"
	"sync"

	"connectrpc.com/connect"
)

type adminKey struct{}

// AdminInfo holds admin status for the current request.
type AdminInfo struct {
	IsAdmin bool
}

// WithAdmin adds admin info to context.
func WithAdmin(ctx context.Context, info *AdminInfo) context.Context {
	return context.WithValue(ctx, adminKey{}, info)
}

// GetAdmin retrieves admin info from context.
func GetAdmin(ctx context.Context) *AdminInfo {
	info, _ := ctx.Value(adminKey{}).(*AdminInfo)
	return info
}

// IsAdminContext returns true when the request is admin-authorized.
func IsAdminContext(ctx context.Context) bool {
	info := GetAdmin(ctx)
	return info != nil && info.IsAdmin
}

// RequireAdmin returns a permission-denied error unless the request is admin-authorized.
func RequireAdmin(ctx context.Context) error {
	if !IsAdminContext(ctx) {
		return connect.NewError(connect.CodePermissionDenied,
			fmt.Errorf("admin privileges required"))
	}
	return nil
}

// adminEmailsCache caches the parsed ADMIN_EMAILS env var (lower-cased).
var (
	adminEmailsCache     map[string]struct{}
	adminEmailsOnce      sync.Once
	adminEmailsCacheLock sync.Mutex
)

func loadAdminEmails() map[string]struct{} {
	adminEmailsOnce.Do(func() {
		adminEmailsCache = parseAdminEmails(os.Getenv("ADMIN_EMAILS"))
	})
	adminEmailsCacheLock.Lock()
	defer adminEmailsCacheLock.Unlock()
	return adminEmailsCache
}

func parseAdminEmails(raw string) map[string]struct{} {
	out := make(map[string]struct{})
	for _, part := range strings.Split(raw, ",") {
		email := strings.ToLower(strings.TrimSpace(part))
		if email != "" {
			out[email] = struct{}{}
		}
	}
	return out
}

// IsAdminEmail reports whether an email is listed in the ADMIN_EMAILS env var.
// Match is case-insensitive on the trimmed value.
func IsAdminEmail(email string) bool {
	if email == "" {
		return false
	}
	emails := loadAdminEmails()
	_, ok := emails[strings.ToLower(strings.TrimSpace(email))]
	return ok
}

// ResolveAdminFromClaims decides whether a request is admin-authorized based on
// (a) the user's email matching ADMIN_EMAILS or (b) an `admin: true` custom claim.
func ResolveAdminFromClaims(userClaims *UserClaims, rawClaims map[string]interface{}) *AdminInfo {
	info := &AdminInfo{}
	if userClaims != nil && IsAdminEmail(userClaims.Email) {
		info.IsAdmin = true
		return info
	}
	if rawClaims != nil {
		if v, ok := rawClaims["admin"].(bool); ok && v {
			info.IsAdmin = true
		}
	}
	return info
}
