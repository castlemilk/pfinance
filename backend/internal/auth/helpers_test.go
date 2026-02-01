package auth

import (
	"context"
	"testing"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func TestRequireAuth(t *testing.T) {
	t.Run("returns error when no claims in context", func(t *testing.T) {
		ctx := context.Background()
		claims, err := RequireAuth(ctx)
		assert.Nil(t, claims)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "unauthenticated")
	})

	t.Run("returns claims when present in context", func(t *testing.T) {
		ctx := context.Background()
		expectedClaims := &UserClaims{UID: "user-123", Email: "test@example.com"}
		ctx = withUserClaims(ctx, expectedClaims)

		claims, err := RequireAuth(ctx)
		require.NoError(t, err)
		assert.Equal(t, expectedClaims.UID, claims.UID)
		assert.Equal(t, expectedClaims.Email, claims.Email)
	})
}

func TestRequireUserAccess(t *testing.T) {
	t.Run("returns error when no claims in context", func(t *testing.T) {
		ctx := context.Background()
		claims, err := RequireUserAccess(ctx, "user-123")
		assert.Nil(t, claims)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "unauthenticated")
	})

	t.Run("returns error when user ID does not match", func(t *testing.T) {
		ctx := context.Background()
		ctx = withUserClaims(ctx, &UserClaims{UID: "user-123"})

		claims, err := RequireUserAccess(ctx, "user-456")
		assert.Nil(t, claims)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "cannot access another user's resources")
	})

	t.Run("returns claims when user ID matches", func(t *testing.T) {
		ctx := context.Background()
		ctx = withUserClaims(ctx, &UserClaims{UID: "user-123"})

		claims, err := RequireUserAccess(ctx, "user-123")
		require.NoError(t, err)
		assert.Equal(t, "user-123", claims.UID)
	})

	t.Run("returns claims when user ID is empty", func(t *testing.T) {
		ctx := context.Background()
		ctx = withUserClaims(ctx, &UserClaims{UID: "user-123"})

		claims, err := RequireUserAccess(ctx, "")
		require.NoError(t, err)
		assert.Equal(t, "user-123", claims.UID)
	})
}

func TestIsGroupMember(t *testing.T) {
	group := &pfinancev1.FinanceGroup{
		Id:        "group-1",
		OwnerId:   "owner-user",
		MemberIds: []string{"member-1", "member-2"},
		Members: []*pfinancev1.GroupMember{
			{UserId: "member-1", Role: pfinancev1.GroupRole_GROUP_ROLE_ADMIN},
			{UserId: "member-2", Role: pfinancev1.GroupRole_GROUP_ROLE_MEMBER},
		},
	}

	tests := []struct {
		name     string
		userID   string
		group    *pfinancev1.FinanceGroup
		expected bool
	}{
		{"owner is member", "owner-user", group, true},
		{"member in list is member", "member-1", group, true},
		{"member in MemberIds is member", "member-2", group, true},
		{"non-member is not member", "stranger", group, false},
		{"nil group returns false", "anyone", nil, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := IsGroupMember(tt.userID, tt.group)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestGetUserRoleInGroup(t *testing.T) {
	group := &pfinancev1.FinanceGroup{
		Id:        "group-1",
		OwnerId:   "owner-user",
		MemberIds: []string{"member-1", "member-2", "member-3"},
		Members: []*pfinancev1.GroupMember{
			{UserId: "member-1", Role: pfinancev1.GroupRole_GROUP_ROLE_ADMIN},
			{UserId: "member-2", Role: pfinancev1.GroupRole_GROUP_ROLE_VIEWER},
		},
	}

	tests := []struct {
		name     string
		userID   string
		group    *pfinancev1.FinanceGroup
		expected pfinancev1.GroupRole
	}{
		{"owner has owner role", "owner-user", group, pfinancev1.GroupRole_GROUP_ROLE_OWNER},
		{"admin has admin role", "member-1", group, pfinancev1.GroupRole_GROUP_ROLE_ADMIN},
		{"viewer has viewer role", "member-2", group, pfinancev1.GroupRole_GROUP_ROLE_VIEWER},
		{"member in MemberIds only has member role", "member-3", group, pfinancev1.GroupRole_GROUP_ROLE_MEMBER},
		{"non-member has unspecified role", "stranger", group, pfinancev1.GroupRole_GROUP_ROLE_UNSPECIFIED},
		{"nil group returns unspecified", "anyone", nil, pfinancev1.GroupRole_GROUP_ROLE_UNSPECIFIED},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := GetUserRoleInGroup(tt.userID, tt.group)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestIsGroupAdminOrOwner(t *testing.T) {
	group := &pfinancev1.FinanceGroup{
		Id:        "group-1",
		OwnerId:   "owner-user",
		MemberIds: []string{"admin-user", "member-user"},
		Members: []*pfinancev1.GroupMember{
			{UserId: "admin-user", Role: pfinancev1.GroupRole_GROUP_ROLE_ADMIN},
			{UserId: "member-user", Role: pfinancev1.GroupRole_GROUP_ROLE_MEMBER},
		},
	}

	tests := []struct {
		name     string
		userID   string
		group    *pfinancev1.FinanceGroup
		expected bool
	}{
		{"owner is admin or owner", "owner-user", group, true},
		{"admin is admin or owner", "admin-user", group, true},
		{"member is not admin or owner", "member-user", group, false},
		{"non-member is not admin or owner", "stranger", group, false},
		{"nil group returns false", "anyone", nil, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := IsGroupAdminOrOwner(tt.userID, tt.group)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestCanModifyGroupMember(t *testing.T) {
	group := &pfinancev1.FinanceGroup{
		Id:        "group-1",
		OwnerId:   "owner-user",
		MemberIds: []string{"admin-user", "member-user"},
		Members: []*pfinancev1.GroupMember{
			{UserId: "admin-user", Role: pfinancev1.GroupRole_GROUP_ROLE_ADMIN},
			{UserId: "member-user", Role: pfinancev1.GroupRole_GROUP_ROLE_MEMBER},
		},
	}

	tests := []struct {
		name     string
		callerID string
		targetID string
		group    *pfinancev1.FinanceGroup
		expected bool
	}{
		{"owner can modify member", "owner-user", "member-user", group, true},
		{"owner can modify admin", "owner-user", "admin-user", group, true},
		{"owner cannot modify owner", "owner-user", "owner-user", group, false},
		{"admin can modify member", "admin-user", "member-user", group, true},
		{"admin cannot modify owner", "admin-user", "owner-user", group, false},
		{"member cannot modify anyone", "member-user", "admin-user", group, false},
		{"nil group returns false", "anyone", "anyone", nil, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := CanModifyGroupMember(tt.callerID, tt.targetID, tt.group)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestNormalizePageSize(t *testing.T) {
	tests := []struct {
		name     string
		input    int32
		expected int32
	}{
		{"zero returns default", 0, 100},
		{"negative returns default", -1, 100},
		{"valid size unchanged", 50, 50},
		{"over max returns max", 2000, 1000},
		{"exactly max unchanged", 1000, 1000},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := NormalizePageSize(tt.input)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestConvertDateRange(t *testing.T) {
	now := timestamppb.Now()

	t.Run("both nil", func(t *testing.T) {
		start, end := ConvertDateRange(nil, nil)
		assert.Nil(t, start)
		assert.Nil(t, end)
	})

	t.Run("only start", func(t *testing.T) {
		start, end := ConvertDateRange(now, nil)
		assert.NotNil(t, start)
		assert.Nil(t, end)
		assert.Equal(t, now.AsTime(), *start)
	})

	t.Run("only end", func(t *testing.T) {
		start, end := ConvertDateRange(nil, now)
		assert.Nil(t, start)
		assert.NotNil(t, end)
		assert.Equal(t, now.AsTime(), *end)
	})

	t.Run("both set", func(t *testing.T) {
		start, end := ConvertDateRange(now, now)
		assert.NotNil(t, start)
		assert.NotNil(t, end)
	})
}

func TestWrapStoreError(t *testing.T) {
	t.Run("nil error returns nil", func(t *testing.T) {
		err := WrapStoreError("create expense", nil)
		assert.Nil(t, err)
	})

	t.Run("wraps error with operation", func(t *testing.T) {
		err := WrapStoreError("create expense", assert.AnError)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to create expense")
	})
}
