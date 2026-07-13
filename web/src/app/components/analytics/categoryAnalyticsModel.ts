import type {
  AnalyticsCombinedBudget,
  RadarAxis,
} from '@/app/metrics/types';

const KNOWN_CATEGORY_LABELS = new Map<string, string>([
  ['food', 'Food'],
  ['housing', 'Housing'],
  ['transportation', 'Transportation'],
  ['entertainment', 'Entertainment'],
  ['healthcare', 'Healthcare'],
  ['utilities', 'Utilities'],
  ['shopping', 'Shopping'],
  ['education', 'Education'],
  ['travel', 'Travel'],
  ['other', 'Other'],
]);

export type NormalizedCombinedBudget = Readonly<{
  key: string;
  id: string;
  name: string;
  categories: readonly string[];
  allowance: number | null;
  currentSpend: number | null;
}>;

function normalizedWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function categoryIdentity(value: string): string {
  return normalizedWhitespace(value).toLocaleLowerCase('en');
}

function displayCategory(identity: string): string {
  const known = KNOWN_CATEGORY_LABELS.get(identity);
  if (known) return known;
  return identity
    .split(' ')
    .map((word) =>
      word.length === 0
        ? word
        : `${word.slice(0, 1).toLocaleUpperCase('en')}${word
            .slice(1)
            .toLocaleLowerCase('en')}`
    )
    .join(' ');
}

function isVisibleAmount(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function optionalAmount(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function financialAmount(value: number): number | null {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function finiteSum(left: number, right: number): number {
  const sum = left + right;
  return Number.isFinite(sum) ? sum : Number.MAX_VALUE;
}

export function normalizeCategoryAxes(
  data: readonly RadarAxis[],
  options: Readonly<{ includeBudgets?: boolean }> = {}
): readonly RadarAxis[] {
  const includeBudgets = options.includeBudgets ?? true;
  const consolidated = new Map<
    string,
    {
      currentValue: number;
      previousValue: number;
      budgetValue?: number;
      hasBudget: boolean;
    }
  >();

  for (const axis of data) {
    const identity = categoryIdentity(axis.category);
    if (
      identity.length === 0 ||
      !isVisibleAmount(axis.currentValue) ||
      !isVisibleAmount(axis.previousValue)
    ) {
      continue;
    }
    const currentValue = axis.currentValue;
    const previousValue = axis.previousValue;
    const budgetValue = includeBudgets
      ? optionalAmount(axis.budgetValue)
      : undefined;
    const existing = consolidated.get(identity);

    if (existing) {
      existing.currentValue = finiteSum(existing.currentValue, currentValue);
      existing.previousValue = finiteSum(
        existing.previousValue,
        previousValue
      );
      if (budgetValue !== undefined) {
        existing.budgetValue = finiteSum(
          existing.budgetValue ?? 0,
          budgetValue
        );
        existing.hasBudget = true;
      }
      continue;
    }

    consolidated.set(identity, {
      currentValue,
      previousValue,
      ...(budgetValue === undefined ? {} : { budgetValue }),
      hasBudget: budgetValue !== undefined,
    });
  }

  return Object.freeze(
    [...consolidated.entries()].map(([identity, values]) => {
      const budgetValue = values.hasBudget ? values.budgetValue : undefined;
      return Object.freeze({
        category: displayCategory(identity),
        currentValue: values.currentValue,
        previousValue: values.previousValue,
        ...(budgetValue === undefined ? {} : { budgetValue }),
        maxValue: Math.max(
          values.currentValue,
          values.previousValue,
          budgetValue ?? 0
        ),
      });
    })
  );
}

export function categoryAxesSignature(data: readonly RadarAxis[]): string {
  return JSON.stringify(
    data.map((axis) => [
      axis.category,
      axis.currentValue,
      axis.previousValue,
      axis.budgetValue ?? null,
      axis.maxValue,
    ])
  );
}

export function hasCategoryBudgets(data: readonly RadarAxis[]): boolean {
  return data.some((axis) => axis.budgetValue !== undefined);
}

function normalizedCategories(values: readonly string[]): string[] {
  const identities = new Map<string, string>();
  for (const value of values) {
    const identity = categoryIdentity(value);
    if (identity.length === 0 || identities.has(identity)) continue;
    identities.set(identity, displayCategory(identity));
  }
  return [...identities.values()];
}

export function normalizeCombinedBudgets(
  data: readonly AnalyticsCombinedBudget[]
): readonly NormalizedCombinedBudget[] {
  const normalized: Array<{
    key: string;
    id: string;
    name: string;
    categories: string[];
    allowance: number | null;
    currentSpend: number | null;
  }> = [];
  const stableIdIndexes = new Map<string, number>();

  data.forEach((budget, index) => {
    const id = budget.id.trim();
    const categories = normalizedCategories(budget.categories);
    const fallbackName = `Combined budget ${index + 1}`;
    const name = normalizedWhitespace(budget.name) || fallbackName;
    const stableIndex = id.length > 0 ? stableIdIndexes.get(id) : undefined;

    if (stableIndex !== undefined) {
      const existing = normalized[stableIndex];
      const seen = new Set(
        existing.categories.map((category) => categoryIdentity(category))
      );
      for (const category of categories) {
        const identity = categoryIdentity(category);
        if (!seen.has(identity)) {
          seen.add(identity);
          existing.categories.push(category);
        }
      }
      return;
    }

    const entry = {
      key: id.length > 0 ? `budget:${id}` : `budget:anonymous:${index}`,
      id,
      name,
      categories,
      allowance: financialAmount(budget.allowance),
      currentSpend: financialAmount(budget.currentSpend),
    };
    if (id.length > 0) stableIdIndexes.set(id, normalized.length);
    normalized.push(entry);
  });

  return Object.freeze(
    normalized.map((budget) =>
      Object.freeze({
        ...budget,
        categories: Object.freeze([...budget.categories]),
      })
    )
  );
}
