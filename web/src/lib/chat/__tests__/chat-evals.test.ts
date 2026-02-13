import { generateText, stepCountIs } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { createTools } from '../tools';
import { buildSystemPrompt } from '../system-prompt';
import type { BackendClient } from '../backend-client';
import {
  createMockClient,
  TEST_USER_ID,
  mockExpense,
  mockExpense2,
} from '../test-helpers';

// Helper to build a standard mock generate result for a tool call
function toolCallResult(toolName: string, input: Record<string, unknown>, toolCallId = 'tc-1') {
  return {
    content: [{
      type: 'tool-call' as const,
      toolCallId,
      toolName,
      input: JSON.stringify(input),
    }],
    finishReason: { unified: 'tool-calls' as const, raw: undefined },
    usage: {
      inputTokens: { total: 10, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 5, text: undefined, reasoning: undefined },
    },
    warnings: [] as never[],
  };
}

// Helper to build a standard mock generate result for text output
function textResult(text: string) {
  return {
    content: [{ type: 'text' as const, text }],
    finishReason: { unified: 'stop' as const, raw: undefined },
    usage: {
      inputTokens: { total: 50, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 20, text: undefined, reasoning: undefined },
    },
    warnings: [] as never[],
  };
}

describe('Chat Eval Tests - Integration with MockLanguageModelV3', () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let tools: ReturnType<typeof createTools>;
  const systemPrompt = buildSystemPrompt({
    userId: TEST_USER_ID,
    displayName: 'Test User',
    email: 'test@example.com',
    isPro: false,
  });

  beforeEach(() => {
    mockClient = createMockClient();
    tools = createTools(mockClient as unknown as BackendClient, TEST_USER_ID, false);
  });

  it('list expenses flow: model calls list_expenses and summarizes results', async () => {
    const callCount = { n: 0 };
    const responses = [
      toolCallResult('list_expenses', { startDate: '2025-01-01' }),
      textResult('Found 2 expenses totaling $21.49.'),
    ];

    const mockModel = new MockLanguageModelV3({
      doGenerate: async () => responses[callCount.n++],
    });

    const result = await generateText({
      model: mockModel,
      tools,
      system: systemPrompt,
      prompt: 'Show my expenses from January 2025',
      stopWhen: stepCountIs(5),
    });

    expect(mockClient.listExpenses).toHaveBeenCalledWith(
      expect.objectContaining({ userId: TEST_USER_ID })
    );
    expect(result.text).toContain('21.49');
    expect(mockModel.doGenerateCalls).toHaveLength(2);
  });

  it('search then delete flow with confirmation', async () => {
    const callCount = { n: 0 };
    const responses = [
      // Step 1: search for coffee
      toolCallResult('search_transactions', { query: 'coffee' }, 'tc-search'),
      // Step 2: delete with confirmed=false (preview)
      toolCallResult('delete_expense', { expenseId: 'exp-1', confirmed: false }, 'tc-del-preview'),
      // Step 3: delete with confirmed=true (execute)
      toolCallResult('delete_expense', { expenseId: 'exp-1', confirmed: true }, 'tc-del-exec'),
      // Step 4: summarize
      textResult('Deleted the coffee expense ($5.50).'),
    ];

    const mockModel = new MockLanguageModelV3({
      doGenerate: async () => responses[callCount.n++],
    });

    const result = await generateText({
      model: mockModel,
      tools,
      system: systemPrompt,
      prompt: 'Delete my coffee expense',
      stopWhen: stepCountIs(5),
    });

    expect(mockClient.searchTransactions).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'coffee' })
    );
    expect(mockClient.deleteExpense).toHaveBeenCalledWith({ expenseId: 'exp-1' });
    expect(result.text).toContain('Deleted');
    expect(mockModel.doGenerateCalls).toHaveLength(4);
  });

  it('budget progress flow: model calls get_budget_progress', async () => {
    const callCount = { n: 0 };
    const responses = [
      toolCallResult('get_budget_progress', {}),
      textResult('Your Food Budget: $250 of $500 spent (50%).'),
    ];

    const mockModel = new MockLanguageModelV3({
      doGenerate: async () => responses[callCount.n++],
    });

    const result = await generateText({
      model: mockModel,
      tools,
      system: systemPrompt,
      prompt: 'How are my budgets doing?',
      stopWhen: stepCountIs(5),
    });

    expect(mockClient.listBudgets).toHaveBeenCalledWith({ userId: TEST_USER_ID });
    expect(mockClient.getBudgetProgress).toHaveBeenCalledWith({ budgetId: 'bud-1' });
    expect(result.text).toContain('50%');
  });

  it('create expense with confirmation flow', async () => {
    const callCount = { n: 0 };
    const responses = [
      // Step 1: preview
      toolCallResult('create_expense', {
        description: 'Groceries',
        amount: 45.99,
        category: 'FOOD',
        confirmed: false,
      }, 'tc-create-preview'),
      // Step 2: confirm
      toolCallResult('create_expense', {
        description: 'Groceries',
        amount: 45.99,
        category: 'FOOD',
        confirmed: true,
      }, 'tc-create-exec'),
      // Step 3: summarize
      textResult('Created expense "Groceries" for $45.99.'),
    ];

    const mockModel = new MockLanguageModelV3({
      doGenerate: async () => responses[callCount.n++],
    });

    const result = await generateText({
      model: mockModel,
      tools,
      system: systemPrompt,
      prompt: 'Add a $45.99 groceries expense',
      stopWhen: stepCountIs(5),
    });

    // createExpense should only be called once (the confirmed=true step)
    expect(mockClient.createExpense).toHaveBeenCalledTimes(1);
    expect(mockClient.createExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Groceries',
        amountCents: BigInt(4599),
      })
    );
    expect(result.text).toContain('45.99');
  });

  it('update expense with diff preview', async () => {
    const callCount = { n: 0 };
    const responses = [
      // Step 1: search
      toolCallResult('search_transactions', { query: 'coffee' }, 'tc-search'),
      // Step 2: update preview
      toolCallResult('update_expense', {
        expenseId: 'exp-1',
        amount: 7.0,
        confirmed: false,
      }, 'tc-update-preview'),
      // Step 3: update confirm
      toolCallResult('update_expense', {
        expenseId: 'exp-1',
        amount: 7.0,
        confirmed: true,
      }, 'tc-update-exec'),
      // Step 4: summarize
      textResult('Updated coffee expense from $5.50 to $7.00.'),
    ];

    const mockModel = new MockLanguageModelV3({
      doGenerate: async () => responses[callCount.n++],
    });

    const result = await generateText({
      model: mockModel,
      tools,
      system: systemPrompt,
      prompt: 'Change my coffee expense to $7',
      stopWhen: stepCountIs(5),
    });

    expect(mockClient.searchTransactions).toHaveBeenCalled();
    expect(mockClient.getExpense).toHaveBeenCalledWith({ expenseId: 'exp-1' });
    expect(mockClient.updateExpense).toHaveBeenCalledTimes(1);
    expect(result.text).toContain('7.00');
  });

  it('batch delete flow with preview', async () => {
    mockClient.getExpense
      .mockResolvedValueOnce({ expense: mockExpense })   // batch preview item 1
      .mockResolvedValueOnce({ expense: mockExpense2 })   // batch preview item 2
      .mockResolvedValueOnce({ expense: mockExpense })   // batch confirm item 1
      .mockResolvedValueOnce({ expense: mockExpense2 });  // batch confirm item 2

    const callCount = { n: 0 };
    const responses = [
      // Step 1: search
      toolCallResult('search_transactions', { query: 'food' }, 'tc-search'),
      // Step 2: batch delete preview
      toolCallResult('delete_expenses_batch', {
        expenseIds: ['exp-1', 'exp-2'],
        confirmed: false,
      }, 'tc-batch-preview'),
      // Step 3: batch delete confirm
      toolCallResult('delete_expenses_batch', {
        expenseIds: ['exp-1', 'exp-2'],
        confirmed: true,
      }, 'tc-batch-exec'),
      // Step 4: summarize
      textResult('Deleted 2 expenses totaling $21.49.'),
    ];

    const mockModel = new MockLanguageModelV3({
      doGenerate: async () => responses[callCount.n++],
    });

    const result = await generateText({
      model: mockModel,
      tools,
      system: systemPrompt,
      prompt: 'Delete all food expenses',
      stopWhen: stepCountIs(5),
    });

    expect(mockClient.deleteExpense).toHaveBeenCalledTimes(2);
    expect(result.text).toContain('21.49');
  });

  it('error recovery: backend throws, model explains to user', async () => {
    mockClient.listExpenses.mockRejectedValue(new Error('Firestore unavailable'));

    const callCount = { n: 0 };
    const responses = [
      toolCallResult('list_expenses', {}),
      textResult('Sorry, I was unable to fetch your expenses. The service seems to be temporarily unavailable.'),
    ];

    const mockModel = new MockLanguageModelV3({
      doGenerate: async () => responses[callCount.n++],
    });

    const result = await generateText({
      model: mockModel,
      tools,
      system: systemPrompt,
      prompt: 'Show my expenses',
      stopWhen: stepCountIs(5),
    });

    // The tool returns { error: "..." } which the model then explains
    expect(result.text).toContain('unable');
    expect(mockModel.doGenerateCalls).toHaveLength(2);

    // The second call should include tool result with error in the prompt
    const secondCall = mockModel.doGenerateCalls[1];
    const toolResultMsg = secondCall.prompt.find(
      (m: any) => m.role === 'tool' || (m.content && Array.isArray(m.content) && m.content.some((c: any) => c.type === 'tool-result'))
    );
    expect(toolResultMsg).toBeDefined();
  });

  it('system prompt includes user context', async () => {
    const mockModel = new MockLanguageModelV3({
      doGenerate: async () => textResult('Hello Test User! How can I help with your finances?'),
    });

    await generateText({
      model: mockModel,
      tools,
      system: systemPrompt,
      prompt: 'Hello',
      stopWhen: stepCountIs(1),
    });

    // Verify the system prompt was passed with user context
    const firstCall = mockModel.doGenerateCalls[0];
    const systemMsg = firstCall.prompt.find((m: any) => m.role === 'system');
    expect(systemMsg).toBeDefined();
    expect((systemMsg as any).content).toContain('Test User');
    expect((systemMsg as any).content).toContain(TEST_USER_ID);
    expect((systemMsg as any).content).toContain('test@example.com');
    expect((systemMsg as any).content).toContain('Free');
  });

  it('pro tools available when isPro=true', async () => {
    const proTools = createTools(mockClient as unknown as BackendClient, TEST_USER_ID, true);

    const callCount = { n: 0 };
    const responses = [
      toolCallResult('get_category_comparison', {}),
      textResult('Food spending is up 20% compared to last month.'),
    ];

    const mockModel = new MockLanguageModelV3({
      doGenerate: async () => responses[callCount.n++],
    });

    const result = await generateText({
      model: mockModel,
      tools: proTools,
      system: buildSystemPrompt({
        userId: TEST_USER_ID,
        displayName: 'Pro User',
        isPro: true,
      }),
      prompt: 'Compare my spending by category',
      stopWhen: stepCountIs(5),
    });

    expect(mockClient.getCategoryComparison).toHaveBeenCalledWith(
      expect.objectContaining({ userId: TEST_USER_ID, currentPeriod: 'month' })
    );
    expect(result.text).toContain('20%');
  });

  it('income operations: list and delete flows', async () => {
    const callCount = { n: 0 };
    const responses = [
      // Step 1: list incomes
      toolCallResult('list_incomes', {}, 'tc-list'),
      // Step 2: delete preview
      toolCallResult('delete_income', { incomeId: 'inc-1', confirmed: false }, 'tc-del-preview'),
      // Step 3: delete confirm
      toolCallResult('delete_income', { incomeId: 'inc-1', confirmed: true }, 'tc-del-exec'),
      // Step 4: summarize
      textResult('Deleted the Salary income entry ($5,000.00).'),
    ];

    const mockModel = new MockLanguageModelV3({
      doGenerate: async () => responses[callCount.n++],
    });

    const result = await generateText({
      model: mockModel,
      tools,
      system: systemPrompt,
      prompt: 'Delete my salary income',
      stopWhen: stepCountIs(5),
    });

    expect(mockClient.listIncomes).toHaveBeenCalledWith(
      expect.objectContaining({ userId: TEST_USER_ID })
    );
    expect(mockClient.deleteIncome).toHaveBeenCalledWith({ incomeId: 'inc-1' });
    expect(result.text).toContain('Deleted');
    expect(mockModel.doGenerateCalls).toHaveLength(4);
  });
});
