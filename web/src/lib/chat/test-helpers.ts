import type { BackendClient } from './backend-client';

// Fixed timestamp for 2025-01-01T00:00:00Z
const JAN_1_2025_SECONDS = BigInt(1735689600);

export const mockExpense = {
  id: 'exp-1',
  description: 'Coffee at Starbucks',
  amount: 5.5,
  amountCents: BigInt(550),
  category: 1, // FOOD
  frequency: 1, // ONCE
  date: { seconds: JAN_1_2025_SECONDS, nanos: 0 },
  tags: ['food', 'coffee'],
  userId: 'user-123',
  paidByUserId: '',
  splitType: 0,
  allocatedUserIds: [],
  allocations: [],
};

export const mockExpense2 = {
  id: 'exp-2',
  description: 'Netflix Subscription',
  amount: 15.99,
  amountCents: BigInt(1599),
  category: 4, // ENTERTAINMENT
  frequency: 5, // MONTHLY
  date: { seconds: JAN_1_2025_SECONDS, nanos: 0 },
  tags: ['subscription'],
  userId: 'user-123',
  paidByUserId: '',
  splitType: 0,
  allocatedUserIds: [],
  allocations: [],
};

export const mockIncome = {
  id: 'inc-1',
  source: 'Salary',
  amount: 5000,
  amountCents: BigInt(500000),
  frequency: 5, // MONTHLY
  taxStatus: 1,
  date: { seconds: JAN_1_2025_SECONDS, nanos: 0 },
  userId: 'user-123',
  deductions: [],
};

export const mockBudget = {
  id: 'bud-1',
  name: 'Food Budget',
  description: 'Monthly food spending limit',
  amount: 500,
  amountCents: BigInt(50000),
  period: 'MONTHLY',
  categoryIds: [1],
  isActive: true,
  userId: 'user-123',
};

export const mockBudgetProgress = {
  progress: {
    budgetId: 'bud-1',
    spentAmount: 250,
    spentAmountCents: BigInt(25000),
    percentageUsed: 50,
    remainingAmount: 250,
    remainingAmountCents: BigInt(25000),
  },
};

export const mockGoal = {
  id: 'goal-1',
  name: 'Emergency Fund',
  description: 'Build 3 months of expenses',
  goalType: 1, // SAVINGS
  targetAmount: 10000,
  targetAmountCents: BigInt(1000000),
  currentAmount: 0,
  currentAmountCents: BigInt(0),
  status: 1, // ACTIVE
  userId: 'user-123',
};

export const mockGoalProgress = {
  progress: {
    goalId: 'goal-1',
    currentAmount: 3000,
    currentAmountCents: BigInt(300000),
    percentageComplete: 30,
    onTrack: true,
    projectedCompletion: '',
  },
};

export const mockSearchResult = {
  id: 'exp-1',
  type: 1, // expense
  description: 'Coffee at Starbucks',
  category: 'FOOD',
  amount: 5.5,
  amountCents: BigInt(550),
  date: { seconds: JAN_1_2025_SECONDS, nanos: 0 },
};

export const mockInsight = {
  type: 'category_breakdown',
  title: 'Top Category',
  description: 'Food is your highest spending category',
  amount: 250,
  amountCents: BigInt(25000),
  changePercent: 10.5,
  category: 'FOOD',
};

export const mockCategoryComparison = {
  category: 1, // FOOD
  currentAmount: 300,
  currentAmountCents: BigInt(30000),
  previousAmount: 250,
  previousAmountCents: BigInt(25000),
  changePercent: 20,
};

export const mockAnomaly = {
  anomalyType: 'unusual_spike',
  severity: 'high',
  description: 'Spending spike in Entertainment',
  amount: 200,
  amountCents: BigInt(20000),
  expectedAmount: 50,
  expectedAmountCents: BigInt(5000),
  date: { seconds: JAN_1_2025_SECONDS, nanos: 0 },
};

/**
 * Creates a mock BackendClient with jest.fn() stubs for all methods used by tools.
 * Each method returns sensible defaults. Override specific methods after creation.
 * Uses Record<string, jest.Mock> for simplicity — protobuf message types don't
 * need to match exactly in tests since tools only read plain fields.
 */
export function createMockClient(): Record<string, jest.Mock> {
  return {
    listExpenses: jest.fn().mockResolvedValue({
      expenses: [mockExpense, mockExpense2],
      nextPageToken: '',
    }),
    searchTransactions: jest.fn().mockResolvedValue({
      results: [mockSearchResult],
    }),
    getSpendingInsights: jest.fn().mockResolvedValue({
      insights: [mockInsight],
    }),
    listBudgets: jest.fn().mockResolvedValue({
      budgets: [mockBudget],
    }),
    getBudgetProgress: jest.fn().mockResolvedValue(mockBudgetProgress),
    listIncomes: jest.fn().mockResolvedValue({
      incomes: [mockIncome],
      nextPageToken: '',
    }),
    listGoals: jest.fn().mockResolvedValue({
      goals: [mockGoal],
    }),
    getGoalProgress: jest.fn().mockResolvedValue(mockGoalProgress),
    createExpense: jest.fn().mockResolvedValue({
      expense: mockExpense,
    }),
    getExpense: jest.fn().mockResolvedValue({
      expense: mockExpense,
    }),
    updateExpense: jest.fn().mockResolvedValue({
      expense: { ...mockExpense, description: 'Updated Coffee' },
    }),
    deleteExpense: jest.fn().mockResolvedValue({}),
    getIncome: jest.fn().mockResolvedValue({
      income: mockIncome,
    }),
    updateIncome: jest.fn().mockResolvedValue({
      income: { ...mockIncome, source: 'Updated Salary' },
    }),
    deleteIncome: jest.fn().mockResolvedValue({}),
    getCategoryComparison: jest.fn().mockResolvedValue({
      categories: [mockCategoryComparison],
    }),
    detectAnomalies: jest.fn().mockResolvedValue({
      anomalies: [mockAnomaly],
    }),
  } as any;
}

export const TEST_USER_ID = 'user-123';
