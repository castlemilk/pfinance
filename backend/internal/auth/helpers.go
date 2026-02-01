package auth

import (
	"context"
	"fmt"
	"time"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// RequireAuth extracts user claims from context or returns an unauthenticated error
func RequireAuth(ctx context.Context) (*UserClaims, error) {
	claims, ok := GetUserClaims(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, fmt.Errorf("user not authenticated"))
	}
	return claims, nil
}

// RequireUserAccess verifies the authenticated user matches the requested user ID
func RequireUserAccess(ctx context.Context, requestedUserID string) (*UserClaims, error) {
	claims, err := RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	if requestedUserID != "" && requestedUserID != claims.UID {
		return nil, connect.NewError(connect.CodePermissionDenied,
			fmt.Errorf("cannot access another user's resources"))
	}

	return claims, nil
}

// IsGroupMember checks if a user is a member of a group
func IsGroupMember(userID string, group *pfinancev1.FinanceGroup) bool {
	if group == nil {
		return false
	}

	// Check owner
	if group.OwnerId == userID {
		return true
	}

	// Check member IDs list
	for _, memberID := range group.MemberIds {
		if memberID == userID {
			return true
		}
	}

	// Check members list
	for _, member := range group.Members {
		if member.UserId == userID {
			return true
		}
	}

	return false
}

// GetUserRoleInGroup returns the role of a user in a group
func GetUserRoleInGroup(userID string, group *pfinancev1.FinanceGroup) pfinancev1.GroupRole {
	if group == nil {
		return pfinancev1.GroupRole_GROUP_ROLE_UNSPECIFIED
	}

	// Owner has highest role
	if group.OwnerId == userID {
		return pfinancev1.GroupRole_GROUP_ROLE_OWNER
	}

	// Check members list for explicit role
	for _, member := range group.Members {
		if member.UserId == userID {
			return member.Role
		}
	}

	// If in MemberIds but not in Members, assume MEMBER role
	for _, memberID := range group.MemberIds {
		if memberID == userID {
			return pfinancev1.GroupRole_GROUP_ROLE_MEMBER
		}
	}

	return pfinancev1.GroupRole_GROUP_ROLE_UNSPECIFIED
}

// IsGroupAdminOrOwner checks if a user has admin privileges in a group
func IsGroupAdminOrOwner(userID string, group *pfinancev1.FinanceGroup) bool {
	if group == nil {
		return false
	}

	// Owner always has admin privileges
	if group.OwnerId == userID {
		return true
	}

	// Check for admin role
	for _, member := range group.Members {
		if member.UserId == userID && member.Role == pfinancev1.GroupRole_GROUP_ROLE_ADMIN {
			return true
		}
	}

	return false
}

// CanInviteToGroup checks if a user can invite others to a group
func CanInviteToGroup(userID string, group *pfinancev1.FinanceGroup) bool {
	// Only admins and owners can invite
	return IsGroupAdminOrOwner(userID, group)
}

// CanModifyGroupMember checks if a user can modify another member's role or remove them
func CanModifyGroupMember(callerID, targetID string, group *pfinancev1.FinanceGroup) bool {
	if group == nil {
		return false
	}

	// Cannot modify the owner
	if targetID == group.OwnerId {
		return false
	}

	// Must be admin or owner to modify members
	return IsGroupAdminOrOwner(callerID, group)
}

// NormalizePageSize returns a valid page size (default 100, max 1000)
func NormalizePageSize(pageSize int32) int32 {
	if pageSize <= 0 {
		return 100
	}
	if pageSize > 1000 {
		return 1000
	}
	return pageSize
}

// ConvertDateRange converts proto timestamps to time.Time pointers
func ConvertDateRange(startDate, endDate *timestamppb.Timestamp) (*time.Time, *time.Time) {
	var start, end *time.Time
	if startDate != nil {
		t := startDate.AsTime()
		start = &t
	}
	if endDate != nil {
		t := endDate.AsTime()
		end = &t
	}
	return start, end
}

// WrapStoreError wraps store errors with operation context
func WrapStoreError(operation string, err error) error {
	if err == nil {
		return nil
	}
	return fmt.Errorf("failed to %s: %w", operation, err)
}
