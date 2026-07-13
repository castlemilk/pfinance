package service

import (
	"testing"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/store"
	"go.uber.org/mock/gomock"
)

func assertWaterfallDollarsMatchCents(t *testing.T, entries []*pfinancev1.WaterfallEntry) {
	t.Helper()
	for _, entry := range entries {
		if entry.Amount != float64(entry.AmountCents)/100 ||
			entry.RunningTotal != float64(entry.RunningTotalCents)/100 {
			t.Fatalf("entry %q doubles do not derive from cents: %+v", entry.Label, entry)
		}
	}
}

func TestWaterfallGroupOmitsTaxAndShowsRemainingCash(t *testing.T) {
	ctrl := gomock.NewController(t)
	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	mockStore.EXPECT().GetGroup(gomock.Any(), "waterfall-group").Return(&pfinancev1.FinanceGroup{
		Id:        "waterfall-group",
		OwnerId:   "group-member",
		MemberIds: []string{"group-member"},
	}, nil)
	mockStore.EXPECT().
		ListIncomes(gomock.Any(), "", "waterfall-group", gomock.Any(), gomock.Any(), int32(1000), "").
		Return([]*pfinancev1.Income{
			{Id: "group-income", AmountCents: 100_000, Amount: 999},
		}, "", nil)
	mockStore.EXPECT().
		ListExpenses(gomock.Any(), "", "waterfall-group", gomock.Any(), gomock.Any(), int32(1000), "").
		Return([]*pfinancev1.Expense{
			{Id: "food-a", AmountCents: 20_000, Amount: 999, Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD},
			{Id: "housing", AmountCents: 40_000, Amount: 999, Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HOUSING},
			{Id: "food-b", AmountCents: 5_000, Amount: 999, Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD},
		}, "", nil)

	resp, err := service.GetWaterfallData(testProContext("group-member"), connect.NewRequest(&pfinancev1.GetWaterfallDataRequest{
		GroupId: "waterfall-group",
		Period:  "month",
	}))
	if err != nil {
		t.Fatalf("GetWaterfallData: %v", err)
	}
	if len(resp.Msg.Entries) != 4 {
		t.Fatalf("group entry count = %d, want 4", len(resp.Msg.Entries))
	}
	labels := []string{
		"Group Income",
		pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HOUSING.String(),
		pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD.String(),
		"Remaining Group Cash",
	}
	amounts := []int64{100_000, 40_000, 25_000, 35_000}
	running := []int64{100_000, 60_000, 35_000, 35_000}
	for i, entry := range resp.Msg.Entries {
		if entry.Label != labels[i] || entry.AmountCents != amounts[i] || entry.RunningTotalCents != running[i] {
			t.Fatalf("group entry %d = %+v, want label %q amount %d running %d",
				i, entry, labels[i], amounts[i], running[i])
		}
		if entry.EntryType == pfinancev1.WaterfallEntryType_WATERFALL_ENTRY_TYPE_TAX {
			t.Fatalf("group waterfall includes tax entry: %+v", entry)
		}
	}
	assertWaterfallDollarsMatchCents(t, resp.Msg.Entries)
}

func TestWaterfallPersonalUsesConfiguredTax(t *testing.T) {
	ctrl := gomock.NewController(t)
	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	mockStore.EXPECT().
		ListIncomes(gomock.Any(), "personal-user", "", gomock.Any(), gomock.Any(), int32(1000), "").
		Return([]*pfinancev1.Income{{Id: "salary", AmountCents: 100_000, Amount: 999}}, "", nil)
	mockStore.EXPECT().
		ListExpenses(gomock.Any(), "personal-user", "", gomock.Any(), gomock.Any(), int32(1000), "").
		Return([]*pfinancev1.Expense{
			{Id: "food", AmountCents: 10_000, Amount: 999, Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD},
		}, "", nil)
	mockStore.EXPECT().
		GetTaxConfig(gomock.Any(), "personal-user", "").
		Return(&pfinancev1.TaxConfig{TaxRate: 30}, nil)

	resp, err := service.GetWaterfallData(testProContext("personal-user"), connect.NewRequest(&pfinancev1.GetWaterfallDataRequest{
		Period: "month",
	}))
	if err != nil {
		t.Fatalf("GetWaterfallData: %v", err)
	}
	if len(resp.Msg.Entries) != 4 {
		t.Fatalf("personal entry count = %d, want 4", len(resp.Msg.Entries))
	}
	labels := []string{"Gross Income", "Tax", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD.String(), "Net Savings"}
	amounts := []int64{100_000, 30_000, 10_000, 60_000}
	for i, entry := range resp.Msg.Entries {
		if entry.Label != labels[i] || entry.AmountCents != amounts[i] {
			t.Fatalf("personal entry %d = %+v, want label %q amount %d", i, entry, labels[i], amounts[i])
		}
	}
	assertWaterfallDollarsMatchCents(t, resp.Msg.Entries)
}

func TestWaterfallLoadsAllIncomeAndExpensePages(t *testing.T) {
	ctrl := gomock.NewController(t)
	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	mockStore.EXPECT().GetGroup(gomock.Any(), "waterfall-group").Return(&pfinancev1.FinanceGroup{
		Id: "waterfall-group", OwnerId: "group-member", MemberIds: []string{"group-member"},
	}, nil)
	gomock.InOrder(
		mockStore.EXPECT().
			ListIncomes(gomock.Any(), "", "waterfall-group", gomock.Any(), gomock.Any(), int32(1000), "").
			Return([]*pfinancev1.Income{{Id: "income-1", AmountCents: 10_000}}, "income-next", nil),
		mockStore.EXPECT().
			ListIncomes(gomock.Any(), "", "waterfall-group", gomock.Any(), gomock.Any(), int32(1000), "income-next").
			Return([]*pfinancev1.Income{{Id: "income-2", AmountCents: 5_000}}, "", nil),
		mockStore.EXPECT().
			ListExpenses(gomock.Any(), "", "waterfall-group", gomock.Any(), gomock.Any(), int32(1000), "").
			Return([]*pfinancev1.Expense{{Id: "food", AmountCents: 2_000, Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD}}, "expense-next", nil),
		mockStore.EXPECT().
			ListExpenses(gomock.Any(), "", "waterfall-group", gomock.Any(), gomock.Any(), int32(1000), "expense-next").
			Return([]*pfinancev1.Expense{{Id: "housing", AmountCents: 3_000, Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HOUSING}}, "", nil),
	)

	resp, err := service.GetWaterfallData(testProContext("group-member"), connect.NewRequest(&pfinancev1.GetWaterfallDataRequest{
		GroupId: "waterfall-group",
		Period:  "month",
	}))
	if err != nil {
		t.Fatalf("GetWaterfallData: %v", err)
	}
	wantAmounts := []int64{15_000, 3_000, 2_000, 10_000}
	if len(resp.Msg.Entries) != len(wantAmounts) {
		t.Fatalf("entry count = %d, want %d", len(resp.Msg.Entries), len(wantAmounts))
	}
	for i, want := range wantAmounts {
		if got := resp.Msg.Entries[i].AmountCents; got != want {
			t.Fatalf("entry %d amount = %d, want %d", i, got, want)
		}
	}
}

func TestWaterfallRejectsRepeatedIncomePageToken(t *testing.T) {
	ctrl := gomock.NewController(t)
	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	gomock.InOrder(
		mockStore.EXPECT().ListIncomes(gomock.Any(), "personal-user", "", gomock.Any(), gomock.Any(), int32(1000), "").Return(nil, "loop", nil),
		mockStore.EXPECT().ListIncomes(gomock.Any(), "personal-user", "", gomock.Any(), gomock.Any(), int32(1000), "loop").Return(nil, "loop", nil),
	)

	resp, err := service.GetWaterfallData(testProContext("personal-user"), connect.NewRequest(&pfinancev1.GetWaterfallDataRequest{}))
	if resp != nil {
		t.Fatalf("response = %#v, want nil", resp)
	}
	if connect.CodeOf(err) != connect.CodeInternal {
		t.Fatalf("error code = %s, want internal (err=%v)", connect.CodeOf(err), err)
	}
}

func TestWaterfallRejectsRepeatedExpensePageToken(t *testing.T) {
	ctrl := gomock.NewController(t)
	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	gomock.InOrder(
		mockStore.EXPECT().ListIncomes(gomock.Any(), "personal-user", "", gomock.Any(), gomock.Any(), int32(1000), "").Return(nil, "", nil),
		mockStore.EXPECT().ListExpenses(gomock.Any(), "personal-user", "", gomock.Any(), gomock.Any(), int32(1000), "").Return(nil, "loop", nil),
		mockStore.EXPECT().ListExpenses(gomock.Any(), "personal-user", "", gomock.Any(), gomock.Any(), int32(1000), "loop").Return(nil, "loop", nil),
	)

	resp, err := service.GetWaterfallData(testProContext("personal-user"), connect.NewRequest(&pfinancev1.GetWaterfallDataRequest{}))
	if resp != nil {
		t.Fatalf("response = %#v, want nil", resp)
	}
	if connect.CodeOf(err) != connect.CodeInternal {
		t.Fatalf("error code = %s, want internal (err=%v)", connect.CodeOf(err), err)
	}
}
