import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { timestampFromDate, timestampDate } from '@bufbuild/protobuf/wkt';
import { ExpenseCategory, ExpenseFrequency, GoalStatus } from '@/gen/pfinance/v1/types_pb';
import type { BackendClient } from './backend-client';

// Helper to convert cents to dollars
function centsToDollars(cents: bigint | number): number {
  return Number(cents) / 100;
}

// Helper to format an expense for display
function formatExpense(e: {
  id: string;
  description: string;
  amount: number;
  amountCents: bigint;
  category: number;
  date?: { seconds: bigint; nanos: number };
  tags: string[];
}) {
  const amount = Number(e.amountCents) !== 0 ? centsToDollars(e.amountCents) : e.amount;
  const categoryName = ExpenseCategory[e.category] || 'UNKNOWN';
  const date = e.date ? timestampDate(e.date as Parameters<typeof timestampDate>[0]).toISOString().split('T')[0] : 'no date';
  return { id: e.id, description: e.description, amount, category: categoryName, date, tags: e.tags };
}

// Helper to format an income for display
function formatIncome(i: {
  id: string;
  source: string;
  amount: number;
  amountCents: bigint;
  frequency: number;
  date?: { seconds: bigint; nanos: number };
}) {
  const amount = Number(i.amountCents) !== 0 ? centsToDollars(i.amountCents) : i.amount;
  return {
    id: i.id,
    source: i.source,
    amount,
    frequency: ExpenseFrequency[i.frequency] || 'UNKNOWN',
    date: i.date ? timestampDate(i.date as Parameters<typeof timestampDate>[0]).toISOString().split('T')[0] : 'no date',
  };
}

const categoryEnum = z.enum(['FOOD', 'HOUSING', 'TRANSPORTATION', 'ENTERTAINMENT', 'HEALTHCARE', 'UTILITIES', 'SHOPPING', 'EDUCATION', 'TRAVEL', 'OTHER']);

function categoryFromString(s: string): ExpenseCategory {
  const map: Record<string, ExpenseCategory> = {
    FOOD: ExpenseCategory.FOOD,
    HOUSING: ExpenseCategory.HOUSING,
    TRANSPORTATION: ExpenseCategory.TRANSPORTATION,
    ENTERTAINMENT: ExpenseCategory.ENTERTAINMENT,
    HEALTHCARE: ExpenseCategory.HEALTHCARE,
    UTILITIES: ExpenseCategory.UTILITIES,
    SHOPPING: ExpenseCategory.SHOPPING,
    EDUCATION: ExpenseCategory.EDUCATION,
    TRAVEL: ExpenseCategory.TRAVEL,
    OTHER: ExpenseCategory.OTHER,
  };
  return map[s] || ExpenseCategory.UNSPECIFIED;
}

export function createTools(client: BackendClient, userId: string, isPro: boolean): ToolSet {
  const tools: ToolSet = {
    // --- Read-only tools ---

    list_expenses: tool({
      description: 'List expenses for the user, optionally filtered by date range. Returns up to 20 items. Use alongside get_spending_summary for comprehensive spending analysis.',
      inputSchema: z.object({
        startDate: z.string().optional().describe('ISO date string for range start (e.g. 2025-01-01)'),
        endDate: z.string().optional().describe('ISO date string for range end (e.g. 2025-01-31)'),
        pageSize: z.number().optional().describe('Number of results (default 20, max 50)'),
      }),
      execute: async (args) => {
        try {
          const res = await client.listExpenses({
            userId,
            startDate: args.startDate ? timestampFromDate(new Date(args.startDate)) : undefined,
            endDate: args.endDate ? timestampFromDate(new Date(args.endDate)) : undefined,
            pageSize: Math.min(args.pageSize || 20, 50),
          });
          const expenses = res.expenses.map(formatExpense);
          return { expenses, count: expenses.length, hasMore: !!res.nextPageToken };
        } catch (err: unknown) {
          return { error: String(err) };
        }
      },
    }),

    search_transactions: tool({
      description: 'Search expenses and incomes by text query (description, merchant name). Use this to find specific transactions before updating or deleting them.',
      inputSchema: z.object({
        query: z.string().describe('Search text (e.g. "coffee", "netflix", "bunnings")'),
        category: z.string().optional().describe('Optional category filter'),
        amountMin: z.number().optional().describe('Minimum amount in dollars'),
        amountMax: z.number().optional().describe('Maximum amount in dollars'),
      }),
      execute: async (args) => {
        try {
          const res = await client.searchTransactions({
            userId,
            query: args.query,
            category: args.category || '',
            amountMin: args.amountMin || 0,
            amountMax: args.amountMax || 0,
            pageSize: 20,
          });
          const results = res.results.map(r => ({
            id: r.id,
            type: r.type === 1 ? 'expense' : 'income',
            description: r.description,
            category: r.category,
            amount: Number(r.amountCents) !== 0 ? centsToDollars(r.amountCents) : r.amount,
            date: r.date ? timestampDate(r.date as Parameters<typeof timestampDate>[0]).toISOString().split('T')[0] : 'no date',
          }));
          return { results, count: results.length };
        } catch (err: unknown) {
          return { error: String(err) };
        }
      },
    }),

    get_spending_summary: tool({
      description: 'Get spending insights with category breakdowns and totals for a given period. Call this proactively for any question about spending patterns, top categories, or where money goes.',
      inputSchema: z.object({
        period: z.enum(['week', 'month', 'quarter', 'year']).optional().describe('Time period (default: month)'),
      }),
      execute: async (args) => {
        try {
          const res = await client.getSpendingInsights({
            userId,
            period: args.period || 'month',
          });
          const insights = res.insights.map(i => ({
            type: i.type,
            title: i.title,
            description: i.description,
            amount: Number(i.amountCents) !== 0 ? centsToDollars(i.amountCents) : i.amount,
            percentageChange: i.changePercent,
            category: i.category,
          }));
          return { insights };
        } catch (err: unknown) {
          return { error: String(err) };
        }
      },
    }),

    get_budget_progress: tool({
      description: 'Get all budgets with their spending progress.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const budgetsRes = await client.listBudgets({ userId });
          const budgets = [];
          for (const b of budgetsRes.budgets) {
            try {
              const progressRes = await client.getBudgetProgress({ budgetId: b.id });
              const prog = progressRes.progress;
              budgets.push({
                id: b.id,
                name: b.name,
                limit: Number(b.amountCents) !== 0 ? centsToDollars(b.amountCents) : b.amount,
                spent: prog ? (Number(prog.spentAmountCents) !== 0 ? centsToDollars(prog.spentAmountCents) : prog.spentAmount) : 0,
                percentage: prog?.percentageUsed || 0,
                period: b.period,
                isActive: b.isActive,
              });
            } catch {
              budgets.push({
                id: b.id,
                name: b.name,
                limit: Number(b.amountCents) !== 0 ? centsToDollars(b.amountCents) : b.amount,
                spent: 0,
                percentage: 0,
                period: b.period,
                isActive: b.isActive,
              });
            }
          }
          return { budgets, count: budgets.length };
        } catch (err: unknown) {
          return { error: String(err) };
        }
      },
    }),

    list_incomes: tool({
      description: 'List income entries for the user.',
      inputSchema: z.object({
        startDate: z.string().optional().describe('ISO date string for range start'),
        endDate: z.string().optional().describe('ISO date string for range end'),
      }),
      execute: async (args) => {
        try {
          const res = await client.listIncomes({
            userId,
            startDate: args.startDate ? timestampFromDate(new Date(args.startDate)) : undefined,
            endDate: args.endDate ? timestampFromDate(new Date(args.endDate)) : undefined,
            pageSize: 20,
          });
          const incomes = res.incomes.map(formatIncome);
          return { incomes, count: incomes.length };
        } catch (err: unknown) {
          return { error: String(err) };
        }
      },
    }),

    list_goals: tool({
      description: 'List financial goals with progress.',
      inputSchema: z.object({
        status: z.enum(['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED']).optional().describe('Filter by goal status'),
      }),
      execute: async (args) => {
        try {
          const statusMap: Record<string, GoalStatus> = {
            ACTIVE: GoalStatus.ACTIVE,
            PAUSED: GoalStatus.PAUSED,
            COMPLETED: GoalStatus.COMPLETED,
            CANCELLED: GoalStatus.CANCELLED,
          };
          const res = await client.listGoals({
            userId,
            status: args.status ? statusMap[args.status] : GoalStatus.UNSPECIFIED,
          });
          const goals = [];
          for (const g of res.goals) {
            try {
              const progressRes = await client.getGoalProgress({ goalId: g.id });
              const prog = progressRes.progress;
              goals.push({
                id: g.id,
                name: g.name,
                type: g.goalType,
                target: Number(g.targetAmountCents) !== 0 ? centsToDollars(g.targetAmountCents) : g.targetAmount,
                current: prog ? (Number(prog.currentAmountCents) !== 0 ? centsToDollars(prog.currentAmountCents) : prog.currentAmount) : 0,
                percentage: prog?.percentageComplete || 0,
                onTrack: prog?.onTrack ?? true,
                status: g.status,
              });
            } catch {
              goals.push({
                id: g.id,
                name: g.name,
                type: g.goalType,
                target: Number(g.targetAmountCents) !== 0 ? centsToDollars(g.targetAmountCents) : g.targetAmount,
                current: 0,
                percentage: 0,
                onTrack: true,
                status: g.status,
              });
            }
          }
          return { goals, count: goals.length };
        } catch (err: unknown) {
          return { error: String(err) };
        }
      },
    }),

    // --- Mutation tools (require confirmation) ---

    create_expense: tool({
      description: 'Create a new expense. Always confirm the details with the user first by calling with confirmed=false.',
      inputSchema: z.object({
        description: z.string().describe('Expense description'),
        amount: z.number().describe('Amount in dollars (e.g. 25.50)'),
        category: categoryEnum.describe('Expense category'),
        frequency: z.enum(['ONCE', 'DAILY', 'WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY']).optional().describe('Expense frequency (default: ONCE)'),
        date: z.string().optional().describe('ISO date string (default: today)'),
        tags: z.array(z.string()).optional().describe('Tags for the expense'),
        confirmed: z.boolean().describe('Set to false to preview, true to execute'),
      }),
      execute: async (args) => {
        const freqMap: Record<string, ExpenseFrequency> = {
          ONCE: ExpenseFrequency.ONCE,
          DAILY: ExpenseFrequency.DAILY,
          WEEKLY: ExpenseFrequency.WEEKLY,
          FORTNIGHTLY: ExpenseFrequency.FORTNIGHTLY,
          MONTHLY: ExpenseFrequency.MONTHLY,
          QUARTERLY: ExpenseFrequency.QUARTERLY,
          ANNUALLY: ExpenseFrequency.ANNUALLY,
        };

        if (!args.confirmed) {
          return {
            status: 'pending_confirmation' as const,
            action: 'create_expense',
            details: {
              description: args.description,
              amount: args.amount,
              category: args.category,
              frequency: args.frequency || 'ONCE',
              date: args.date || new Date().toISOString().split('T')[0],
              tags: args.tags || [],
            },
            message: `Create expense: "${args.description}" for $${args.amount.toFixed(2)} (${args.category})?`,
          };
        }

        try {
          const amountCents = BigInt(Math.round(args.amount * 100));
          const res = await client.createExpense({
            userId,
            description: args.description,
            amount: args.amount,
            amountCents,
            category: categoryFromString(args.category),
            frequency: freqMap[args.frequency || 'ONCE'] || ExpenseFrequency.ONCE,
            date: timestampFromDate(new Date(args.date || new Date().toISOString().split('T')[0])),
            tags: args.tags || [],
          });
          return { status: 'success', expense: res.expense ? formatExpense(res.expense) : null, message: `Created expense "${args.description}" for $${args.amount.toFixed(2)}` };
        } catch (err: unknown) {
          return { status: 'error', error: String(err) };
        }
      },
    }),

    update_expense: tool({
      description: 'Update an existing expense. Search for the expense first using search_transactions, then call with confirmed=false to preview changes, then confirmed=true to execute.',
      inputSchema: z.object({
        expenseId: z.string().describe('The expense ID to update'),
        description: z.string().optional().describe('New description'),
        amount: z.number().optional().describe('New amount in dollars'),
        category: categoryEnum.optional().describe('New category'),
        tags: z.array(z.string()).optional().describe('New tags (replaces existing)'),
        confirmed: z.boolean().describe('Set to false to preview, true to execute'),
      }),
      execute: async (args) => {
        try {
          const current = await client.getExpense({ expenseId: args.expenseId });
          if (!current.expense) return { status: 'error', error: 'Expense not found' };

          const exp = current.expense;
          const currentFormatted = formatExpense(exp);

          if (!args.confirmed) {
            const changes: Record<string, { from: unknown; to: unknown }> = {};
            if (args.description !== undefined) changes.description = { from: currentFormatted.description, to: args.description };
            if (args.amount !== undefined) changes.amount = { from: currentFormatted.amount, to: args.amount };
            if (args.category !== undefined) changes.category = { from: currentFormatted.category, to: args.category };
            if (args.tags !== undefined) changes.tags = { from: currentFormatted.tags, to: args.tags };
            return {
              status: 'pending_confirmation' as const,
              action: 'update_expense',
              current: currentFormatted,
              changes,
              message: `Update expense "${currentFormatted.description}"?`,
            };
          }

          const res = await client.updateExpense({
            expenseId: args.expenseId,
            description: args.description ?? exp.description,
            amount: args.amount ?? exp.amount,
            amountCents: args.amount !== undefined ? BigInt(Math.round(args.amount * 100)) : exp.amountCents,
            category: args.category ? categoryFromString(args.category) : exp.category,
            frequency: exp.frequency,
            paidByUserId: exp.paidByUserId,
            splitType: exp.splitType,
            allocatedUserIds: [],
            allocations: [],
            tags: args.tags ?? exp.tags,
          });
          return { status: 'success', expense: res.expense ? formatExpense(res.expense) : null, message: 'Expense updated successfully' };
        } catch (err: unknown) {
          return { status: 'error', error: String(err) };
        }
      },
    }),

    delete_expense: tool({
      description: 'Delete a single expense. Search first, then call with confirmed=false to preview, then confirmed=true to execute.',
      inputSchema: z.object({
        expenseId: z.string().describe('The expense ID to delete'),
        confirmed: z.boolean().describe('Set to false to preview, true to execute'),
      }),
      execute: async (args) => {
        try {
          const current = await client.getExpense({ expenseId: args.expenseId });
          if (!current.expense) return { status: 'error', error: 'Expense not found' };

          const exp = formatExpense(current.expense);

          if (!args.confirmed) {
            return {
              status: 'pending_confirmation' as const,
              action: 'delete_expense',
              expense: exp,
              message: `Delete expense "${exp.description}" ($${exp.amount.toFixed(2)}) from ${exp.date}?`,
            };
          }

          await client.deleteExpense({ expenseId: args.expenseId });
          return { status: 'success', message: `Deleted expense "${exp.description}"` };
        } catch (err: unknown) {
          return { status: 'error', error: String(err) };
        }
      },
    }),

    delete_expenses_batch: tool({
      description: 'Delete multiple expenses at once. Always search first, then call with confirmed=false to preview all affected records, then confirmed=true to execute.',
      inputSchema: z.object({
        expenseIds: z.array(z.string()).describe('Array of expense IDs to delete'),
        confirmed: z.boolean().describe('Set to false to preview, true to execute'),
      }),
      execute: async (args) => {
        try {
          const expenses = [];
          for (const id of args.expenseIds) {
            try {
              const res = await client.getExpense({ expenseId: id });
              if (res.expense) expenses.push(formatExpense(res.expense));
            } catch {
              // Skip not found
            }
          }

          if (expenses.length === 0) return { status: 'error', error: 'No valid expenses found' };

          if (!args.confirmed) {
            const total = expenses.reduce((sum, e) => sum + e.amount, 0);
            return {
              status: 'pending_confirmation' as const,
              action: 'delete_expenses_batch',
              expenses,
              count: expenses.length,
              totalAmount: total,
              message: `Delete ${expenses.length} expenses totaling $${total.toFixed(2)}?`,
            };
          }

          let deleted = 0;
          const errors: string[] = [];
          for (const id of args.expenseIds) {
            try {
              await client.deleteExpense({ expenseId: id });
              deleted++;
            } catch (err: unknown) {
              errors.push(`${id}: ${String(err)}`);
            }
          }
          return { status: 'success', deleted, errors: errors.length > 0 ? errors : undefined, message: `Deleted ${deleted} expense(s)` };
        } catch (err: unknown) {
          return { status: 'error', error: String(err) };
        }
      },
    }),

    update_income: tool({
      description: 'Update an existing income entry. Search first, then preview with confirmed=false.',
      inputSchema: z.object({
        incomeId: z.string().describe('The income ID to update'),
        source: z.string().optional().describe('New source name'),
        amount: z.number().optional().describe('New amount in dollars'),
        confirmed: z.boolean().describe('Set to false to preview, true to execute'),
      }),
      execute: async (args) => {
        try {
          const current = await client.getIncome({ incomeId: args.incomeId });
          if (!current.income) return { status: 'error', error: 'Income not found' };

          const inc = current.income;
          const currentFormatted = formatIncome(inc);

          if (!args.confirmed) {
            const changes: Record<string, { from: unknown; to: unknown }> = {};
            if (args.source !== undefined) changes.source = { from: currentFormatted.source, to: args.source };
            if (args.amount !== undefined) changes.amount = { from: currentFormatted.amount, to: args.amount };
            return {
              status: 'pending_confirmation' as const,
              action: 'update_income',
              current: currentFormatted,
              changes,
              message: `Update income "${currentFormatted.source}"?`,
            };
          }

          const res = await client.updateIncome({
            incomeId: args.incomeId,
            source: args.source ?? inc.source,
            amount: args.amount ?? inc.amount,
            amountCents: args.amount !== undefined ? BigInt(Math.round(args.amount * 100)) : inc.amountCents,
            frequency: inc.frequency,
            taxStatus: inc.taxStatus,
            deductions: [],
          });
          return { status: 'success', income: res.income ? formatIncome(res.income) : null, message: 'Income updated successfully' };
        } catch (err: unknown) {
          return { status: 'error', error: String(err) };
        }
      },
    }),

    delete_income: tool({
      description: 'Delete an income entry. Search first, then preview with confirmed=false.',
      inputSchema: z.object({
        incomeId: z.string().describe('The income ID to delete'),
        confirmed: z.boolean().describe('Set to false to preview, true to execute'),
      }),
      execute: async (args) => {
        try {
          const current = await client.getIncome({ incomeId: args.incomeId });
          if (!current.income) return { status: 'error', error: 'Income not found' };

          const inc = formatIncome(current.income);

          if (!args.confirmed) {
            return {
              status: 'pending_confirmation' as const,
              action: 'delete_income',
              income: inc,
              message: `Delete income "${inc.source}" ($${inc.amount.toFixed(2)})?`,
            };
          }

          await client.deleteIncome({ incomeId: args.incomeId });
          return { status: 'success', message: `Deleted income "${inc.source}"` };
        } catch (err: unknown) {
          return { status: 'error', error: String(err) };
        }
      },
    }),
  };

  // Pro-only tools
  if (isPro) {
    tools.get_category_comparison = tool({
      description: 'Compare spending by category between this month and last month. Pro feature.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const res = await client.getCategoryComparison({
            userId,
            currentPeriod: 'month',
          });
          const comparisons = res.categories.map((c: { category: number; currentAmount: number; currentAmountCents: bigint; previousAmount: number; previousAmountCents: bigint; changePercent: number }) => ({
            category: ExpenseCategory[c.category] || 'UNKNOWN',
            currentAmount: Number(c.currentAmountCents) !== 0 ? centsToDollars(c.currentAmountCents) : c.currentAmount,
            previousAmount: Number(c.previousAmountCents) !== 0 ? centsToDollars(c.previousAmountCents) : c.previousAmount,
            changePercent: c.changePercent,
          }));
          return { comparisons };
        } catch (err: unknown) {
          return { error: String(err) };
        }
      },
    });

    tools.detect_anomalies = tool({
      description: 'Detect unusual spending patterns. Pro feature.',
      inputSchema: z.object({
        lookbackDays: z.number().optional().describe('Number of days to analyze (default 90)'),
      }),
      execute: async (args) => {
        try {
          const res = await client.detectAnomalies({
            userId,
            lookbackDays: args.lookbackDays || 90,
          });
          const anomalies = res.anomalies.map(a => ({
            type: a.anomalyType,
            severity: a.severity,
            description: a.description,
            amount: Number(a.amountCents) !== 0 ? centsToDollars(a.amountCents) : a.amount,
            expectedAmount: Number(a.expectedAmountCents) !== 0 ? centsToDollars(a.expectedAmountCents) : a.expectedAmount,
            date: a.date ? timestampDate(a.date as Parameters<typeof timestampDate>[0]).toISOString().split('T')[0] : 'unknown',
          }));
          return { anomalies, count: anomalies.length };
        } catch (err: unknown) {
          return { error: String(err) };
        }
      },
    });
  }

  return tools;
}
