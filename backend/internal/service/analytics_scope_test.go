package service

import (
	"context"
	"errors"
	"strings"
	"testing"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/auth"
	"github.com/castlemilk/pfinance/backend/internal/store"
	"go.uber.org/mock/gomock"
)

func TestResolveAnalyticsScope(t *testing.T) {
	const (
		ownerID = "owner"
		groupID = "group-1"
	)

	tests := []struct {
		name            string
		requestedUserID string
		groupID         string
		setup           func(*store.MockStore)
		want            analyticsScope
		wantCode        connect.Code
		wantError       string
	}{
		{
			name: "personal empty requested user resolves authenticated user",
			want: analyticsScope{userID: ownerID},
		},
		{
			name:            "personal forged requested user resolves authenticated user",
			requestedUserID: "victim",
			want:            analyticsScope{userID: ownerID},
		},
		{
			name:    "verified group membership resolves group-wide scope",
			groupID: groupID,
			setup: func(mockStore *store.MockStore) {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), groupID).
					Return(&pfinancev1.FinanceGroup{
						Id:        groupID,
						OwnerId:   "someone-else",
						MemberIds: []string{ownerID},
					}, nil)
			},
			want: analyticsScope{groupID: groupID},
		},
		{
			name:    "missing group maps store error",
			groupID: groupID,
			setup: func(mockStore *store.MockStore) {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), groupID).
					Return(nil, errors.New("group not found"))
			},
			wantCode:  connect.CodeUnknown,
			wantError: "failed to get group: group not found",
		},
		{
			name:    "non-member is denied",
			groupID: groupID,
			setup: func(mockStore *store.MockStore) {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), groupID).
					Return(&pfinancev1.FinanceGroup{
						Id:      groupID,
						OwnerId: "someone-else",
					}, nil)
			},
			wantCode:  connect.CodePermissionDenied,
			wantError: "user is not a member of this group",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctrl := gomock.NewController(t)
			mockStore := store.NewMockStore(ctrl)
			if tt.setup != nil {
				tt.setup(mockStore)
			}

			service := NewFinanceService(mockStore, nil, nil)
			claims := &auth.UserClaims{UID: ownerID}
			got, err := service.resolveAnalyticsScope(
				context.Background(), claims, tt.requestedUserID, tt.groupID,
			)

			if tt.wantError != "" {
				if err == nil {
					t.Fatalf("resolveAnalyticsScope() error = nil, want %q", tt.wantError)
				}
				if !strings.Contains(err.Error(), tt.wantError) {
					t.Fatalf("resolveAnalyticsScope() error = %q, want substring %q", err, tt.wantError)
				}
				if gotCode := connect.CodeOf(err); gotCode != tt.wantCode {
					t.Fatalf("resolveAnalyticsScope() code = %v, want %v", gotCode, tt.wantCode)
				}
				return
			}

			if err != nil {
				t.Fatalf("resolveAnalyticsScope() unexpected error: %v", err)
			}
			if got != tt.want {
				t.Fatalf("resolveAnalyticsScope() = %+v, want %+v", got, tt.want)
			}
		})
	}
}
