package service

import (
	"context"
	"fmt"

	"time"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/auth"
	"github.com/google/uuid"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
)

const maxApiTokensPerUser = 5

// CreateApiToken creates a new API token for the authenticated user (Pro-gated).
func (s *FinanceService) CreateApiToken(ctx context.Context, req *connect.Request[pfinancev1.CreateApiTokenRequest]) (*connect.Response[pfinancev1.CreateApiTokenResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	if err := s.requireProWithFallback(ctx, claims); err != nil {
		return nil, err
	}

	if req.Msg.Name == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("token name is required"))
	}

	// Enforce max tokens per user
	count, err := s.store.CountActiveApiTokens(ctx, claims.UID)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("check token count: %w", err))
	}
	if count >= maxApiTokensPerUser {
		return nil, connect.NewError(connect.CodeResourceExhausted, fmt.Errorf("maximum of %d active API tokens allowed", maxApiTokensPerUser))
	}

	// Generate the token
	raw, hash, prefix, err := auth.GenerateApiToken()
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("generate token: %w", err))
	}

	apiToken := &pfinancev1.ApiToken{
		Id:          uuid.New().String(),
		UserId:      claims.UID,
		Name:        req.Msg.Name,
		TokenPrefix: prefix,
		TokenHash:   hash,
		CreatedAt:   timestamppb.New(time.Now()),
		IsRevoked:   false,
	}

	if err := s.store.CreateApiToken(ctx, apiToken); err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("store token: %w", err))
	}

	// Return the raw token (shown once only) along with metadata.
	// Clear the hash from the response — never expose it to clients.
	responseMeta := proto.Clone(apiToken).(*pfinancev1.ApiToken)
	responseMeta.TokenHash = ""

	return connect.NewResponse(&pfinancev1.CreateApiTokenResponse{
		Token:    raw,
		ApiToken: responseMeta,
	}), nil
}

// ListApiTokens returns all API tokens for the authenticated user (Pro-gated).
func (s *FinanceService) ListApiTokens(ctx context.Context, req *connect.Request[pfinancev1.ListApiTokensRequest]) (*connect.Response[pfinancev1.ListApiTokensResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	if err := s.requireProWithFallback(ctx, claims); err != nil {
		return nil, err
	}

	tokens, err := s.store.ListApiTokens(ctx, claims.UID)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("list tokens: %w", err))
	}

	// Strip token hashes from response
	for _, t := range tokens {
		t.TokenHash = ""
	}

	return connect.NewResponse(&pfinancev1.ListApiTokensResponse{
		Tokens: tokens,
	}), nil
}

// RevokeApiToken revokes an API token belonging to the authenticated user (Pro-gated).
func (s *FinanceService) RevokeApiToken(ctx context.Context, req *connect.Request[pfinancev1.RevokeApiTokenRequest]) (*connect.Response[pfinancev1.RevokeApiTokenResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	if err := s.requireProWithFallback(ctx, claims); err != nil {
		return nil, err
	}

	if req.Msg.TokenId == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("token_id is required"))
	}

	// Verify the token belongs to this user
	tokens, err := s.store.ListApiTokens(ctx, claims.UID)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("list tokens: %w", err))
	}

	found := false
	for _, t := range tokens {
		if t.Id == req.Msg.TokenId {
			found = true
			break
		}
	}
	if !found {
		return nil, connect.NewError(connect.CodeNotFound, fmt.Errorf("token not found"))
	}

	if err := s.store.RevokeApiToken(ctx, req.Msg.TokenId); err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("revoke token: %w", err))
	}

	return connect.NewResponse(&pfinancev1.RevokeApiTokenResponse{}), nil
}
