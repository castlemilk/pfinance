import { createTools } from '../tools';
import type { BackendClient } from '../backend-client';
import {
  createMockClient,
  TEST_USER_ID,
  mockExpense,
  mockExpense2,
  mockSearchResult,
  mockInsight,
  mockBudget,
  mockBudgetProgress,
  mockIncome,
  mockGoal,
  mockGoalProgress,
  mockCategoryComparison,
  mockAnomaly,
} from '../test-helpers';

// Stub ToolExecutionOptions — tools don't use it, but execute signature requires it
const execOpts = {} as any;

describe('Chat Tools - Unit Tests', () => {
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  // =========================================================================
  // Read-only tools
  // =========================================================================

  describe('list_expenses', () => {
    it('returns formatted expenses with dollar amounts', async () => {
      const tools = createTools(mockClient as unknown as BackendClient, TEST_USER_ID, false);
      const result = await tools.list_expenses.execute!({ startDate: '2025-01-01' }, execOpts);

      expect(mockClient.listExpenses).toHaveBeenCalledWith(
        expect.objectContaining({ userId: TEST_USER_ID, pageSize: 20 })
      );
      expect(result).toHaveProperty('expenses');
      const { expenses } = result as any;
      expect(expenses).toHaveLength(2);
      expect(expenses[0].amount).toBe(5.5); // 550 cents → $5.50
      expect(expenses[0].description).toBe('Coffee at Starbucks');
      expect(expenses[0].category).toBe('FOOD');
      expect(expenses[1].amount).toBe(15.99); // 1599 cents → $15.99
    });

    it('passes startDate and endDate as timestamps', async () => {
      const tools = createTools(mockClient as unknown as BackendClient, TEST_USER_ID, false);
      await tools.list_expenses.execute!({ startDate: '2025-01-01', endDate: '2025-01-31' }, execOpts);

      const call = mockClient.listExpenses.mock.calls[0][0];
      expect(call.startDate).toBeDefined();
      expect(call.endDate).toBeDefined();
    });

    it('respects pageSize with max 50 cap', async () => {
      const tools = createTools(mockClient as unknown as BackendClient, TEST_USER_ID, false);
      await tools.list_expenses.execute!({ pageSize: 100 }, execOpts);

      expect(mockClient.listExpenses).toHaveBeenCalledWith(
        expect.objectContaining({ pageSize: 50 })
      );
    });

    it('returns hasMore when nextPageToken is present', async () => {
      mockClient.listExpenses.mockResolvedValue({
        expenses: [mockExpense],
        nextPageToken: 'abc123',
      });
      const tools = createTools(mockClient as unknown as BackendClient, TEST_USER_ID, false);
      const result = await tools.list_expenses.execute!({}, execOpts) as any;

      expect(result.hasMore).toBe(true);
    });

    it('returns error object on client failure', async () => {
      mockClient.listExpenses.mockRejectedValue(new Error('Network error'));
      const tools = createTools(mockClient as unknown as BackendClient, TEST_USER_ID, false);
      const result = await tools.list_expenses.execute!({}, execOpts) as any;

      expect(result.error).toContain('Network error');
    });
  });

  describe('search_transactions', () => {
    it('maps results with type label', async () => {
      const tools = createTools(mockClient as unknown as BackendClient, TEST_USER_ID, false);
      const result = await tools.search_transactions.execute!({ query: 'coffee' }, execOpts) as any;

      expect(mockClient.searchTransactions).toHaveBeenCalledWith(
        expect.objectContaining({ userId: TEST_USER_ID, query: 'coffee', pageSize: 20 })
      );
      expect(result.results).toHaveLength(1);
      expect(result.results[0].type).toBe('expense');
      expect(result.results[0].amount).toBe(5.5);
    });

    it('maps income type correctly', async () => {
      mockClient.searchTransactions.mockResolvedValue({
        results: [{ ...mockSearchResult, type: 2 }],
      });
      const tools = createTools(mockClient as unknown as BackendClient, TEST_USER_ID, false);
      const result = await tools.search_transactions.execute!({ query: 'salary' }, execOpts) as any;

      expect(result.results[0].type).toBe('income');
    });

    it('returns error on failure', async () => {
      mockClient.searchTransactions.mockRejectedValue(new Error('Search failed'));
      const tools = createTools(mockClient as unknown as BackendClient, TEST_USER_ID, false);
      const result = await tools.search_transactions.execute!({ query: 'x' }, execOpts) as any;

      expect(result.error).toContain('Search failed');
    });
  });

  describe('get_spending_summary', () => {
    it('maps insights with changePercent', async () => {
      const tools = createTools(mockClient as unknown as BackendClient, TEST_USER_ID, false);
      const result = await tools.get_spending_summary.execute!({ period: 'month' }, execOpts) as any;

      expect(mockClient.getSpendingInsights).toHaveBeenCalledWith(
        expect.objectContaining({ userId: TEST_USER_ID, period: 'month' })
      );
      expect(result.insights).toHaveLength(1);
      expect(result.insights[0].amount).toBe(250); // 25000 cents → $250
      expect(result.insights[0].percentageChange).toBe(10.5);
      expect(result.insights[0].category).toBe('FOOD');
    });

    it('defaults period to month when not specified', async () => {
      const tools = createTools(mockClient as unknown as BackendClient, TEST_USER_ID, false);
      await tools.get_spending_summary.execute!({}, execOpts);

      expect(mockClient.getSpendingInsights).toHaveBeenCalledWith(
        expect.objectContaining({ period: 'month' })
      );
    });
  });

  describe('get_budget_progress', () => {
    it('fetches budgets with progress', async () => {
      const tools = createTools(mockClient as unknown as BackendClient, TEST_USER_ID, false);
      const result = await tools.get_budget_progress.execute!({}, execOpts) as any;

      expect(mockClient.listBudgets).toHaveBeenCalledWith({ userId: TEST_USER_ID });
      expect(mockClient.getBudgetProgress).toHaveBeenCalledWith({ budgetId: 'bud-1' });
      expect(result.budgets).toHaveLength(1);
      expect(result.budgets[0].name).toBe('Food Budget');
      expect(result.budgets[0].limit).toBe(500); // 50000 cents → $500
      expect(result.budgets[0].spent).toBe(250); // 25000 cents → $250
      expect(result.budgets[0].percentage).toBe(50);
    });

    it('handles progress fetch failure gracefully', async () => {
      mockClient.getBudgetProgress.mockRejectedValue(new Error('Not found'));
      const tools = createTools(mockClient as unknown as BackendClient, TEST_USER_ID, false);
      const result = await tools.get_budget_progress.execute!({}, execOpts) as any;

      expect(result.budgets).toHaveLength(1);
      expect(result.budgets[0].spent).toBe(0);
      expect(result.budgets[0].percentage).toBe(0);
    });
  });

  describe('list_incomes', () => {
    it('returns formatted incomes', async () => {
      const tools = createTools(mockClient as unknown as BackendClient, TEST_USER_ID, false);
      const result = await tools.list_incomes.execute!({}, execOpts) as any;

      expect(mockClient.listIncomes).toHaveBeenCalledWith(
        expect.objectContaining({ userId: TEST_USER_ID, pageSize: 20 })
      );
      expect(result.incomes).toHaveLength(1);
      expect(result.incomes[0].source).toBe('Salary');
      expect(result.incomes[0].amount).toBe(5000); // 500000 cents → $5000
    });
  });

  describe('list_goals', () => {
    it('fetches goals with progress', async () => {
      const tools = createTools(mockClient as unknown as BackendClient, TEST_USER_ID, false);
      const result = await tools.list_goals.execute!({}, execOpts) as any;

      expect(mockClient.listGoals).toHaveBeenCalled();
      expect(mockClient.getGoalProgress).toHaveBeenCalledWith({ goalId: 'goal-1' });
      expect(result.goals).toHaveLength(1);
      expect(result.goals[0].name).toBe('Emergency Fund');
      expect(result.goals[0].target).toBe(10000);
      expect(result.goals[0].current).toBe(3000);
      expect(result.goals[0].percentage).toBe(30);
      expect(result.goals[0].onTrack).toBe(true);
    });

    it('handles goal progress fetch failure', async () => {
      mockClient.getGoalProgress.mockRejectedValue(new Error('Not found'));
      const tools = createTools(mockClient as unknown as BackendClient, TEST_USER_ID, false);
      const result = await tools.list_goals.execute!({}, execOpts) as any;

      expect(result.goals[0].current).toBe(0);
      expect(result.goals[0].percentage).toBe(0);
    });
  });

  // =========================================================================
  // Mutation tools — confirmation flow
  // =========================================================================

  describe('create_expense', () => {
    it('returns pending_confirmation when confirmed=false', async () => {
      const tools = createTools(mockClient as unknown as BackendClient, TEST_USER_ID, false);
      const result = await tools.create_expense.execute!(
        { description: 'Lunch', amount: 12.5, category: 'FOOD', confirmed: false },
        execOpts
      ) as any;

      expect(result.status).toBe('pending_confirmation');
      expect(result.action).toBe('create_expense');
      expect(result.details.description).toBe('Lunch');
      expect(result.details.amount).toBe(12.5);
      expect(result.message).toContain('$12.50');
      // Client should NOT have been called
      expect(mockClient.createExpense).not.toHaveBeenCalled();
    });

    it('calls createExpense with correct BigInt cents when confirmed=true', async () => {
      const tools = createTools(mockClient as unknown as BackendClient, TEST_USER_ID, false);
      await tools.create_expense.execute!(
        { description: 'Lunch', amount: 12.5, category: 'FOOD', confirmed: true },
        execOpts
      );

      expect(mockClient.createExpense).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: TEST_USER_ID,
          description: 'Lunch',
          amount: 12.5,
          amountCents: BigInt(1250),
          tags: [],
        })
      );
    });

    it('returns success with formatted expense', async () => {
      const tools = createTools(mockClient as unknown as BackendClient, TEST_USER_ID, false);
      const result = await tools.create_expense.execute!(
        { description: 'Lunch', amount: 12.5, category: 'FOOD', confirmed: true },
        execOpts
      ) as any;

      expect(result.status).toBe('success');
      expect(result.message).toContain('Lunch');
    });

    it('returns error on client failure', async () => {
      mockClient.createExpense.mockRejectedValue(new Error('Create failed'));
      const tools = createTools(mockClient as unknown as BackendClient, TEST_USER_ID, false);
      const result = await tools.create_expense.execute!(
        { description: 'Lunch', amount: 12.5, category: 'FOOD', confirmed: true },
        execOpts
      ) as any;

      expect(result.status).toBe('error');
      expect(result.error).toContain('Create failed');
    });
  });

  describe('update_expense', () => {
    it('returns pending_confirmation with diff when confirmed=false', async () => {
      const tools = createTools(mockClient as unknown as BackendClient, TEST_USER_ID, false);
      const result = await tools.update_expense.execute!(
        { expenseId: 'exp-1', description: 'Updated Coffee', amount: 6.0, confirmed: false },
        execOpts
      ) as any;

      expect(result.status).toBe('pending_confirmation');
      expect(result.changes.description.from).toBe('Coffee at Starbucks');
      expect(result.changes.description.to).toBe('Updated Coffee');
      expect(result.changes.amount.from).toBe(5.5);
      expect(result.changes.amount.to).toBe(6.0);
      expect(mockClient.updateExpense).not.toHaveBeenCalled();
    });

    it('calls updateExpense when confirmed=true', async () => {
      const tools = createTools(mockClient as unknown as BackendClient, TEST_USER_ID, false);
      await tools.update_expense.execute!(
        { expenseId: 'exp-1', description: 'Updated Coffee', confirmed: true },
        execOpts
      );

      expect(mockClient.updateExpense).toHaveBeenCalledWith(
        expect.objectContaining({
          expenseId: 'exp-1',
          description: 'Updated Coffee',
        })
      );
    });

    it('returns error when expense not found', async () => {
      mockClient.getExpense.mockResolvedValue({ expense: null });
      const tools = createTools(mockClient as unknown as BackendClient, TEST_USER_ID, false);
      const result = await tools.update_expense.execute!(
        { expenseId: 'nonexistent', confirmed: false },
        execOpts
      ) as any;

      expect(result.status).toBe('error');
      expect(result.error).toContain('not found');
    });
  });

  describe('delete_expense', () => {
    it('returns pending_confirmation with expense preview when confirmed=false', async () => {
      const tools = createTools(mockClient as unknown as BackendClient, TEST_USER_ID, false);
      const result = await tools.delete_expense.execute!(
        { expenseId: 'exp-1', confirmed: false },
        execOpts
      ) as any;

      expect(result.status).toBe('pending_confirmation');
      expect(result.expense.description).toBe('Coffee at Starbucks');
      expect(result.message).toContain('$5.50');
      expect(mockClient.deleteExpense).not.toHaveBeenCalled();
    });

    it('calls deleteExpense when confirmed=true', async () => {
      const tools = createTools(mockClient as unknown as BackendClient, TEST_USER_ID, false);
      const result = await tools.delete_expense.execute!(
        { expenseId: 'exp-1', confirmed: true },
        execOpts
      ) as any;

      expect(result.status).toBe('success');
      expect(mockClient.deleteExpense).toHaveBeenCalledWith({ expenseId: 'exp-1' });
    });
  });

  describe('delete_expenses_batch', () => {
    it('returns pending_confirmation with total amount when confirmed=false', async () => {
      // getExpense will be called for each ID
      mockClient.getExpense
        .mockResolvedValueOnce({ expense: mockExpense })
        .mockResolvedValueOnce({ expense: mockExpense2 });

      const tools = createTools(mockClient as unknown as BackendClient, TEST_USER_ID, false);
      const result = await tools.delete_expenses_batch.execute!(
        { expenseIds: ['exp-1', 'exp-2'], confirmed: false },
        execOpts
      ) as any;

      expect(result.status).toBe('pending_confirmation');
      expect(result.count).toBe(2);
      expect(result.totalAmount).toBeCloseTo(21.49, 1); // 5.50 + 15.99
    });

    it('deletes all and reports errors when confirmed=true', async () => {
      mockClient.getExpense
        .mockResolvedValueOnce({ expense: mockExpense })
        .mockResolvedValueOnce({ expense: mockExpense2 });
      mockClient.deleteExpense
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('Delete failed'));

      const tools = createTools(mockClient as unknown as BackendClient, TEST_USER_ID, false);
      const result = await tools.delete_expenses_batch.execute!(
        { expenseIds: ['exp-1', 'exp-2'], confirmed: true },
        execOpts
      ) as any;

      expect(result.status).toBe('success');
      expect(result.deleted).toBe(1);
      expect(result.errors).toHaveLength(1);
    });

    it('returns error when no valid expenses found', async () => {
      mockClient.getExpense.mockRejectedValue(new Error('Not found'));

      const tools = createTools(mockClient as unknown as BackendClient, TEST_USER_ID, false);
      const result = await tools.delete_expenses_batch.execute!(
        { expenseIds: ['bad-1'], confirmed: false },
        execOpts
      ) as any;

      expect(result.status).toBe('error');
      expect(result.error).toContain('No valid expenses');
    });
  });

  describe('update_income', () => {
    it('returns pending_confirmation with changes when confirmed=false', async () => {
      const tools = createTools(mockClient as unknown as BackendClient, TEST_USER_ID, false);
      const result = await tools.update_income.execute!(
        { incomeId: 'inc-1', source: 'New Job', amount: 6000, confirmed: false },
        execOpts
      ) as any;

      expect(result.status).toBe('pending_confirmation');
      expect(result.changes.source.from).toBe('Salary');
      expect(result.changes.source.to).toBe('New Job');
      expect(result.changes.amount.from).toBe(5000);
      expect(result.changes.amount.to).toBe(6000);
    });

    it('calls updateIncome when confirmed=true', async () => {
      const tools = createTools(mockClient as unknown as BackendClient, TEST_USER_ID, false);
      await tools.update_income.execute!(
        { incomeId: 'inc-1', amount: 6000, confirmed: true },
        execOpts
      );

      expect(mockClient.updateIncome).toHaveBeenCalledWith(
        expect.objectContaining({
          incomeId: 'inc-1',
          amountCents: BigInt(600000),
        })
      );
    });
  });

  describe('delete_income', () => {
    it('returns pending_confirmation with income preview when confirmed=false', async () => {
      const tools = createTools(mockClient as unknown as BackendClient, TEST_USER_ID, false);
      const result = await tools.delete_income.execute!(
        { incomeId: 'inc-1', confirmed: false },
        execOpts
      ) as any;

      expect(result.status).toBe('pending_confirmation');
      expect(result.income.source).toBe('Salary');
      expect(result.message).toContain('$5000.00');
    });

    it('calls deleteIncome when confirmed=true', async () => {
      const tools = createTools(mockClient as unknown as BackendClient, TEST_USER_ID, false);
      const result = await tools.delete_income.execute!(
        { incomeId: 'inc-1', confirmed: true },
        execOpts
      ) as any;

      expect(result.status).toBe('success');
      expect(mockClient.deleteIncome).toHaveBeenCalledWith({ incomeId: 'inc-1' });
    });

    it('returns error when income not found', async () => {
      mockClient.getIncome.mockResolvedValue({ income: null });
      const tools = createTools(mockClient as unknown as BackendClient, TEST_USER_ID, false);
      const result = await tools.delete_income.execute!(
        { incomeId: 'nonexistent', confirmed: false },
        execOpts
      ) as any;

      expect(result.status).toBe('error');
      expect(result.error).toContain('not found');
    });
  });

  // =========================================================================
  // Pro tools gating
  // =========================================================================

  describe('Pro tool gating', () => {
    it('does not include pro tools when isPro=false', () => {
      const tools = createTools(mockClient as unknown as BackendClient, TEST_USER_ID, false);
      expect(tools.get_category_comparison).toBeUndefined();
      expect(tools.detect_anomalies).toBeUndefined();
    });

    it('includes pro tools when isPro=true', () => {
      const tools = createTools(mockClient as unknown as BackendClient, TEST_USER_ID, true);
      expect(tools.get_category_comparison).toBeDefined();
      expect(tools.detect_anomalies).toBeDefined();
    });

    it('get_category_comparison returns formatted comparisons', async () => {
      const tools = createTools(mockClient as unknown as BackendClient, TEST_USER_ID, true);
      const result = await tools.get_category_comparison.execute!({}, execOpts) as any;

      expect(mockClient.getCategoryComparison).toHaveBeenCalledWith(
        expect.objectContaining({ userId: TEST_USER_ID, currentPeriod: 'month' })
      );
      expect(result.comparisons).toHaveLength(1);
      expect(result.comparisons[0].currentAmount).toBe(300);
      expect(result.comparisons[0].previousAmount).toBe(250);
      expect(result.comparisons[0].changePercent).toBe(20);
    });

    it('detect_anomalies returns formatted anomalies', async () => {
      const tools = createTools(mockClient as unknown as BackendClient, TEST_USER_ID, true);
      const result = await tools.detect_anomalies.execute!({ lookbackDays: 30 }, execOpts) as any;

      expect(mockClient.detectAnomalies).toHaveBeenCalledWith(
        expect.objectContaining({ userId: TEST_USER_ID, lookbackDays: 30 })
      );
      expect(result.anomalies).toHaveLength(1);
      expect(result.anomalies[0].amount).toBe(200);
      expect(result.anomalies[0].expectedAmount).toBe(50);
    });
  });

  // =========================================================================
  // BigInt conversion
  // =========================================================================

  describe('BigInt cents conversion', () => {
    it('converts amountCents to dollars correctly', async () => {
      mockClient.listExpenses.mockResolvedValue({
        expenses: [{
          ...mockExpense,
          amountCents: BigInt(1050), // $10.50
          amount: 0, // fallback should not be used
        }],
        nextPageToken: '',
      });

      const tools = createTools(mockClient as unknown as BackendClient, TEST_USER_ID, false);
      const result = await tools.list_expenses.execute!({}, execOpts) as any;

      expect(result.expenses[0].amount).toBe(10.5);
    });

    it('falls back to amount when amountCents is zero', async () => {
      mockClient.listExpenses.mockResolvedValue({
        expenses: [{
          ...mockExpense,
          amountCents: BigInt(0),
          amount: 7.25,
        }],
        nextPageToken: '',
      });

      const tools = createTools(mockClient as unknown as BackendClient, TEST_USER_ID, false);
      const result = await tools.list_expenses.execute!({}, execOpts) as any;

      expect(result.expenses[0].amount).toBe(7.25);
    });
  });
});
