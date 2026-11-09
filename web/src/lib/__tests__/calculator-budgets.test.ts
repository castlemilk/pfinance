import { budgetsFromSnapshot } from '../calculator-budgets';
import type { CalculatorSnapshot } from '../calculator-handoff';
import { BudgetPeriod, ExpenseCategory } from '@/gen/pfinance/v1/types_pb';

const snapshot = (tool: CalculatorSnapshot['tool'], fields: CalculatorSnapshot['fields']): CalculatorSnapshot => ({
  tool,
  title: 't',
  summary: 's',
  metrics: [],
  fields,
  targetPath: '/personal/budgets/',
  savedAt: '2026-11-09T00:00:00.000Z',
});

describe('budgetsFromSnapshot', () => {
  it('turns a 50/30/20 snapshot into monthly Needs and Wants budgets', () => {
    const drafts = budgetsFromSnapshot(
      snapshot('budget', { needsPercent: 50, wantsPercent: 30, savingsPercent: 20, needsMonthly: 3250, wantsMonthly: 1950, savingsMonthly: 1300 })
    );
    expect(drafts.map((d) => [d.name, d.amount, d.period])).toEqual([
      ['Needs', 3250, BudgetPeriod.MONTHLY],
      ['Wants', 1950, BudgetPeriod.MONTHLY],
    ]);
    expect(drafts[0].categoryIds).toContain(ExpenseCategory.HOUSING);
    expect(drafts[1].categoryIds).toContain(ExpenseCategory.ENTERTAINMENT);
  });

  it('turns a CCS snapshot into a weekly childcare budget', () => {
    const [draft] = budgetsFromSnapshot(snapshot('ccs', { weeklyChildcare: 182.45 }));
    expect(draft).toMatchObject({ name: 'Childcare', amount: 182.45, period: BudgetPeriod.WEEKLY });
  });

  it('skips zero, missing or non-numeric amounts and other tools', () => {
    expect(budgetsFromSnapshot(snapshot('budget', { needsMonthly: 0, wantsMonthly: 'x' }))).toEqual([]);
    expect(budgetsFromSnapshot(snapshot('ccs', {}))).toEqual([]);
    expect(budgetsFromSnapshot(snapshot('cgt', { needsMonthly: 100 }))).toEqual([]);
  });
});
