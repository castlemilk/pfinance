package service

import (
	"context"
	"fmt"

	"connectrpc.com/connect"
	"github.com/castlemilk/pfinance/backend/internal/auth"
)

type analyticsScope struct {
	userID  string
	groupID string
}

// resolveAnalyticsScope derives personal analytics ownership exclusively from
// authenticated claims and group analytics from verified group membership.
// requestedUserID remains in the signature for wire compatibility and is
// intentionally ignored.
func (s *FinanceService) resolveAnalyticsScope(
	ctx context.Context,
	claims *auth.UserClaims,
	requestedUserID string,
	groupID string,
) (analyticsScope, error) {
	if groupID == "" {
		return analyticsScope{userID: claims.UID}, nil
	}

	group, err := s.store.GetGroup(ctx, groupID)
	if err != nil {
		return analyticsScope{}, auth.WrapStoreError("get group", err)
	}
	if !auth.IsGroupMember(claims.UID, group) {
		return analyticsScope{}, connect.NewError(
			connect.CodePermissionDenied,
			fmt.Errorf("user is not a member of this group"),
		)
	}

	return analyticsScope{groupID: groupID}, nil
}
