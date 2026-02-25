import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { timestampFromDate, timestampDate } from '@bufbuild/protobuf/wkt';
import { ExpenseCategory, ExpenseFrequency, GoalStatus, TaxDeductionCategory } from '@/gen/pfinance/v1/types_pb';
import type { BackendClient } from './backend-client';

// Helper to convert cents to dollars
function centsToDollars(cents: bigint | number): number {
  return Number(cents) / 100;
}

// Strip proto enum prefixes like "EXPENSE_CATEGORY_FOOD" → "FOOD"
function cleanEnumName(name: string): string {
  return name.replace(/^EXPENSE_CATEGORY_/, '').replace(/^EXPENSE_FREQUENCY_/, '');
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
          const pageSize = Math.min(args.pageSize || 20, 50);
          return {
            expenses,
            count: expenses.length,
            hasMore: !!res.nextPageToken,
            ...(res.nextPageToken ? {
              nextPageToken: res.nextPageToken,
              _loadMoreParams: { startDate: args.startDate, endDate: args.endDate, pageSize },
            } : {}),
          };
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
            category: cleanEnumName(r.category),
            amount: Number(r.amountCents) !== 0 ? centsToDollars(r.amountCents) : r.amount,
            date: r.date ? timestampDate(r.date as Parameters<typeof timestampDate>[0]).toISOString().split('T')[0] : 'no date',
          }));
          return {
            results,
            count: results.length,
            hasMore: !!res.nextPageToken,
            ...(res.nextPageToken ? {
              nextPageToken: res.nextPageToken,
              _loadMoreParams: { query: args.query, category: args.category, amountMin: args.amountMin, amountMax: args.amountMax },
            } : {}),
          };
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
      description: 'Get budgets with their spending progress. Use the query parameter to find specific budgets by name or description.',
      inputSchema: z.object({
        query: z.string().optional().describe('Search text to filter budgets by name or description (e.g. "groceries", "entertainment")'),
        activeOnly: z.boolean().optional().describe('Only return active budgets (default: false, returns all)'),
      }),
      execute: async (args) => {
        try {
          const budgetsRes = await client.listBudgets({ userId });

          // Client-side text search filtering
          const q = args.query?.toLowerCase().trim();
          let filtered = q
            ? budgetsRes.budgets.filter(b =>
                b.name.toLowerCase().includes(q) ||
                (b.description?.toLowerCase().includes(q) ?? false)
              )
            : budgetsRes.budgets;

          if (args.activeOnly) {
            filtered = filtered.filter(b => b.isActive);
          }

          const budgets = [];
          for (const b of filtered) {
            try {
              const progressRes = await client.getBudgetProgress({ budgetId: b.id });
              const prog = progressRes.progress;
              budgets.push({
                id: b.id,
                name: b.name,
                description: b.description || undefined,
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
                description: b.description || undefined,
                limit: Number(b.amountCents) !== 0 ? centsToDollars(b.amountCents) : b.amount,
                spent: 0,
                percentage: 0,
                period: b.period,
                isActive: b.isActive,
              });
            }
          }
          return { budgets, count: budgets.length, ...(q ? { searchQuery: q } : {}) };
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
          return {
            incomes,
            count: incomes.length,
            hasMore: !!res.nextPageToken,
            ...(res.nextPageToken ? {
              nextPageToken: res.nextPageToken,
              _loadMoreParams: { startDate: args.startDate, endDate: args.endDate },
            } : {}),
          };
        } catch (err: unknown) {
          return { error: String(err) };
        }
      },
    }),

    list_goals: tool({
      description: 'List and search financial goals with progress. Use the query parameter to find goals by name or description.',
      inputSchema: z.object({
        query: z.string().optional().describe('Search text to filter goals by name or description (e.g. "emergency fund", "holiday")'),
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

          // Client-side text search filtering
          const q = args.query?.toLowerCase().trim();
          const filtered = q
            ? res.goals.filter(g =>
                g.name.toLowerCase().includes(q) ||
                (g.description?.toLowerCase().includes(q) ?? false)
              )
            : res.goals;

          const goals = [];
          for (const g of filtered) {
            try {
              const progressRes = await client.getGoalProgress({ goalId: g.id });
              const prog = progressRes.progress;
              goals.push({
                id: g.id,
                name: g.name,
                description: g.description || undefined,
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
                description: g.description || undefined,
                type: g.goalType,
                target: Number(g.targetAmountCents) !== 0 ? centsToDollars(g.targetAmountCents) : g.targetAmount,
                current: 0,
                percentage: 0,
                onTrack: true,
                status: g.status,
              });
            }
          }
          return { goals, count: goals.length, ...(q ? { searchQuery: q } : {}) };
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
          // Check for duplicates before showing confirmation
          let duplicates: Array<{ description: string; amount: number; date: string; matchScore: number; matchReason: string }> = [];
          let duplicateWarning: string | undefined;
          try {
            const res = await client.checkDuplicates({
              userId,
              transactions: [
                {
                  id: '',
                  description: args.description,
                  normalizedMerchant: args.description,
                  amount: args.amount,
                  amountCents: BigInt(Math.round(args.amount * 100)),
                  date: args.date || new Date().toISOString().split('T')[0],
                  isDebit: true,
                  confidence: 1.0,
                },
              ],
            });
            for (const [, candidateList] of Object.entries(res.duplicates)) {
              for (const c of candidateList.candidates) {
                const amt = Number(c.amountCents) !== 0 ? centsToDollars(c.amountCents) : c.amount;
                duplicates.push({
                  description: c.description,
                  amount: amt,
                  date: c.date,
                  matchScore: c.matchScore,
                  matchReason: c.matchReason,
                });
              }
            }
            if (duplicates.length > 0) {
              duplicateWarning = `Found ${duplicates.length} similar existing expense${duplicates.length > 1 ? 's' : ''}`;
            }
          } catch {
            // Non-blocking — proceed without dedup info
          }

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
            duplicates: duplicates.length > 0 ? duplicates : undefined,
            duplicateWarning,
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

    tools.get_tax_summary = tool({
      description: 'Get the tax return summary for a financial year, including gross income, deductions, taxable income, and estimated tax. Pro feature.',
      inputSchema: z.object({
        financialYear: z.string().optional().describe('Financial year e.g. "2025-26" (default: current FY)'),
      }),
      execute: async (args) => {
        try {
          const res = await client.getTaxSummary({
            userId,
            financialYear: args.financialYear || '',
          });
          const calc = res.calculation;
          if (!calc) return { error: 'No tax data available' };
          return {
            financialYear: calc.financialYear,
            grossIncome: calc.grossIncome,
            totalDeductions: calc.totalDeductions,
            taxableIncome: calc.taxableIncome,
            baseTax: calc.baseTax,
            medicareLevy: calc.medicareLevy,
            helpRepayment: calc.helpRepayment,
            lito: calc.lito,
            totalTax: calc.totalTax,
            effectiveRate: (calc.effectiveRate * 100).toFixed(1) + '%',
            taxWithheld: calc.taxWithheld,
            refundOrOwed: calc.refundOrOwed,
            deductions: calc.deductions.map(d => ({
              category: TaxDeductionCategory[d.category] || 'UNKNOWN',
              amount: d.totalAmount,
              expenseCount: d.expenseCount,
            })),
          };
        } catch (err: unknown) {
          return { error: String(err) };
        }
      },
    });

    tools.list_deductible_expenses = tool({
      description: 'List tax-deductible expenses for a financial year, optionally filtered by ATO deduction category. Pro feature.',
      inputSchema: z.object({
        financialYear: z.string().optional().describe('Financial year e.g. "2025-26"'),
        category: z.enum(['WORK_TRAVEL', 'UNIFORM', 'SELF_EDUCATION', 'OTHER_WORK', 'HOME_OFFICE', 'VEHICLE', 'DONATIONS', 'TAX_AFFAIRS', 'INCOME_PROTECTION', 'OTHER']).optional().describe('ATO deduction category filter'),
      }),
      execute: async (args) => {
        try {
          const catMap: Record<string, TaxDeductionCategory> = {
            WORK_TRAVEL: TaxDeductionCategory.WORK_TRAVEL,
            UNIFORM: TaxDeductionCategory.UNIFORM,
            SELF_EDUCATION: TaxDeductionCategory.SELF_EDUCATION,
            OTHER_WORK: TaxDeductionCategory.OTHER_WORK,
            HOME_OFFICE: TaxDeductionCategory.HOME_OFFICE,
            VEHICLE: TaxDeductionCategory.VEHICLE,
            DONATIONS: TaxDeductionCategory.DONATIONS,
            TAX_AFFAIRS: TaxDeductionCategory.TAX_AFFAIRS,
            INCOME_PROTECTION: TaxDeductionCategory.INCOME_PROTECTION,
            OTHER: TaxDeductionCategory.OTHER,
          };
          const res = await client.listDeductibleExpenses({
            userId,
            financialYear: args.financialYear || '',
            category: args.category ? catMap[args.category] : TaxDeductionCategory.UNSPECIFIED,
            pageSize: 50,
          });
          const expenses = res.expenses.map(e => {
            const amount = Number(e.amountCents) !== 0 ? centsToDollars(e.amountCents) : e.amount;
            return {
              id: e.id,
              description: e.description,
              amount,
              category: TaxDeductionCategory[e.taxDeductionCategory] || 'UNKNOWN',
              deductiblePercent: e.taxDeductiblePercent,
              note: e.taxDeductionNote,
              date: e.date ? timestampDate(e.date as Parameters<typeof timestampDate>[0]).toISOString().split('T')[0] : 'no date',
            };
          });
          return {
            expenses,
            count: expenses.length,
            totalDeductible: res.totalDeductible,
          };
        } catch (err: unknown) {
          return { error: String(err) };
        }
      },
    });

    tools.classify_tax_deductibility = tool({
      description: 'Use AI to classify expenses as tax-deductible. Can classify a single expense or batch-classify all expenses in a financial year. This is a mutation - use confirmed=false/true pattern.',
      inputSchema: z.object({
        mode: z.enum(['single', 'batch']).describe('"single" for one expense, "batch" for all expenses in a FY'),
        expenseId: z.string().optional().describe('Expense ID (required for single mode)'),
        financialYear: z.string().optional().describe('Financial year for batch mode (default: current FY)'),
        occupation: z.string().optional().describe('User occupation for better classification (e.g. "software engineer")'),
        confirmed: z.boolean().describe('Set to false to preview, true to execute'),
      }),
      execute: async (args) => {
        if (args.mode === 'single') {
          if (!args.expenseId) return { status: 'error', error: 'expenseId required for single mode' };

          if (!args.confirmed) {
            return {
              status: 'pending_confirmation' as const,
              action: 'classify_tax_deductibility',
              message: `AI-classify expense ${args.expenseId} for tax deductibility?`,
              details: { expenseId: args.expenseId, occupation: args.occupation },
            };
          }

          try {
            const res = await client.classifyTaxDeductibility({
              userId,
              expenseId: args.expenseId,
              occupation: args.occupation || '',
            });
            const r = res.result;
            if (!r) return { status: 'error', error: 'No result returned' };
            return {
              status: 'success',
              result: {
                isDeductible: r.isDeductible,
                category: TaxDeductionCategory[r.category] || 'UNKNOWN',
                deductiblePercent: r.deductiblePercent,
                confidence: r.confidence,
                reasoning: r.reasoning,
                autoApplied: r.autoApplied,
                needsReview: r.needsReview,
              },
              message: r.isDeductible
                ? `Classified as deductible (${TaxDeductionCategory[r.category]}, ${(r.confidence * 100).toFixed(0)}% confidence). ${r.autoApplied ? 'Auto-applied.' : 'Needs your review.'}`
                : `Classified as NOT deductible (${(r.confidence * 100).toFixed(0)}% confidence): ${r.reasoning}`,
            };
          } catch (err: unknown) {
            return { status: 'error', error: String(err) };
          }
        } else {
          // Batch mode
          if (!args.confirmed) {
            return {
              status: 'pending_confirmation' as const,
              action: 'batch_classify_tax_deductibility',
              message: `AI-classify all expenses in FY ${args.financialYear || 'current'} for tax deductibility? High-confidence results will be auto-applied.`,
              details: { financialYear: args.financialYear, occupation: args.occupation },
            };
          }

          try {
            const res = await client.batchClassifyTaxDeductibility({
              userId,
              financialYear: args.financialYear || '',
              occupation: args.occupation || '',
              autoApply: true,
            });
            return {
              status: 'success',
              stats: {
                totalProcessed: res.totalProcessed,
                autoApplied: res.autoApplied,
                needsReview: res.needsReview,
                skipped: res.skipped,
              },
              message: `Classified ${res.totalProcessed} expenses: ${res.autoApplied} auto-applied, ${res.needsReview} need review, ${res.skipped} skipped.`,
            };
          } catch (err: unknown) {
            return { status: 'error', error: String(err) };
          }
        }
      },
    });

    tools.update_tax_deductibility = tool({
      description: 'Mark one or more expenses as tax-deductible (or not). Use confirmed=false/true pattern. Search for the expense first.',
      inputSchema: z.object({
        updates: z.array(z.object({
          expenseId: z.string().describe('Expense ID'),
          isTaxDeductible: z.boolean().describe('Whether the expense is tax deductible'),
          category: z.enum(['WORK_TRAVEL', 'UNIFORM', 'SELF_EDUCATION', 'OTHER_WORK', 'HOME_OFFICE', 'VEHICLE', 'DONATIONS', 'TAX_AFFAIRS', 'INCOME_PROTECTION', 'OTHER']).optional().describe('ATO deduction category'),
          deductiblePercent: z.number().optional().describe('Percentage deductible (0.0-1.0, default 1.0)'),
          note: z.string().optional().describe('Deduction note'),
        })).describe('Array of tax status updates'),
        confirmed: z.boolean().describe('Set to false to preview, true to execute'),
      }),
      execute: async (args) => {
        if (!args.confirmed) {
          const descriptions = [];
          for (const u of args.updates) {
            try {
              const res = await client.getExpense({ expenseId: u.expenseId });
              if (res.expense) {
                const amount = Number(res.expense.amountCents) !== 0 ? centsToDollars(res.expense.amountCents) : res.expense.amount;
                descriptions.push(`"${res.expense.description}" ($${amount.toFixed(2)}) → ${u.isTaxDeductible ? 'deductible' : 'not deductible'}${u.category ? ` (${u.category})` : ''}`);
              }
            } catch {
              descriptions.push(`${u.expenseId} → ${u.isTaxDeductible ? 'deductible' : 'not deductible'}`);
            }
          }
          return {
            status: 'pending_confirmation' as const,
            action: 'update_tax_deductibility',
            count: args.updates.length,
            changes: descriptions,
            message: `Update tax status for ${args.updates.length} expense(s)?`,
          };
        }

        try {
          const catMap: Record<string, TaxDeductionCategory> = {
            WORK_TRAVEL: TaxDeductionCategory.WORK_TRAVEL,
            UNIFORM: TaxDeductionCategory.UNIFORM,
            SELF_EDUCATION: TaxDeductionCategory.SELF_EDUCATION,
            OTHER_WORK: TaxDeductionCategory.OTHER_WORK,
            HOME_OFFICE: TaxDeductionCategory.HOME_OFFICE,
            VEHICLE: TaxDeductionCategory.VEHICLE,
            DONATIONS: TaxDeductionCategory.DONATIONS,
            TAX_AFFAIRS: TaxDeductionCategory.TAX_AFFAIRS,
            INCOME_PROTECTION: TaxDeductionCategory.INCOME_PROTECTION,
            OTHER: TaxDeductionCategory.OTHER,
          };
          const res = await client.batchUpdateExpenseTaxStatus({
            updates: args.updates.map(u => ({
              expenseId: u.expenseId,
              isTaxDeductible: u.isTaxDeductible,
              taxDeductionCategory: u.category ? catMap[u.category] : TaxDeductionCategory.UNSPECIFIED,
              taxDeductiblePercent: u.deductiblePercent ?? (u.isTaxDeductible ? 1.0 : 0),
              taxDeductionNote: u.note || '',
            })),
          });
          return {
            status: 'success',
            updatedCount: res.updatedCount,
            failedIds: res.failedExpenseIds,
            message: `Updated ${res.updatedCount} expense(s)${res.failedExpenseIds.length > 0 ? `, ${res.failedExpenseIds.length} failed` : ''}`,
          };
        } catch (err: unknown) {
          return { status: 'error', error: String(err) };
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
