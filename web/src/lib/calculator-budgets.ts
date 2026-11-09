import { BudgetPeriod, ExpenseCategory } from '@/gen/pfinance/v1/types_pb';
import type { CalculatorSnapshot } from '@/lib/calculator-handoff';

const NEEDS_CATEGORIES = [
  ExpenseCategory.HOUSING,
  ExpenseCategory.UTILITIES,
  ExpenseCategory.FOOD,
  ExpenseCategory.TRANSPORTATION,
  ExpenseCategory.HEALTHCARE,
  ExpenseCategory.EDUCATION,
];
const WANTS_CATEGORIES = [
  ExpenseCategory.ENTERTAINMENT,
  ExpenseCategory.SHOPPING,
  ExpenseCategory.TRAVEL,
  ExpenseCategory.OTHER,
];

export type BudgetDraft = {
  name: string;
  description: string;
  amount: number;
  period: BudgetPeriod;
  categoryIds: ExpenseCategory[];
};

/** Budgets a calculator snapshot should become. Empty when it carries no usable amount. */
export function budgetsFromSnapshot(snapshot: CalculatorSnapshot): BudgetDraft[] {
  const n = (key: string) => {
    const value = Number(snapshot.fields[key]);
    return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : 0;
  };

  if (snapshot.tool === 'budget') {
    return [
      {
        name: 'Needs',
        description: `Essentials from the budget calculator (${n('needsPercent')}% of take-home pay)`,
        amount: n('needsMonthly'),
        period: BudgetPeriod.MONTHLY,
        categoryIds: NEEDS_CATEGORIES,
      },
      {
        name: 'Wants',
        description: `Discretionary spending from the budget calculator (${n('wantsPercent')}% of take-home pay)`,
        amount: n('wantsMonthly'),
        period: BudgetPeriod.MONTHLY,
        categoryIds: WANTS_CATEGORIES,
      },
    ].filter((draft) => draft.amount > 0);
  }

  if (snapshot.tool === 'ccs') {
    const weekly = n('weeklyChildcare');
    return weekly > 0
      ? [
          {
            name: 'Childcare',
            description: 'Out-of-pocket childcare after the Child Care Subsidy estimate',
            amount: weekly,
            period: BudgetPeriod.WEEKLY,
            categoryIds: [ExpenseCategory.EDUCATION],
          },
        ]
      : [];
  }

  return [];
}
