package service

import (
	"testing"
	"time"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/store"
	"go.uber.org/mock/gomock"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func groupSummaryTestGroup() *pfinancev1.FinanceGroup {
	return &pfinancev1.FinanceGroup{
		Id:        "group-analytics",
		OwnerId:   "member-a",
		MemberIds: []string{"member-a", "member-b"},
	}
}

func assertGroupSummaryDollarsMatchCents(t *testing.T, resp *pfinancev1.GetGroupSummaryResponse) {
	t.Helper()
	if resp.TotalExpenses != float64(resp.TotalExpensesCents)/100 ||
		resp.TotalIncome != float64(resp.TotalIncomeCents)/100 ||
		resp.UnsettledAmount != float64(resp.UnsettledAmountCents)/100 {
		t.Fatalf("summary doubles do not exactly derive from cents: %+v", resp)
	}
	for _, breakdown := range resp.ExpenseByCategory {
		if breakdown.Amount != float64(breakdown.AmountCents)/100 {
			t.Fatalf("category %s amount %.10f does not derive from %d cents",
				breakdown.Category, breakdown.Amount, breakdown.AmountCents)
		}
	}
	for _, balance := range resp.MemberBalances {
		if balance.TotalPaid != float64(balance.TotalPaidCents)/100 ||
			balance.TotalOwed != float64(balance.TotalOwedCents)/100 ||
			balance.Balance != float64(balance.BalanceCents)/100 {
			t.Fatalf("member %s doubles do not derive from cents: %+v", balance.UserId, balance)
		}
		for _, debt := range balance.Debts {
			if debt.Amount != float64(debt.AmountCents)/100 {
				t.Fatalf("debt %s->%s amount %.10f does not derive from %d cents",
					debt.FromUserId, debt.ToUserId, debt.Amount, debt.AmountCents)
			}
		}
	}
}

func memberBalanceFor(t *testing.T, balances []*pfinancev1.MemberBalance, userID string) *pfinancev1.MemberBalance {
	t.Helper()
	for _, balance := range balances {
		if balance.UserId == userID {
			return balance
		}
	}
	t.Fatalf("member balance %q not found", userID)
	return nil
}

func TestMemberBalanceGrossTotalsStayStableAfterSettlement(t *testing.T) {
	makeExpense := func(paid bool) *pfinancev1.Expense {
		return &pfinancev1.Expense{
			Id: "shared", GroupId: "group-analytics", PaidByUserId: "member-a", AmountCents: 10_000,
			Allocations: []*pfinancev1.ExpenseAllocation{
				{UserId: "member-a", AmountCents: 5_000, IsPaid: false},
				{UserId: "member-b", AmountCents: 5_000, IsPaid: paid},
			},
		}
	}

	before, err := computeMemberBalancesFromExpenses([]*pfinancev1.Expense{makeExpense(false)}, "group-analytics")
	if err != nil {
		t.Fatalf("compute before settlement: %v", err)
	}
	aBefore := memberBalanceFor(t, before, "member-a")
	bBefore := memberBalanceFor(t, before, "member-b")
	if aBefore.TotalPaidCents != 10_000 || aBefore.TotalOwedCents != 5_000 || aBefore.BalanceCents != 5_000 {
		t.Fatalf("member-a before = %+v", aBefore)
	}
	if bBefore.TotalPaidCents != 0 || bBefore.TotalOwedCents != 5_000 || bBefore.BalanceCents != -5_000 {
		t.Fatalf("member-b before = %+v", bBefore)
	}
	for _, balance := range []*pfinancev1.MemberBalance{aBefore, bBefore} {
		if len(balance.Debts) != 1 || balance.Debts[0].FromUserId != "member-b" ||
			balance.Debts[0].ToUserId != "member-a" || balance.Debts[0].AmountCents != 5_000 {
			t.Fatalf("member %s debts before = %+v, want shared member-b -> member-a debt", balance.UserId, balance.Debts)
		}
	}

	after, err := computeMemberBalancesFromExpenses([]*pfinancev1.Expense{makeExpense(true)}, "group-analytics")
	if err != nil {
		t.Fatalf("compute after settlement: %v", err)
	}
	aAfter := memberBalanceFor(t, after, "member-a")
	bAfter := memberBalanceFor(t, after, "member-b")
	for _, pair := range [][2]*pfinancev1.MemberBalance{{aBefore, aAfter}, {bBefore, bAfter}} {
		if pair[0].TotalPaidCents != pair[1].TotalPaidCents ||
			pair[0].TotalOwedCents != pair[1].TotalOwedCents ||
			pair[0].BalanceCents != pair[1].BalanceCents {
			t.Fatalf("gross balance changed after settlement: before=%+v after=%+v", pair[0], pair[1])
		}
		if len(pair[1].Debts) != 0 {
			t.Fatalf("member %s debts after settlement = %+v, want none", pair[1].UserId, pair[1].Debts)
		}
	}
}

func TestGetMemberBalancesLoadsEveryGroupExpensePage(t *testing.T) {
	ctrl := gomock.NewController(t)
	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	firstPage := make([]*pfinancev1.Expense, 1000)
	for i := range firstPage {
		firstPage[i] = &pfinancev1.Expense{
			Id: "first-page", GroupId: "group-analytics", PaidByUserId: "member-a", AmountCents: 1,
		}
	}
	start := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2026, time.January, 31, 23, 59, 59, 0, time.UTC)

	mockStore.EXPECT().GetGroup(gomock.Any(), "group-analytics").Return(groupSummaryTestGroup(), nil)
	gomock.InOrder(
		mockStore.EXPECT().
			ListExpenses(gomock.Any(), "", "group-analytics", gomock.Any(), gomock.Any(), int32(1000), "").
			Return(firstPage, "expenses-next", nil),
		mockStore.EXPECT().
			ListExpenses(gomock.Any(), "", "group-analytics", gomock.Any(), gomock.Any(), int32(1000), "expenses-next").
			Return([]*pfinancev1.Expense{{
				Id: "second-page", GroupId: "group-analytics", PaidByUserId: "member-b", AmountCents: 250,
			}}, "", nil),
	)

	resp, err := service.GetMemberBalances(testContext("member-a"), connect.NewRequest(&pfinancev1.GetMemberBalancesRequest{
		GroupId: "group-analytics", StartDate: timestamppb.New(start), EndDate: timestamppb.New(end),
	}))
	if err != nil {
		t.Fatalf("GetMemberBalances: %v", err)
	}
	if resp.Msg.TotalGroupExpensesCents != 1_250 {
		t.Fatalf("total group expenses = %d, want 1250", resp.Msg.TotalGroupExpensesCents)
	}
	if got := memberBalanceFor(t, resp.Msg.Balances, "member-a").TotalPaidCents; got != 1_000 {
		t.Fatalf("member-a paid = %d, want 1000", got)
	}
	if got := memberBalanceFor(t, resp.Msg.Balances, "member-b").TotalPaidCents; got != 250 {
		t.Fatalf("member-b paid = %d, want 250", got)
	}
}

func TestGetMemberBalancesRejectsRepeatedExpensePageToken(t *testing.T) {
	ctrl := gomock.NewController(t)
	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	mockStore.EXPECT().GetGroup(gomock.Any(), "group-analytics").Return(groupSummaryTestGroup(), nil)
	expenseCalls := 0
	mockStore.EXPECT().
		ListExpenses(gomock.Any(), "", "group-analytics", gomock.Any(), gomock.Any(), int32(1000), gomock.Any()).
		DoAndReturn(func(_ any, _, _ string, _, _ *time.Time, _ int32, _ string) ([]*pfinancev1.Expense, string, error) {
			expenseCalls++
			return nil, "repeat", nil
		}).
		AnyTimes()

	resp, err := service.GetMemberBalances(testContext("member-a"), connect.NewRequest(&pfinancev1.GetMemberBalancesRequest{
		GroupId: "group-analytics",
	}))
	if resp != nil {
		t.Fatalf("response = %#v, want nil", resp)
	}
	if connect.CodeOf(err) != connect.CodeInternal {
		t.Fatalf("error code = %s, want internal (err=%v)", connect.CodeOf(err), err)
	}
	if expenseCalls != 2 {
		t.Fatalf("expense page calls = %d, want 2", expenseCalls)
	}
}

func TestGetMemberBalancesOptionalUserFilter(t *testing.T) {
	tests := []struct {
		name      string
		userID    string
		wantUsers []string
	}{
		{name: "absent returns all members", wantUsers: []string{"member-a", "member-b"}},
		{name: "present returns requested member", userID: "member-b", wantUsers: []string{"member-b"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctrl := gomock.NewController(t)
			mockStore := store.NewMockStore(ctrl)
			service := NewFinanceService(mockStore, nil, nil)

			mockStore.EXPECT().GetGroup(gomock.Any(), "group-analytics").Return(groupSummaryTestGroup(), nil)
			mockStore.EXPECT().
				ListExpenses(gomock.Any(), "", "group-analytics", gomock.Any(), gomock.Any(), int32(1000), "").
				Return([]*pfinancev1.Expense{
					{Id: "a", GroupId: "group-analytics", PaidByUserId: "member-a", AmountCents: 100},
					{Id: "b", GroupId: "group-analytics", PaidByUserId: "member-b", AmountCents: 200},
				}, "", nil)

			resp, err := service.GetMemberBalances(testContext("member-a"), connect.NewRequest(&pfinancev1.GetMemberBalancesRequest{
				GroupId: "group-analytics", UserId: tt.userID,
			}))
			if err != nil {
				t.Fatalf("GetMemberBalances: %v", err)
			}
			if resp.Msg.TotalGroupExpensesCents != 300 {
				t.Fatalf("total group expenses = %d, want 300", resp.Msg.TotalGroupExpensesCents)
			}
			if len(resp.Msg.Balances) != len(tt.wantUsers) {
				t.Fatalf("balance count = %d, want %d", len(resp.Msg.Balances), len(tt.wantUsers))
			}
			for i, wantUser := range tt.wantUsers {
				if got := resp.Msg.Balances[i].UserId; got != wantUser {
					t.Fatalf("balance %d user = %q, want %q", i, got, wantUser)
				}
			}
		})
	}
}

func TestGetGroupSummaryCountsEveryPageOnceAndUsesCents(t *testing.T) {
	ctrl := gomock.NewController(t)
	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	firstExpensePage := make([]*pfinancev1.Expense, 1000)
	for i := range firstExpensePage {
		firstExpensePage[i] = &pfinancev1.Expense{
			Id: "food-" + string(rune(i)), AmountCents: 1, Amount: 999,
			Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
			GroupId:  "group-analytics", PaidByUserId: "member-a", IsSettled: true,
		}
	}
	secondExpensePage := []*pfinancev1.Expense{
		{
			Id: "shopping-unsettled", AmountCents: 250, Amount: 999,
			Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING,
			GroupId:  "group-analytics", PaidByUserId: "member-b", IsSettled: false,
			Allocations: []*pfinancev1.ExpenseAllocation{
				{UserId: "member-a", AmountCents: 125, Amount: 999, IsPaid: false},
				{UserId: "member-b", AmountCents: 125, Amount: 999, IsPaid: false},
			},
		},
		{
			Id: "shopping-settled", AmountCents: 350, Amount: 999,
			Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING,
			GroupId:  "group-analytics", PaidByUserId: "member-b", IsSettled: true,
		},
	}
	firstIncomePage := make([]*pfinancev1.Income, 1000)
	for i := range firstIncomePage {
		firstIncomePage[i] = &pfinancev1.Income{
			Id: "income-" + string(rune(i)), GroupId: "group-analytics", AmountCents: 2, Amount: 999,
		}
	}
	secondIncomePage := []*pfinancev1.Income{
		{Id: "income-last", GroupId: "group-analytics", AmountCents: 300, Amount: 999},
	}
	start := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2026, time.January, 31, 23, 59, 59, 0, time.UTC)

	mockStore.EXPECT().GetGroup(gomock.Any(), "group-analytics").Return(groupSummaryTestGroup(), nil)
	gomock.InOrder(
		mockStore.EXPECT().
			ListExpenses(gomock.Any(), "", "group-analytics", gomock.Any(), gomock.Any(), int32(1000), "").
			Return(firstExpensePage, "expenses-2", nil),
		mockStore.EXPECT().
			ListExpenses(gomock.Any(), "", "group-analytics", gomock.Any(), gomock.Any(), int32(1000), "expenses-2").
			Return(secondExpensePage, "", nil),
		mockStore.EXPECT().
			ListIncomes(gomock.Any(), "", "group-analytics", gomock.Any(), gomock.Any(), int32(1000), "").
			Return(firstIncomePage, "incomes-2", nil),
		mockStore.EXPECT().
			ListIncomes(gomock.Any(), "", "group-analytics", gomock.Any(), gomock.Any(), int32(1000), "incomes-2").
			Return(secondIncomePage, "", nil),
	)

	resp, err := service.GetGroupSummary(testContext("member-a"), connect.NewRequest(&pfinancev1.GetGroupSummaryRequest{
		GroupId:   "group-analytics",
		StartDate: timestamppb.New(start),
		EndDate:   timestamppb.New(end),
	}))
	if err != nil {
		t.Fatalf("GetGroupSummary: %v", err)
	}
	if resp.Msg.TotalExpensesCents != 1_600 || resp.Msg.TotalIncomeCents != 2_300 ||
		resp.Msg.UnsettledExpenseCount != 1 || resp.Msg.UnsettledAmountCents != 250 {
		t.Fatalf("summary totals = expenses:%d income:%d unsettled:%d/%d",
			resp.Msg.TotalExpensesCents, resp.Msg.TotalIncomeCents,
			resp.Msg.UnsettledExpenseCount, resp.Msg.UnsettledAmountCents)
	}
	assertGroupSummaryDollarsMatchCents(t, resp.Msg)

	if len(resp.Msg.ExpenseByCategory) != 2 ||
		resp.Msg.ExpenseByCategory[0].Category != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD ||
		resp.Msg.ExpenseByCategory[0].AmountCents != 1_000 ||
		resp.Msg.ExpenseByCategory[1].Category != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING ||
		resp.Msg.ExpenseByCategory[1].AmountCents != 600 {
		t.Fatalf("category breakdown = %+v", resp.Msg.ExpenseByCategory)
	}
	if resp.Msg.ExpenseByCategory[0].Percentage != 62.5 || resp.Msg.ExpenseByCategory[1].Percentage != 37.5 {
		t.Fatalf("category percentages = %.4f/%.4f, want 62.5/37.5",
			resp.Msg.ExpenseByCategory[0].Percentage, resp.Msg.ExpenseByCategory[1].Percentage)
	}

	if len(resp.Msg.MemberBalances) != 2 {
		t.Fatalf("member balance count = %d, want 2", len(resp.Msg.MemberBalances))
	}
	memberA := resp.Msg.MemberBalances[0]
	memberB := resp.Msg.MemberBalances[1]
	if memberA.UserId != "member-a" || memberA.TotalPaidCents != 1_000 || memberA.TotalOwedCents != 125 || memberA.BalanceCents != 875 {
		t.Fatalf("member-a balance = %+v", memberA)
	}
	if len(memberA.Debts) != 1 || memberA.Debts[0].FromUserId != "member-a" ||
		memberA.Debts[0].ToUserId != "member-b" || memberA.Debts[0].AmountCents != 125 || memberA.Debts[0].ExpenseCount != 1 {
		t.Fatalf("member-a debts = %+v", memberA.Debts)
	}
	if memberB.UserId != "member-b" || memberB.TotalPaidCents != 600 || memberB.TotalOwedCents != 125 || memberB.BalanceCents != 475 {
		t.Fatalf("member-b balance = %+v", memberB)
	}
}

func TestGetGroupSummaryRejectsRepeatedExpensePageToken(t *testing.T) {
	ctrl := gomock.NewController(t)
	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	mockStore.EXPECT().GetGroup(gomock.Any(), "group-analytics").Return(groupSummaryTestGroup(), nil)
	expenseCalls := 0
	mockStore.EXPECT().
		ListExpenses(gomock.Any(), "", "group-analytics", gomock.Any(), gomock.Any(), int32(1000), gomock.Any()).
		DoAndReturn(func(_ any, _, _ string, _, _ *time.Time, _ int32, _ string) ([]*pfinancev1.Expense, string, error) {
			expenseCalls++
			return []*pfinancev1.Expense{{Id: "once", AmountCents: 100}}, "repeat", nil
		}).
		AnyTimes()
	mockStore.EXPECT().
		ListIncomes(gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any()).
		Return(nil, "", nil).
		AnyTimes()

	_, err := service.GetGroupSummary(testContext("member-a"), connect.NewRequest(&pfinancev1.GetGroupSummaryRequest{
		GroupId: "group-analytics",
	}))
	if err == nil || connect.CodeOf(err) != connect.CodeInternal {
		t.Fatalf("repeated expense token error = %v, want internal", err)
	}
	if expenseCalls != 2 {
		t.Fatalf("expense page calls = %d, want 2 before cycle detection", expenseCalls)
	}
}

func TestGetGroupSummaryRejectsRepeatedIncomePageToken(t *testing.T) {
	ctrl := gomock.NewController(t)
	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	mockStore.EXPECT().GetGroup(gomock.Any(), "group-analytics").Return(groupSummaryTestGroup(), nil)
	mockStore.EXPECT().
		ListExpenses(gomock.Any(), "", "group-analytics", gomock.Any(), gomock.Any(), int32(1000), "").
		Return(nil, "", nil)
	incomeCalls := 0
	mockStore.EXPECT().
		ListIncomes(gomock.Any(), "", "group-analytics", gomock.Any(), gomock.Any(), int32(1000), gomock.Any()).
		DoAndReturn(func(_ any, _, _ string, _, _ *time.Time, _ int32, _ string) ([]*pfinancev1.Income, string, error) {
			incomeCalls++
			return []*pfinancev1.Income{{Id: "once", AmountCents: 100}}, "repeat", nil
		}).
		AnyTimes()

	_, err := service.GetGroupSummary(testContext("member-a"), connect.NewRequest(&pfinancev1.GetGroupSummaryRequest{
		GroupId: "group-analytics",
	}))
	if err == nil || connect.CodeOf(err) != connect.CodeInternal {
		t.Fatalf("repeated income token error = %v, want internal", err)
	}
	if incomeCalls != 2 {
		t.Fatalf("income page calls = %d, want 2 before cycle detection", incomeCalls)
	}
}
