package service

import (
	"context"
	"fmt"
	"strings"

	"time"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/auth"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// GetMyAdminStatus reports whether the current request is admin-authorized.
// Public to all authenticated users so the frontend can render admin UI conditionally.
func (s *FinanceService) GetMyAdminStatus(ctx context.Context, req *connect.Request[pfinancev1.GetMyAdminStatusRequest]) (*connect.Response[pfinancev1.GetMyAdminStatusResponse], error) {
	if _, err := auth.RequireAuth(ctx); err != nil {
		return nil, err
	}
	return connect.NewResponse(&pfinancev1.GetMyAdminStatusResponse{
		IsAdmin: auth.IsAdminContext(ctx),
	}), nil
}

// ListAllUsers returns all Firebase users with tier/admin metadata. Admin-only.
func (s *FinanceService) ListAllUsers(ctx context.Context, req *connect.Request[pfinancev1.ListAllUsersRequest]) (*connect.Response[pfinancev1.ListAllUsersResponse], error) {
	if _, err := auth.RequireAuth(ctx); err != nil {
		return nil, err
	}
	if err := auth.RequireAdmin(ctx); err != nil {
		return nil, err
	}
	if s.firebaseAuth == nil {
		return nil, connect.NewError(connect.CodeFailedPrecondition,
			fmt.Errorf("firebase auth not configured; admin user listing is unavailable in this environment"))
	}

	pageSize := int(req.Msg.PageSize)
	if pageSize <= 0 {
		pageSize = 200
	}
	if pageSize > 1000 {
		pageSize = 1000
	}

	records, nextToken, err := s.firebaseAuth.ListAllUsersPage(ctx, pageSize, req.Msg.PageToken)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("list users: %w", err))
	}

	users := make([]*pfinancev1.AdminUserSummary, 0, len(records))
	for _, r := range records {
		users = append(users, summarizeUser(ctx, s, r))
	}

	return connect.NewResponse(&pfinancev1.ListAllUsersResponse{
		Users:         users,
		NextPageToken: nextToken,
	}), nil
}

// SetUserTier updates both the Firebase custom claims AND the store user document.
// Admin-only.
func (s *FinanceService) SetUserTier(ctx context.Context, req *connect.Request[pfinancev1.SetUserTierRequest]) (*connect.Response[pfinancev1.SetUserTierResponse], error) {
	if _, err := auth.RequireAuth(ctx); err != nil {
		return nil, err
	}
	if err := auth.RequireAdmin(ctx); err != nil {
		return nil, err
	}
	if s.firebaseAuth == nil {
		return nil, connect.NewError(connect.CodeFailedPrecondition,
			fmt.Errorf("firebase auth not configured; cannot update tier claims"))
	}
	uid := strings.TrimSpace(req.Msg.UserId)
	if uid == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("user_id is required"))
	}

	// Default the status if caller didn't specify: ACTIVE for PRO, UNSPECIFIED for FREE.
	tier := req.Msg.Tier
	status := req.Msg.Status
	if status == pfinancev1.SubscriptionStatus_SUBSCRIPTION_STATUS_UNSPECIFIED {
		if tier == pfinancev1.SubscriptionTier_SUBSCRIPTION_TIER_PRO {
			status = pfinancev1.SubscriptionStatus_SUBSCRIPTION_STATUS_ACTIVE
		}
	}

	// 1. Update Firebase custom claims (authoritative for token-based gating)
	if err := s.firebaseAuth.SetSubscriptionClaims(ctx, uid, tier, status); err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("update claims: %w", err))
	}

	// 2. Update the store user doc (used by handlers that read tier directly)
	storeUser, err := s.store.GetUser(ctx, uid)
	if err != nil || storeUser == nil {
		// Create a minimal user doc if missing — admins may toggle tier on a user
		// who has authenticated but not yet hit any data-creating endpoint.
		fbUser, fbErr := s.firebaseAuth.GetFirebaseUser(ctx, uid)
		if fbErr != nil {
			return nil, connect.NewError(connect.CodeNotFound, fmt.Errorf("user %s not found: %w", uid, fbErr))
		}
		storeUser = &pfinancev1.User{
			Id:          uid,
			Email:       fbUser.Email,
			DisplayName: fbUser.DisplayName,
			PhotoUrl:    fbUser.PhotoURL,
		}
	}
	storeUser.SubscriptionTier = tier
	storeUser.SubscriptionStatus = status
	if err := s.store.UpdateUser(ctx, storeUser); err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("update user store: %w", err))
	}

	// Re-read the Firebase record to reflect the new claims in the response.
	fbUser, err := s.firebaseAuth.GetFirebaseUser(ctx, uid)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("re-fetch user: %w", err))
	}

	return connect.NewResponse(&pfinancev1.SetUserTierResponse{
		User: summarizeUser(ctx, s, fbUser),
	}), nil
}

// SetUserAdmin grants or revokes admin custom claim for a user. Admin-only.
func (s *FinanceService) SetUserAdmin(ctx context.Context, req *connect.Request[pfinancev1.SetUserAdminRequest]) (*connect.Response[pfinancev1.SetUserAdminResponse], error) {
	if _, err := auth.RequireAuth(ctx); err != nil {
		return nil, err
	}
	if err := auth.RequireAdmin(ctx); err != nil {
		return nil, err
	}
	if s.firebaseAuth == nil {
		return nil, connect.NewError(connect.CodeFailedPrecondition,
			fmt.Errorf("firebase auth not configured"))
	}
	uid := strings.TrimSpace(req.Msg.UserId)
	if uid == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("user_id is required"))
	}

	if err := s.firebaseAuth.SetAdminClaim(ctx, uid, req.Msg.IsAdmin); err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	fbUser, err := s.firebaseAuth.GetFirebaseUser(ctx, uid)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("re-fetch user: %w", err))
	}
	return connect.NewResponse(&pfinancev1.SetUserAdminResponse{
		User: summarizeUser(ctx, s, fbUser),
	}), nil
}

// summarizeUser merges a Firebase record with stored tier/status (claims may lag).
func summarizeUser(ctx context.Context, s *FinanceService, r *auth.FirebaseUserRecord) *pfinancev1.AdminUserSummary {
	if r == nil {
		return &pfinancev1.AdminUserSummary{}
	}
	out := &pfinancev1.AdminUserSummary{
		Uid:         r.UID,
		Email:       r.Email,
		DisplayName: r.DisplayName,
		PhotoUrl:    r.PhotoURL,
		Disabled:    r.Disabled,
	}

	// Tier/status: prefer custom claims, fall back to store doc.
	if r.CustomClaims != nil {
		sub := auth.GetSubscriptionClaimsFromToken(r.CustomClaims)
		out.SubscriptionTier = sub.Tier
		out.SubscriptionStatus = sub.Status
	}
	if out.SubscriptionTier == pfinancev1.SubscriptionTier_SUBSCRIPTION_TIER_UNSPECIFIED ||
		out.SubscriptionTier == pfinancev1.SubscriptionTier_SUBSCRIPTION_TIER_FREE {
		if u, err := s.store.GetUser(ctx, r.UID); err == nil && u != nil {
			if u.SubscriptionTier != pfinancev1.SubscriptionTier_SUBSCRIPTION_TIER_UNSPECIFIED {
				out.SubscriptionTier = u.SubscriptionTier
				out.SubscriptionStatus = u.SubscriptionStatus
			}
		}
	}

	// Admin: env-var match OR `admin: true` custom claim.
	out.IsAdmin = auth.IsAdminEmail(r.Email)
	if !out.IsAdmin && r.CustomClaims != nil {
		if v, ok := r.CustomClaims["admin"].(bool); ok && v {
			out.IsAdmin = true
		}
	}

	if r.CreatedAtMS > 0 {
		out.CreatedAt = timestamppb.New(time.UnixMilli(r.CreatedAtMS))
	}
	if r.LastSignInAtMS > 0 {
		out.LastSignInAt = timestamppb.New(time.UnixMilli(r.LastSignInAtMS))
	}
	return out
}
