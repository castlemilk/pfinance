package service

import (
	"context"
	"fmt"
	"testing"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/auth"
	"github.com/castlemilk/pfinance/backend/internal/store"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/mock/gomock"
)

func proContext(userID string) context.Context {
	ctx := testContextWithUser(userID)
	ctx = auth.WithSubscription(ctx, &auth.SubscriptionInfo{
		Tier:   pfinancev1.SubscriptionTier_SUBSCRIPTION_TIER_PRO,
		Status: pfinancev1.SubscriptionStatus_SUBSCRIPTION_STATUS_ACTIVE,
	})
	return ctx
}

func TestCreateApiToken(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)
	userID := "user123"
	ctx := proContext(userID)

	// GetUser fallback (pro check)
	mockStore.EXPECT().GetUser(gomock.Any(), gomock.Any()).Return(nil, fmt.Errorf("not found")).AnyTimes()

	mockStore.EXPECT().CountActiveApiTokens(ctx, userID).Return(0, nil)
	mockStore.EXPECT().CreateApiToken(ctx, gomock.Any()).DoAndReturn(func(_ context.Context, token *pfinancev1.ApiToken) error {
		assert.Equal(t, userID, token.UserId)
		assert.Equal(t, "My CLI Token", token.Name)
		assert.NotEmpty(t, token.Id)
		assert.NotEmpty(t, token.TokenHash)
		assert.NotEmpty(t, token.TokenPrefix)
		assert.False(t, token.IsRevoked)
		return nil
	})

	resp, err := svc.CreateApiToken(ctx, connect.NewRequest(&pfinancev1.CreateApiTokenRequest{
		Name: "My CLI Token",
	}))
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.NotEmpty(t, resp.Msg.Token)
	assert.True(t, len(resp.Msg.Token) > 10, "raw token should be long")
	assert.Equal(t, "My CLI Token", resp.Msg.ApiToken.Name)
	assert.Empty(t, resp.Msg.ApiToken.TokenHash, "hash should be stripped from response")
}

func TestCreateApiToken_MaxTokens(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)
	userID := "user123"
	ctx := proContext(userID)

	mockStore.EXPECT().GetUser(gomock.Any(), gomock.Any()).Return(nil, fmt.Errorf("not found")).AnyTimes()
	mockStore.EXPECT().CountActiveApiTokens(ctx, userID).Return(5, nil)

	_, err := svc.CreateApiToken(ctx, connect.NewRequest(&pfinancev1.CreateApiTokenRequest{
		Name: "One Too Many",
	}))
	require.Error(t, err)
	assert.Equal(t, connect.CodeResourceExhausted, connect.CodeOf(err))
}

func TestCreateApiToken_NotPro(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)
	userID := "user123"
	ctx := testContextWithUser(userID) // no pro subscription

	mockStore.EXPECT().GetUser(gomock.Any(), gomock.Any()).Return(nil, fmt.Errorf("not found")).AnyTimes()

	_, err := svc.CreateApiToken(ctx, connect.NewRequest(&pfinancev1.CreateApiTokenRequest{
		Name: "Should Fail",
	}))
	require.Error(t, err)
	assert.Equal(t, connect.CodePermissionDenied, connect.CodeOf(err))
}

func TestListApiTokens(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)
	userID := "user123"
	ctx := proContext(userID)

	mockStore.EXPECT().GetUser(gomock.Any(), gomock.Any()).Return(nil, fmt.Errorf("not found")).AnyTimes()
	mockStore.EXPECT().ListApiTokens(ctx, userID).Return([]*pfinancev1.ApiToken{
		{
			Id:          "tok1",
			UserId:      userID,
			Name:        "Token A",
			TokenPrefix: "pf_abcd",
			TokenHash:   "should_be_stripped",
		},
	}, nil)

	resp, err := svc.ListApiTokens(ctx, connect.NewRequest(&pfinancev1.ListApiTokensRequest{}))
	require.NoError(t, err)
	require.Len(t, resp.Msg.Tokens, 1)
	assert.Equal(t, "Token A", resp.Msg.Tokens[0].Name)
	assert.Empty(t, resp.Msg.Tokens[0].TokenHash, "hash should be stripped")
}

func TestRevokeApiToken(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)
	userID := "user123"
	ctx := proContext(userID)

	mockStore.EXPECT().GetUser(gomock.Any(), gomock.Any()).Return(nil, fmt.Errorf("not found")).AnyTimes()
	mockStore.EXPECT().ListApiTokens(ctx, userID).Return([]*pfinancev1.ApiToken{
		{Id: "tok1", UserId: userID, Name: "Token A"},
	}, nil)
	mockStore.EXPECT().RevokeApiToken(ctx, "tok1").Return(nil)

	resp, err := svc.RevokeApiToken(ctx, connect.NewRequest(&pfinancev1.RevokeApiTokenRequest{
		TokenId: "tok1",
	}))
	require.NoError(t, err)
	require.NotNil(t, resp)
}

func TestRevokeApiToken_WrongUser(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)
	userID := "user123"
	ctx := proContext(userID)

	mockStore.EXPECT().GetUser(gomock.Any(), gomock.Any()).Return(nil, fmt.Errorf("not found")).AnyTimes()
	// User's tokens don't include the requested one
	mockStore.EXPECT().ListApiTokens(ctx, userID).Return([]*pfinancev1.ApiToken{
		{Id: "tok_other", UserId: userID, Name: "Different Token"},
	}, nil)

	_, err := svc.RevokeApiToken(ctx, connect.NewRequest(&pfinancev1.RevokeApiTokenRequest{
		TokenId: "tok_not_mine",
	}))
	require.Error(t, err)
	assert.Equal(t, connect.CodeNotFound, connect.CodeOf(err))
}
