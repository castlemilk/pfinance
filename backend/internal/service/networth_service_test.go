package service

import (
	"context"
	"testing"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/auth"
	"github.com/castlemilk/pfinance/backend/internal/store"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func networthCtx(userID string) context.Context {
	return auth.WithUserClaims(context.Background(), &auth.UserClaims{
		UID:      userID,
		Email:    userID + "@test.com",
		Verified: true,
	})
}

func TestNetWorthUnauthenticated(t *testing.T) {
	service := NewFinanceService(store.NewMemoryStore(), nil, nil)
	ctx := context.Background()

	_, err := service.ListAssets(ctx, connect.NewRequest(&pfinancev1.ListAssetsRequest{UserId: "u1"}))
	assert.ErrorContains(t, err, "unauthenticated")

	_, err = service.GetNetWorthSummary(ctx, connect.NewRequest(&pfinancev1.GetNetWorthSummaryRequest{UserId: "u1"}))
	assert.ErrorContains(t, err, "unauthenticated")
}

func TestNetWorthCrossUserDenied(t *testing.T) {
	s := store.NewMemoryStore()
	service := NewFinanceService(s, nil, nil)
	ctx := networthCtx("user-1")

	_, err := service.CreateAsset(ctx, connect.NewRequest(&pfinancev1.CreateAssetRequest{
		UserId:     "user-2",
		Name:       "Savings",
		Category:   pfinancev1.AssetCategory_ASSET_CATEGORY_CASH,
		ValueCents: 100_000,
	}))
	assert.ErrorContains(t, err, "cannot access another user")
}

func TestNetWorthCrudAndSummary(t *testing.T) {
	s := store.NewMemoryStore()
	service := NewFinanceService(s, nil, nil)
	ctx := networthCtx("user-1")

	assetRes, err := service.CreateAsset(ctx, connect.NewRequest(&pfinancev1.CreateAssetRequest{
		UserId:     "user-1",
		Name:       "Emergency fund",
		Category:   pfinancev1.AssetCategory_ASSET_CATEGORY_CASH,
		ValueCents: 20_000_00,
		IsLiquid:   true,
	}))
	require.NoError(t, err)
	require.NotEmpty(t, assetRes.Msg.Asset.Id)

	_, err = service.CreateAsset(ctx, connect.NewRequest(&pfinancev1.CreateAssetRequest{
		UserId:     "user-1",
		Name:       "Home",
		Category:   pfinancev1.AssetCategory_ASSET_CATEGORY_PROPERTY,
		ValueCents: 850_000_00,
	}))
	require.NoError(t, err)

	liabRes, err := service.CreateLiability(ctx, connect.NewRequest(&pfinancev1.CreateLiabilityRequest{
		UserId:       "user-1",
		Name:         "Mortgage",
		Category:     pfinancev1.LiabilityCategory_LIABILITY_CATEGORY_MORTGAGE,
		BalanceCents: 640_000_00,
		InterestRate: 6.09,
	}))
	require.NoError(t, err)

	summaryRes, err := service.GetNetWorthSummary(ctx, connect.NewRequest(&pfinancev1.GetNetWorthSummaryRequest{
		UserId: "user-1",
	}))
	require.NoError(t, err)
	sum := summaryRes.Msg.Summary
	assert.Equal(t, int64(870_000_00), sum.TotalAssetsCents)
	assert.Equal(t, int64(640_000_00), sum.TotalLiabilitiesCents)
	assert.Equal(t, int64(230_000_00), sum.NetWorthCents)
	assert.Equal(t, int64(20_000_00), sum.LiquidAssetsCents)
	require.Len(t, sum.AssetsByCategory, 2)
	assert.Equal(t, "ASSET_CATEGORY_PROPERTY", sum.AssetsByCategory[0].Category)

	// Update the asset value
	asset := assetRes.Msg.Asset
	asset.ValueCents = 22_000_00
	_, err = service.UpdateAsset(ctx, connect.NewRequest(&pfinancev1.UpdateAssetRequest{Asset: asset}))
	require.NoError(t, err)

	summaryRes, err = service.GetNetWorthSummary(ctx, connect.NewRequest(&pfinancev1.GetNetWorthSummaryRequest{UserId: "user-1"}))
	require.NoError(t, err)
	assert.Equal(t, int64(232_000_00), summaryRes.Msg.Summary.NetWorthCents)

	// Delete liability removes it from the summary
	_, err = service.DeleteLiability(ctx, connect.NewRequest(&pfinancev1.DeleteLiabilityRequest{LiabilityId: liabRes.Msg.Liability.Id}))
	require.NoError(t, err)
	summaryRes, err = service.GetNetWorthSummary(ctx, connect.NewRequest(&pfinancev1.GetNetWorthSummaryRequest{UserId: "user-1"}))
	require.NoError(t, err)
	assert.Equal(t, int64(0), summaryRes.Msg.Summary.TotalLiabilitiesCents)
}

func TestNetWorthListScoping(t *testing.T) {
	s := store.NewMemoryStore()
	service := NewFinanceService(s, nil, nil)
	ctx1 := networthCtx("user-1")

	for i := 0; i < 3; i++ {
		_, err := service.CreateAsset(ctx1, connect.NewRequest(&pfinancev1.CreateAssetRequest{
			UserId:     "user-1",
			Name:       "A",
			Category:   pfinancev1.AssetCategory_ASSET_CATEGORY_OTHER,
			ValueCents: 100_00,
		}))
		require.NoError(t, err)
	}

	list, err := service.ListAssets(ctx1, connect.NewRequest(&pfinancev1.ListAssetsRequest{UserId: "user-1"}))
	require.NoError(t, err)
	assert.Len(t, list.Msg.Assets, 3)

	// user-2 sees only their own entries
	ctx2 := networthCtx("user-2")
	list2, err := service.ListAssets(ctx2, connect.NewRequest(&pfinancev1.ListAssetsRequest{UserId: "user-2"}))
	require.NoError(t, err)
	assert.Len(t, list2.Msg.Assets, 0)
}
