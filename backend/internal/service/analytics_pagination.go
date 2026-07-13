package service

import (
	"context"
	"fmt"
	"time"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/auth"
)

func (s *FinanceService) listAllAnalyticsExpenses(
	ctx context.Context,
	scope analyticsScope,
	start, end *time.Time,
) ([]*pfinancev1.Expense, error) {
	var expenses []*pfinancev1.Expense
	pageToken := ""
	seenTokens := make(map[string]struct{})

	for {
		page, nextPageToken, err := s.store.ListExpenses(
			ctx, scope.userID, scope.groupID, start, end, 1000, pageToken,
		)
		if err != nil {
			return nil, auth.WrapStoreError("list expenses", err)
		}
		expenses = append(expenses, page...)
		if nextPageToken == "" {
			return expenses, nil
		}
		if _, repeated := seenTokens[nextPageToken]; repeated {
			return nil, connect.NewError(
				connect.CodeInternal,
				fmt.Errorf("pagination token repeated while listing expenses: %q", nextPageToken),
			)
		}
		seenTokens[nextPageToken] = struct{}{}
		pageToken = nextPageToken
	}
}

func (s *FinanceService) listAllAnalyticsIncomes(
	ctx context.Context,
	scope analyticsScope,
	start, end *time.Time,
) ([]*pfinancev1.Income, error) {
	var incomes []*pfinancev1.Income
	pageToken := ""
	seenTokens := make(map[string]struct{})

	for {
		page, nextPageToken, err := s.store.ListIncomes(
			ctx, scope.userID, scope.groupID, start, end, 1000, pageToken,
		)
		if err != nil {
			return nil, auth.WrapStoreError("list incomes", err)
		}
		incomes = append(incomes, page...)
		if nextPageToken == "" {
			return incomes, nil
		}
		if _, repeated := seenTokens[nextPageToken]; repeated {
			return nil, connect.NewError(
				connect.CodeInternal,
				fmt.Errorf("pagination token repeated while listing incomes: %q", nextPageToken),
			)
		}
		seenTokens[nextPageToken] = struct{}{}
		pageToken = nextPageToken
	}
}
