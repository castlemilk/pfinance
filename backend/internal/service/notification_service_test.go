package service

import (
	"fmt"
	"testing"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/store"
	"go.uber.org/mock/gomock"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func TestListNotifications(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)

	tests := []struct {
		name          string
		userID        string
		request       *pfinancev1.ListNotificationsRequest
		setupMock     func()
		expectedError bool
		expectedCount int
	}{
		{
			name:   "list all notifications",
			userID: "user-123",
			request: &pfinancev1.ListNotificationsRequest{
				UserId:     "user-123",
				UnreadOnly: false,
				PageSize:   50,
			},
			setupMock: func() {
				mockStore.EXPECT().
					ListNotifications(gomock.Any(), "user-123", false, pfinancev1.NotificationType_NOTIFICATION_TYPE_UNSPECIFIED, int32(50), "").
					Return([]*pfinancev1.Notification{
						{Id: "n1", UserId: "user-123", Title: "Budget Alert", IsRead: false},
						{Id: "n2", UserId: "user-123", Title: "Goal Reached", IsRead: true},
					}, "", nil)
				mockStore.EXPECT().
					GetUnreadNotificationCount(gomock.Any(), "user-123").
					Return(int32(1), nil)
			},
			expectedError: false,
			expectedCount: 2,
		},
		{
			name:   "list unread only",
			userID: "user-123",
			request: &pfinancev1.ListNotificationsRequest{
				UserId:     "user-123",
				UnreadOnly: true,
				PageSize:   50,
			},
			setupMock: func() {
				mockStore.EXPECT().
					ListNotifications(gomock.Any(), "user-123", true, pfinancev1.NotificationType_NOTIFICATION_TYPE_UNSPECIFIED, int32(50), "").
					Return([]*pfinancev1.Notification{
						{Id: "n1", UserId: "user-123", Title: "Budget Alert", IsRead: false},
					}, "", nil)
				mockStore.EXPECT().
					GetUnreadNotificationCount(gomock.Any(), "user-123").
					Return(int32(1), nil)
			},
			expectedError: false,
			expectedCount: 1,
		},
		{
			name:   "permission denied for different user",
			userID: "user-123",
			request: &pfinancev1.ListNotificationsRequest{
				UserId: "user-456",
			},
			setupMock:     func() {},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tc.setupMock()

			ctx := testContext(tc.userID)
			resp, err := svc.ListNotifications(ctx, connect.NewRequest(tc.request))

			if tc.expectedError {
				if err == nil {
					t.Error("expected error but got nil")
				}
				return
			}

			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			if len(resp.Msg.Notifications) != tc.expectedCount {
				t.Errorf("expected %d notifications, got %d", tc.expectedCount, len(resp.Msg.Notifications))
			}
		})
	}
}

func TestMarkNotificationRead(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)

	tests := []struct {
		name          string
		userID        string
		request       *pfinancev1.MarkNotificationReadRequest
		setupMock     func()
		expectedError bool
	}{
		{
			name:   "mark notification as read",
			userID: "user-123",
			request: &pfinancev1.MarkNotificationReadRequest{
				NotificationId: "n1",
			},
			setupMock: func() {
				mockStore.EXPECT().
					MarkNotificationRead(gomock.Any(), "n1").
					Return(nil)
			},
			expectedError: false,
		},
		{
			name:   "missing notification_id",
			userID: "user-123",
			request: &pfinancev1.MarkNotificationReadRequest{
				NotificationId: "",
			},
			setupMock:     func() {},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tc.setupMock()

			ctx := testContext(tc.userID)
			_, err := svc.MarkNotificationRead(ctx, connect.NewRequest(tc.request))

			if tc.expectedError && err == nil {
				t.Error("expected error but got nil")
			}
			if !tc.expectedError && err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

func TestMarkAllNotificationsRead(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)

	t.Run("mark all read for own user", func(t *testing.T) {
		mockStore.EXPECT().
			MarkAllNotificationsRead(gomock.Any(), "user-123").
			Return(nil)

		ctx := testContext("user-123")
		_, err := svc.MarkAllNotificationsRead(ctx, connect.NewRequest(&pfinancev1.MarkAllNotificationsReadRequest{
			UserId: "user-123",
		}))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("permission denied for different user", func(t *testing.T) {
		ctx := testContext("user-123")
		_, err := svc.MarkAllNotificationsRead(ctx, connect.NewRequest(&pfinancev1.MarkAllNotificationsReadRequest{
			UserId: "user-456",
		}))
		if err == nil {
			t.Error("expected error but got nil")
		}
	})
}

func TestGetUnreadNotificationCount(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)

	t.Run("get unread count", func(t *testing.T) {
		mockStore.EXPECT().
			GetUnreadNotificationCount(gomock.Any(), "user-123").
			Return(int32(5), nil)

		ctx := testContext("user-123")
		resp, err := svc.GetUnreadNotificationCount(ctx, connect.NewRequest(&pfinancev1.GetUnreadNotificationCountRequest{
			UserId: "user-123",
		}))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if resp.Msg.Count != 5 {
			t.Errorf("expected count 5, got %d", resp.Msg.Count)
		}
	})
}

func TestGetNotificationPreferences(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)

	t.Run("get default preferences", func(t *testing.T) {
		mockStore.EXPECT().
			GetNotificationPreferences(gomock.Any(), "user-123").
			Return(&pfinancev1.NotificationPreferences{
				UserId:         "user-123",
				BudgetAlerts:   true,
				GoalMilestones: true,
				BillReminders:  true,
			}, nil)

		ctx := testContext("user-123")
		resp, err := svc.GetNotificationPreferences(ctx, connect.NewRequest(&pfinancev1.GetNotificationPreferencesRequest{
			UserId: "user-123",
		}))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if resp.Msg.Preferences == nil {
			t.Fatal("expected preferences to be non-nil")
		}
		if !resp.Msg.Preferences.BudgetAlerts {
			t.Error("expected budget_alerts to be true")
		}
	})
}

func TestUpdateNotificationPreferences(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)

	t.Run("update preferences", func(t *testing.T) {
		mockStore.EXPECT().
			UpdateNotificationPreferences(gomock.Any(), gomock.Any()).
			Return(nil)

		ctx := testContext("user-123")
		resp, err := svc.UpdateNotificationPreferences(ctx, connect.NewRequest(&pfinancev1.UpdateNotificationPreferencesRequest{
			UserId: "user-123",
			Preferences: &pfinancev1.NotificationPreferences{
				BudgetAlerts:   false,
				GoalMilestones: true,
				BillReminders:  true,
				WeeklyDigest:   true,
			},
		}))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if resp.Msg.Preferences == nil {
			t.Fatal("expected preferences to be non-nil")
		}
	})

	t.Run("missing preferences field", func(t *testing.T) {
		ctx := testContext("user-123")
		_, err := svc.UpdateNotificationPreferences(ctx, connect.NewRequest(&pfinancev1.UpdateNotificationPreferencesRequest{
			UserId: "user-123",
		}))
		if err == nil {
			t.Error("expected error but got nil")
		}
	})
}

func TestNotificationTrigger_BudgetThreshold(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	trigger := NewNotificationTrigger(mockStore)

	t.Run("creates notification when budget exceeded", func(t *testing.T) {
		mockStore.EXPECT().
			GetNotificationPreferences(gomock.Any(), "user-123").
			Return(&pfinancev1.NotificationPreferences{
				UserId:       "user-123",
				BudgetAlerts: true,
			}, nil)
		mockStore.EXPECT().
			HasNotification(gomock.Any(), "user-123",
				pfinancev1.NotificationType_NOTIFICATION_TYPE_BUDGET_THRESHOLD,
				"budget-1", "threshold", "80", 720).
			Return(false, nil)
		mockStore.EXPECT().
			CreateNotification(gomock.Any(), gomock.Any()).
			Return(nil)

		budget := &pfinancev1.Budget{
			Id:          "budget-1",
			Name:        "Food",
			AmountCents: 50000, // $500
		}
		trigger.CheckBudgetThreshold(testContext("user-123"), "user-123", budget, 45000, 80)
	})

	t.Run("skips when below threshold", func(t *testing.T) {
		budget := &pfinancev1.Budget{
			Id:          "budget-1",
			Name:        "Food",
			AmountCents: 50000,
		}
		// No mock expectations set = no calls expected
		trigger.CheckBudgetThreshold(testContext("user-123"), "user-123", budget, 10000, 80)
	})

	t.Run("skips when budget alerts disabled", func(t *testing.T) {
		mockStore.EXPECT().
			GetNotificationPreferences(gomock.Any(), "user-123").
			Return(&pfinancev1.NotificationPreferences{
				UserId:       "user-123",
				BudgetAlerts: false,
			}, nil)

		budget := &pfinancev1.Budget{
			Id:          "budget-1",
			Name:        "Food",
			AmountCents: 50000,
		}
		trigger.CheckBudgetThreshold(testContext("user-123"), "user-123", budget, 45000, 80)
	})
}

func TestNotificationTrigger_BudgetThreshold_Dedup(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	trigger := NewNotificationTrigger(mockStore)

	t.Run("skips when duplicate exists", func(t *testing.T) {
		mockStore.EXPECT().
			GetNotificationPreferences(gomock.Any(), "user-123").
			Return(&pfinancev1.NotificationPreferences{
				UserId:       "user-123",
				BudgetAlerts: true,
			}, nil)
		mockStore.EXPECT().
			HasNotification(gomock.Any(), "user-123",
				pfinancev1.NotificationType_NOTIFICATION_TYPE_BUDGET_THRESHOLD,
						"budget-1", "threshold", "80", 720).
			Return(true, nil) // duplicate exists!
		// No CreateNotification expected

		budget := &pfinancev1.Budget{
			Id:          "budget-1",
			Name:        "Food",
			AmountCents: 50000,
		}
		trigger.CheckBudgetThreshold(testContext("user-123"), "user-123", budget, 45000, 80)
	})
}

func TestNotificationTrigger_GoalMilestone(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	trigger := NewNotificationTrigger(mockStore)

	t.Run("creates notification at 50% milestone", func(t *testing.T) {
		mockStore.EXPECT().
			GetNotificationPreferences(gomock.Any(), "user-123").
			Return(&pfinancev1.NotificationPreferences{
				UserId:         "user-123",
				GoalMilestones: true,
			}, nil)
		mockStore.EXPECT().
			HasNotification(gomock.Any(), "user-123",
				pfinancev1.NotificationType_NOTIFICATION_TYPE_GOAL_MILESTONE,
				"goal-1", "milestone", "50", 8760).
			Return(false, nil)
		mockStore.EXPECT().
			CreateNotification(gomock.Any(), gomock.Any()).
			Return(nil)

		goal := &pfinancev1.FinancialGoal{
			Id:                "goal-1",
			Name:              "Emergency Fund",
			TargetAmountCents: 1000000, // $10,000
		}
		trigger.GoalMilestoneReached(testContext("user-123"), "user-123", goal, 500000)
	})

	t.Run("creates notification at 100%", func(t *testing.T) {
		mockStore.EXPECT().
			GetNotificationPreferences(gomock.Any(), "user-123").
			Return(&pfinancev1.NotificationPreferences{
				UserId:         "user-123",
				GoalMilestones: true,
			}, nil)
		mockStore.EXPECT().
			HasNotification(gomock.Any(), "user-123",
				pfinancev1.NotificationType_NOTIFICATION_TYPE_GOAL_MILESTONE,
				"goal-1", "milestone", "100", 8760).
			Return(false, nil)
		mockStore.EXPECT().
			CreateNotification(gomock.Any(), gomock.Any()).
			Return(nil)

		goal := &pfinancev1.FinancialGoal{
			Id:                "goal-1",
			Name:              "Emergency Fund",
			TargetAmountCents: 1000000,
		}
		trigger.GoalMilestoneReached(testContext("user-123"), "user-123", goal, 1000000)
	})

	t.Run("skips when below 25%", func(t *testing.T) {
		mockStore.EXPECT().
			GetNotificationPreferences(gomock.Any(), "user-123").
			Return(&pfinancev1.NotificationPreferences{
				UserId:         "user-123",
				GoalMilestones: true,
			}, nil)

		goal := &pfinancev1.FinancialGoal{
			Id:                "goal-1",
			Name:              "Emergency Fund",
			TargetAmountCents: 1000000,
		}
		trigger.GoalMilestoneReached(testContext("user-123"), "user-123", goal, 100000) // 10%
	})
}

func TestNotificationTrigger_GoalMilestone_Dedup(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	trigger := NewNotificationTrigger(mockStore)

	t.Run("skips when milestone duplicate exists", func(t *testing.T) {
		mockStore.EXPECT().
			GetNotificationPreferences(gomock.Any(), "user-123").
			Return(&pfinancev1.NotificationPreferences{
				UserId:         "user-123",
				GoalMilestones: true,
			}, nil)
		mockStore.EXPECT().
			HasNotification(gomock.Any(), "user-123",
				pfinancev1.NotificationType_NOTIFICATION_TYPE_GOAL_MILESTONE,
				"goal-1", "milestone", "50", 8760).
			Return(true, nil)
		// No CreateNotification expected

		goal := &pfinancev1.FinancialGoal{
			Id:                "goal-1",
			Name:              "Emergency Fund",
			TargetAmountCents: 1000000,
		}
		trigger.GoalMilestoneReached(testContext("user-123"), "user-123", goal, 500000)
	})
}

func TestNotificationTrigger_BillReminder(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	trigger := NewNotificationTrigger(mockStore)

	t.Run("creates bill reminder notification", func(t *testing.T) {
		mockStore.EXPECT().
			GetNotificationPreferences(gomock.Any(), "user-123").
			Return(&pfinancev1.NotificationPreferences{
				UserId:        "user-123",
				BillReminders: true,
			}, nil)
		mockStore.EXPECT().
			HasNotification(gomock.Any(), "user-123",
				pfinancev1.NotificationType_NOTIFICATION_TYPE_BILL_REMINDER,
				"rt-1", "", "", 720).
			Return(false, nil)
		mockStore.EXPECT().
			CreateNotification(gomock.Any(), gomock.Any()).
			Return(nil)

		rt := &pfinancev1.RecurringTransaction{
			Id:             "rt-1",
			Description:    "Netflix",
			NextOccurrence: timestamppb.Now(),
		}
		trigger.BillReminder(testContext("user-123"), "user-123", rt)
	})

	t.Run("skips when bill reminders disabled", func(t *testing.T) {
		mockStore.EXPECT().
			GetNotificationPreferences(gomock.Any(), "user-123").
			Return(&pfinancev1.NotificationPreferences{
				UserId:        "user-123",
				BillReminders: false,
			}, nil)

		rt := &pfinancev1.RecurringTransaction{
			Id:          "rt-1",
			Description: "Netflix",
		}
		trigger.BillReminder(testContext("user-123"), "user-123", rt)
	})

	t.Run("skips when bill reminder duplicate exists", func(t *testing.T) {
		mockStore.EXPECT().
			GetNotificationPreferences(gomock.Any(), "user-123").
			Return(&pfinancev1.NotificationPreferences{
				UserId:        "user-123",
				BillReminders: true,
			}, nil)
		mockStore.EXPECT().
			HasNotification(gomock.Any(), "user-123",
				pfinancev1.NotificationType_NOTIFICATION_TYPE_BILL_REMINDER,
				"rt-1", "", "", 720).
			Return(true, nil)
		// No CreateNotification expected

		rt := &pfinancev1.RecurringTransaction{
			Id:          "rt-1",
			Description: "Netflix",
		}
		trigger.BillReminder(testContext("user-123"), "user-123", rt)
	})
}

func TestNotificationTrigger_GroupExpenseAdded(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	trigger := NewNotificationTrigger(mockStore)

	t.Run("notifies all members except actor", func(t *testing.T) {
		group := &pfinancev1.FinanceGroup{
			Id:        "group-1",
			Name:      "Household",
			MemberIds: []string{"user-1", "user-2", "user-3"},
			Members: []*pfinancev1.GroupMember{
				{UserId: "user-1", DisplayName: "Alice"},
				{UserId: "user-2", DisplayName: "Bob"},
				{UserId: "user-3", DisplayName: "Charlie"},
			},
		}
		expense := &pfinancev1.Expense{
			Id:          "expense-1",
			Description: "Groceries",
			AmountCents: 5000,
		}

		// Expect notifications for user-2 and user-3 (not user-1 = actor)
		mockStore.EXPECT().
			CreateNotification(gomock.Any(), gomock.Any()).
			Return(nil).Times(2)

		trigger.GroupExpenseAdded(testContext("user-1"), "user-1", group, expense)
	})
}

func TestNotificationTrigger_GroupIncomeAdded(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	trigger := NewNotificationTrigger(mockStore)

	t.Run("notifies all members except actor", func(t *testing.T) {
		group := &pfinancev1.FinanceGroup{
			Id:        "group-1",
			Name:      "Household",
			MemberIds: []string{"user-1", "user-2"},
			Members: []*pfinancev1.GroupMember{
				{UserId: "user-1", DisplayName: "Alice"},
				{UserId: "user-2", DisplayName: "Bob"},
			},
		}
		income := &pfinancev1.Income{
			Id:          "income-1",
			Source:      "Salary",
			AmountCents: 500000,
		}

		// Only user-2 should get notified (user-1 is actor)
		mockStore.EXPECT().
			CreateNotification(gomock.Any(), gomock.Any()).
			Return(nil).Times(1)

		trigger.GroupIncomeAdded(testContext("user-1"), "user-1", group, income)
	})
}

func TestGenerateWeeklyDigest(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)
	mockStore.EXPECT().GetUser(gomock.Any(), gomock.Any()).Return(nil, fmt.Errorf("not found")).AnyTimes()

	t.Run("generates digest for opted-in user", func(t *testing.T) {
		mockStore.EXPECT().
			GetNotificationPreferences(gomock.Any(), "user-123").
			Return(&pfinancev1.NotificationPreferences{
				UserId:       "user-123",
				WeeklyDigest: true,
			}, nil)
		mockStore.EXPECT().
			ListExpenses(gomock.Any(), "user-123", "", gomock.Any(), gomock.Any(), int32(1000), "").
			Return([]*pfinancev1.Expense{
				{AmountCents: 5000, Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD},
				{AmountCents: 3000, Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION},
			}, "", nil)
		mockStore.EXPECT().
			ListIncomes(gomock.Any(), "user-123", "", gomock.Any(), gomock.Any(), int32(1000), "").
			Return([]*pfinancev1.Income{
				{AmountCents: 100000},
			}, "", nil)
		mockStore.EXPECT().
			ListBudgets(gomock.Any(), "user-123", "", false, int32(100), "").
			Return([]*pfinancev1.Budget{}, "", nil)
		mockStore.EXPECT().
			ListGoals(gomock.Any(), "user-123", "",
				pfinancev1.GoalStatus_GOAL_STATUS_ACTIVE,
				pfinancev1.GoalType_GOAL_TYPE_UNSPECIFIED,
				int32(100), "").
			Return([]*pfinancev1.FinancialGoal{}, "", nil)
		mockStore.EXPECT().
			ListRecurringTransactions(gomock.Any(), "user-123", "",
				pfinancev1.RecurringTransactionStatus_RECURRING_TRANSACTION_STATUS_ACTIVE,
				true, true, int32(100), "").
			Return([]*pfinancev1.RecurringTransaction{}, "", nil)
		mockStore.EXPECT().
			CreateNotification(gomock.Any(), gomock.Any()).
			Return(nil)

		ctx := testContext("user-123")
		resp, err := svc.GenerateWeeklyDigest(ctx, connect.NewRequest(&pfinancev1.GenerateWeeklyDigestRequest{
			UserId: "user-123",
		}))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if resp.Msg.DigestsSent != 1 {
			t.Errorf("expected 1 digest sent, got %d", resp.Msg.DigestsSent)
		}
	})

	t.Run("skips user without weekly digest enabled", func(t *testing.T) {
		mockStore.EXPECT().
			GetNotificationPreferences(gomock.Any(), "user-456").
			Return(&pfinancev1.NotificationPreferences{
				UserId:       "user-456",
				WeeklyDigest: false,
			}, nil)

		ctx := testContext("user-456")
		resp, err := svc.GenerateWeeklyDigest(ctx, connect.NewRequest(&pfinancev1.GenerateWeeklyDigestRequest{
			UserId: "user-456",
		}))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if resp.Msg.DigestsSent != 0 {
			t.Errorf("expected 0 digests sent, got %d", resp.Msg.DigestsSent)
		}
	})
}
