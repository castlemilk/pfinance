package service

import (
	"context"
	"fmt"
	"sort"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"google.golang.org/protobuf/types/known/emptypb"
	"google.golang.org/protobuf/types/known/timestamppb"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/auth"
)

// authorizeNetWorthScope validates the requested owner scope: personal entries
// must target the caller's own user ID; group entries require membership.
func (s *FinanceService) authorizeNetWorthScope(ctx context.Context, userID, groupID string) (string, error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return "", err
	}

	if groupID == "" {
		if userID != claims.UID {
			return "", connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("cannot access another user's net worth entries"))
		}
		return userID, nil
	}

	group, err := s.store.GetGroup(ctx, groupID)
	if err != nil {
		return "", auth.WrapStoreError("get group", err)
	}
	if !auth.IsGroupMember(claims.UID, group) {
		return "", connect.NewError(connect.CodePermissionDenied,
			fmt.Errorf("user is not a member of this group"))
	}
	return userID, nil
}

// authorizeEntryMutation loads an existing entry and checks the caller owns it
// (personal) or belongs to its group.
func (s *FinanceService) authorizeAssetMutation(ctx context.Context, assetID string) (*pfinancev1.Asset, error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}
	asset, err := s.store.GetAsset(ctx, assetID)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound,
			fmt.Errorf("asset %s not found", assetID))
	}
	if asset.GroupId == "" {
		if asset.UserId != claims.UID {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("cannot modify another user's asset"))
		}
		return asset, nil
	}
	group, err := s.store.GetGroup(ctx, asset.GroupId)
	if err != nil {
		return nil, auth.WrapStoreError("get group", err)
	}
	if !auth.IsGroupMember(claims.UID, group) {
		return nil, connect.NewError(connect.CodePermissionDenied,
			fmt.Errorf("user is not a member of this group"))
	}
	return asset, nil
}

func (s *FinanceService) authorizeLiabilityMutation(ctx context.Context, liabilityID string) (*pfinancev1.Liability, error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}
	liability, err := s.store.GetLiability(ctx, liabilityID)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound,
			fmt.Errorf("liability %s not found", liabilityID))
	}
	if liability.GroupId == "" {
		if liability.UserId != claims.UID {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("cannot modify another user's liability"))
		}
		return liability, nil
	}
	group, err := s.store.GetGroup(ctx, liability.GroupId)
	if err != nil {
		return nil, auth.WrapStoreError("get group", err)
	}
	if !auth.IsGroupMember(claims.UID, group) {
		return nil, connect.NewError(connect.CodePermissionDenied,
			fmt.Errorf("user is not a member of this group"))
	}
	return liability, nil
}

func (s *FinanceService) CreateAsset(ctx context.Context, req *connect.Request[pfinancev1.CreateAssetRequest]) (*connect.Response[pfinancev1.CreateAssetResponse], error) {
	if _, err := s.authorizeNetWorthScope(ctx, req.Msg.UserId, req.Msg.GroupId); err != nil {
		return nil, err
	}
	if req.Msg.Name == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("name is required"))
	}
	if req.Msg.ValueCents < 0 {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("value cannot be negative"))
	}

	now := timestamppb.Now()
	asset := &pfinancev1.Asset{
		Id:         uuid.New().String(),
		UserId:     req.Msg.UserId,
		GroupId:    req.Msg.GroupId,
		Name:       req.Msg.Name,
		Category:   req.Msg.Category,
		ValueCents: req.Msg.ValueCents,
		IsLiquid:   req.Msg.IsLiquid,
		Notes:      req.Msg.Notes,
		ValuedAt:   now,
		CreatedAt:  now,
		UpdatedAt:  now,
	}
	if err := s.store.CreateAsset(ctx, asset); err != nil {
		return nil, auth.WrapStoreError("create asset", err)
	}
	return connect.NewResponse(&pfinancev1.CreateAssetResponse{Asset: asset}), nil
}

func (s *FinanceService) GetAsset(ctx context.Context, req *connect.Request[pfinancev1.GetAssetRequest]) (*connect.Response[pfinancev1.GetAssetResponse], error) {
	asset, err := s.authorizeAssetMutation(ctx, req.Msg.AssetId)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&pfinancev1.GetAssetResponse{Asset: asset}), nil
}

func (s *FinanceService) UpdateAsset(ctx context.Context, req *connect.Request[pfinancev1.UpdateAssetRequest]) (*connect.Response[pfinancev1.UpdateAssetResponse], error) {
	existing, err := s.authorizeAssetMutation(ctx, req.Msg.Asset.Id)
	if err != nil {
		return nil, err
	}

	// Immutable scope fields stay pinned to the stored entry.
	updated := req.Msg.Asset
	updated.UserId = existing.UserId
	updated.GroupId = existing.GroupId
	updated.CreatedAt = existing.CreatedAt
	updated.UpdatedAt = timestamppb.Now()
	if updated.ValuedAt == nil {
		updated.ValuedAt = updated.UpdatedAt
	}

	if err := s.store.UpdateAsset(ctx, updated); err != nil {
		return nil, auth.WrapStoreError("update asset", err)
	}
	return connect.NewResponse(&pfinancev1.UpdateAssetResponse{Asset: updated}), nil
}

func (s *FinanceService) DeleteAsset(ctx context.Context, req *connect.Request[pfinancev1.DeleteAssetRequest]) (*connect.Response[emptypb.Empty], error) {
	if _, err := s.authorizeAssetMutation(ctx, req.Msg.AssetId); err != nil {
		return nil, err
	}
	if err := s.store.DeleteAsset(ctx, req.Msg.AssetId); err != nil {
		return nil, auth.WrapStoreError("delete asset", err)
	}
	return connect.NewResponse(&emptypb.Empty{}), nil
}

func (s *FinanceService) ListAssets(ctx context.Context, req *connect.Request[pfinancev1.ListAssetsRequest]) (*connect.Response[pfinancev1.ListAssetsResponse], error) {
	if _, err := s.authorizeNetWorthScope(ctx, req.Msg.UserId, req.Msg.GroupId); err != nil {
		return nil, err
	}
	assets, next, err := s.store.ListAssets(ctx, req.Msg.UserId, req.Msg.GroupId, req.Msg.PageSize, req.Msg.PageToken)
	if err != nil {
		return nil, auth.WrapStoreError("list assets", err)
	}
	return connect.NewResponse(&pfinancev1.ListAssetsResponse{Assets: assets, NextPageToken: next}), nil
}

func (s *FinanceService) CreateLiability(ctx context.Context, req *connect.Request[pfinancev1.CreateLiabilityRequest]) (*connect.Response[pfinancev1.CreateLiabilityResponse], error) {
	if _, err := s.authorizeNetWorthScope(ctx, req.Msg.UserId, req.Msg.GroupId); err != nil {
		return nil, err
	}
	if req.Msg.Name == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("name is required"))
	}
	if req.Msg.BalanceCents < 0 {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("balance cannot be negative"))
	}

	now := timestamppb.Now()
	liability := &pfinancev1.Liability{
		Id:                     uuid.New().String(),
		UserId:                 req.Msg.UserId,
		GroupId:                req.Msg.GroupId,
		Name:                   req.Msg.Name,
		Category:               req.Msg.Category,
		BalanceCents:           req.Msg.BalanceCents,
		InterestRate:           req.Msg.InterestRate,
		MinimumRepaymentCents:  req.Msg.MinimumRepaymentCents,
		Notes:                  req.Msg.Notes,
		CreatedAt:              now,
		UpdatedAt:              now,
	}
	if err := s.store.CreateLiability(ctx, liability); err != nil {
		return nil, auth.WrapStoreError("create liability", err)
	}
	return connect.NewResponse(&pfinancev1.CreateLiabilityResponse{Liability: liability}), nil
}

func (s *FinanceService) GetLiability(ctx context.Context, req *connect.Request[pfinancev1.GetLiabilityRequest]) (*connect.Response[pfinancev1.GetLiabilityResponse], error) {
	liability, err := s.authorizeLiabilityMutation(ctx, req.Msg.LiabilityId)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&pfinancev1.GetLiabilityResponse{Liability: liability}), nil
}

func (s *FinanceService) UpdateLiability(ctx context.Context, req *connect.Request[pfinancev1.UpdateLiabilityRequest]) (*connect.Response[pfinancev1.UpdateLiabilityResponse], error) {
	existing, err := s.authorizeLiabilityMutation(ctx, req.Msg.Liability.Id)
	if err != nil {
		return nil, err
	}

	updated := req.Msg.Liability
	updated.UserId = existing.UserId
	updated.GroupId = existing.GroupId
	updated.CreatedAt = existing.CreatedAt
	updated.UpdatedAt = timestamppb.Now()

	if err := s.store.UpdateLiability(ctx, updated); err != nil {
		return nil, auth.WrapStoreError("update liability", err)
	}
	return connect.NewResponse(&pfinancev1.UpdateLiabilityResponse{Liability: updated}), nil
}

func (s *FinanceService) DeleteLiability(ctx context.Context, req *connect.Request[pfinancev1.DeleteLiabilityRequest]) (*connect.Response[emptypb.Empty], error) {
	if _, err := s.authorizeLiabilityMutation(ctx, req.Msg.LiabilityId); err != nil {
		return nil, err
	}
	if err := s.store.DeleteLiability(ctx, req.Msg.LiabilityId); err != nil {
		return nil, auth.WrapStoreError("delete liability", err)
	}
	return connect.NewResponse(&emptypb.Empty{}), nil
}

func (s *FinanceService) ListLiabilities(ctx context.Context, req *connect.Request[pfinancev1.ListLiabilitiesRequest]) (*connect.Response[pfinancev1.ListLiabilitiesResponse], error) {
	if _, err := s.authorizeNetWorthScope(ctx, req.Msg.UserId, req.Msg.GroupId); err != nil {
		return nil, err
	}
	liabilities, next, err := s.store.ListLiabilities(ctx, req.Msg.UserId, req.Msg.GroupId, req.Msg.PageSize, req.Msg.PageToken)
	if err != nil {
		return nil, auth.WrapStoreError("list liabilities", err)
	}
	return connect.NewResponse(&pfinancev1.ListLiabilitiesResponse{Liabilities: liabilities, NextPageToken: next}), nil
}

func (s *FinanceService) GetNetWorthSummary(ctx context.Context, req *connect.Request[pfinancev1.GetNetWorthSummaryRequest]) (*connect.Response[pfinancev1.GetNetWorthSummaryResponse], error) {
	if _, err := s.authorizeNetWorthScope(ctx, req.Msg.UserId, req.Msg.GroupId); err != nil {
		return nil, err
	}

	assets, _, err := s.store.ListAssets(ctx, req.Msg.UserId, req.Msg.GroupId, 500, "")
	if err != nil {
		return nil, auth.WrapStoreError("list assets", err)
	}
	liabilities, _, err := s.store.ListLiabilities(ctx, req.Msg.UserId, req.Msg.GroupId, 500, "")
	if err != nil {
		return nil, auth.WrapStoreError("list liabilities", err)
	}

	summary := &pfinancev1.NetWorthSummary{AsOf: timestamppb.Now()}
	assetBuckets := map[string]*pfinancev1.NetWorthCategoryTotal{}
	liabilityBuckets := map[string]*pfinancev1.NetWorthCategoryTotal{}

	for _, a := range assets {
		summary.TotalAssetsCents += a.ValueCents
		if a.IsLiquid {
			summary.LiquidAssetsCents += a.ValueCents
		}
		key := a.Category.String()
		b := assetBuckets[key]
		if b == nil {
			b = &pfinancev1.NetWorthCategoryTotal{Category: key}
			assetBuckets[key] = b
		}
		b.TotalCents += a.ValueCents
		b.Count++
	}
	for _, l := range liabilities {
		summary.TotalLiabilitiesCents += l.BalanceCents
		key := l.Category.String()
		b := liabilityBuckets[key]
		if b == nil {
			b = &pfinancev1.NetWorthCategoryTotal{Category: key}
			liabilityBuckets[key] = b
		}
		b.TotalCents += l.BalanceCents
		b.Count++
	}

	summary.NetWorthCents = summary.TotalAssetsCents - summary.TotalLiabilitiesCents

	for _, b := range assetBuckets {
		summary.AssetsByCategory = append(summary.AssetsByCategory, b)
	}
	for _, b := range liabilityBuckets {
		summary.LiabilitiesByCategory = append(summary.LiabilitiesByCategory, b)
	}
	sort.Slice(summary.AssetsByCategory, func(i, j int) bool {
		return summary.AssetsByCategory[i].TotalCents > summary.AssetsByCategory[j].TotalCents
	})
	sort.Slice(summary.LiabilitiesByCategory, func(i, j int) bool {
		return summary.LiabilitiesByCategory[i].TotalCents > summary.LiabilitiesByCategory[j].TotalCents
	})

	return connect.NewResponse(&pfinancev1.GetNetWorthSummaryResponse{Summary: summary}), nil
}
