import type { Timestamp } from '@bufbuild/protobuf/wkt';
import type {
  DetectAnomaliesResponse,
  GetAnalyticsOverviewResponse,
  GetCashFlowForecastResponse,
  GetCategoryComparisonResponse,
  GetWaterfallDataResponse,
} from '@/gen/pfinance/v1/finance_service_pb';
import type {
  ForecastPoint,
  SpendingAnomaly,
  TimeSeriesDataPoint,
} from '@/gen/pfinance/v1/types_pb';
import {
  AnomalySeverity,
  AnomalyType,
  ExpenseCategory,
  WaterfallEntryType,
} from '@/gen/pfinance/v1/types_pb';
import type {
  AnalyticsAnomalyData,
  AnalyticsOverviewData,
  CashFlowForecastData,
  CategoryComparisonData,
  ForecastHistoryPoint,
  ForecastSeries,
  PrimaryAnalyticsAttention,
  WaterfallBar,
  WaterfallData,
} from './types';

const ZERO = BigInt(0);
const EPOCH_MILLISECONDS = 0;

/** Prefer a populated integer-cents field, retaining legacy double compatibility. */
export function analyticsMoney(
  cents: bigint | undefined,
  legacyAmount = 0
): number {
  return cents !== undefined && cents !== ZERO
    ? Number(cents) / 100
    : legacyAmount;
}

/** Convert an expense category enum into its stable display label. */
export function analyticsCategoryLabel(category: ExpenseCategory): string {
  const enumName = ExpenseCategory[category];
  if (!enumName || enumName === 'UNSPECIFIED') {
    return 'Other';
  }

  return enumName
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function timestampMilliseconds(timestamp?: Timestamp): number | null {
  if (!timestamp) {
    return null;
  }

  const seconds = Number(timestamp.seconds);
  const nanos = timestamp.nanos;
  if (
    !Number.isFinite(seconds) ||
    !Number.isFinite(nanos) ||
    nanos < 0 ||
    nanos >= 1_000_000_000
  ) {
    return null;
  }

  const milliseconds = seconds * 1_000 + nanos / 1_000_000;
  if (!Number.isFinite(milliseconds)) {
    return null;
  }

  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function nullableTimestampDate(timestamp?: Timestamp): Date | null {
  const milliseconds = timestampMilliseconds(timestamp);
  return milliseconds === null ? null : new Date(milliseconds);
}

function timestampDateOrEpoch(timestamp?: Timestamp): Date {
  const milliseconds = timestampMilliseconds(timestamp);
  return new Date(milliseconds ?? EPOCH_MILLISECONDS);
}

function deterministicDate(value: string): Date {
  const milliseconds = Date.parse(value);
  return new Date(
    Number.isFinite(milliseconds) ? milliseconds : EPOCH_MILLISECONDS
  );
}

function severityLabel(
  severity: AnomalySeverity
): 'low' | 'medium' | 'high' {
  switch (severity) {
    case AnomalySeverity.HIGH:
      return 'high';
    case AnomalySeverity.MEDIUM:
      return 'medium';
    case AnomalySeverity.LOW:
    default:
      return 'low';
  }
}

function anomalyTypeLabel(type: AnomalyType): string {
  switch (type) {
    case AnomalyType.AMOUNT_OUTLIER:
      return 'Amount Outlier';
    case AnomalyType.NEW_MERCHANT:
      return 'New Merchant';
    case AnomalyType.UNUSUAL_TIMING:
      return 'Unusual Timing';
    case AnomalyType.CATEGORY_SPIKE:
      return 'Category Spike';
    default:
      return 'Unknown';
  }
}

function waterfallTypeLabel(
  type: WaterfallEntryType
): WaterfallBar['type'] {
  switch (type) {
    case WaterfallEntryType.INCOME:
      return 'income';
    case WaterfallEntryType.EXPENSE:
      return 'expense';
    case WaterfallEntryType.TAX:
      return 'tax';
    case WaterfallEntryType.SAVINGS:
      return 'savings';
    case WaterfallEntryType.SUBTOTAL:
    default:
      return 'subtotal';
  }
}

function waterfallColor(type: WaterfallEntryType): string {
  switch (type) {
    case WaterfallEntryType.INCOME:
      return 'var(--chart-2)';
    case WaterfallEntryType.EXPENSE:
      return 'var(--chart-1)';
    case WaterfallEntryType.TAX:
      return 'var(--chart-4)';
    case WaterfallEntryType.SAVINGS:
      return 'var(--chart-3)';
    case WaterfallEntryType.SUBTOTAL:
    default:
      return 'var(--muted)';
  }
}

export function mapAnalyticsOverviewResponse(
  response: GetAnalyticsOverviewResponse
): AnalyticsOverviewData {
  return {
    currentStart: nullableTimestampDate(response.currentStart),
    currentEnd: nullableTimestampDate(response.currentEnd),
    previousStart: nullableTimestampDate(response.previousStart),
    previousEnd: nullableTimestampDate(response.previousEnd),
    currentIncome: Number(response.currentIncomeCents) / 100,
    currentExpense: Number(response.currentExpenseCents) / 100,
    currentNet: Number(response.currentNetCents) / 100,
    previousIncome: Number(response.previousIncomeCents) / 100,
    previousExpense: Number(response.previousExpenseCents) / 100,
    previousNet: Number(response.previousNetCents) / 100,
    savingsRate: response.savingsRatePercent,
    hasSavingsRate: response.hasSavingsRate,
    incomeChange: response.incomeChangePercent,
    hasIncomeChange: response.hasIncomeChange,
    expenseChange: response.expenseChangePercent,
    hasExpenseChange: response.hasExpenseChange,
    largestCategory: analyticsCategoryLabel(response.largestCategory),
    largestCategoryAmount:
      Number(response.largestCategoryAmountCents) / 100,
    currentTransactionCount: response.currentTransactionCount,
    previousTransactionCount: response.previousTransactionCount,
    hasCurrentData: response.hasCurrentData,
  };
}

export function mapCategoryComparisonResponse(
  response: GetCategoryComparisonResponse
): CategoryComparisonData {
  return {
    categories: response.categories.map((category) => {
      const currentValue = analyticsMoney(
        category.currentAmountCents,
        category.currentAmount
      );
      const previousValue = analyticsMoney(
        category.previousAmountCents,
        category.previousAmount
      );
      const budgetValue = analyticsMoney(
        category.budgetAmountCents,
        category.budgetAmount
      );

      return {
        category: analyticsCategoryLabel(category.category),
        currentValue,
        previousValue,
        budgetValue: budgetValue > 0 ? budgetValue : undefined,
        maxValue: Math.max(currentValue, previousValue, budgetValue),
      };
    }),
    combinedBudgets: response.combinedBudgets.map((budget) => ({
      id: budget.budgetId,
      name: budget.name,
      categories: budget.categories.map(analyticsCategoryLabel),
      allowance: Number(budget.allowanceCents) / 100,
      currentSpend: Number(budget.currentSpendCents) / 100,
    })),
  };
}

function mapAnomaly(anomaly: SpendingAnomaly) {
  return {
    id: anomaly.id,
    expenseId: anomaly.expenseId,
    description: anomaly.description,
    amount: analyticsMoney(anomaly.amountCents, anomaly.amount),
    category: analyticsCategoryLabel(anomaly.category),
    date: timestampDateOrEpoch(anomaly.date),
    zScore: anomaly.zScore,
    expectedAmount: analyticsMoney(
      anomaly.expectedAmountCents,
      anomaly.expectedAmount
    ),
    expectedLowerAmount: Number(anomaly.expectedLowerCents) / 100,
    expectedUpperAmount: Number(anomaly.expectedUpperCents) / 100,
    hasExpectedRange: anomaly.hasExpectedRange,
    anomalyType: anomalyTypeLabel(anomaly.anomalyType),
    severity: severityLabel(anomaly.severity),
  };
}

const severityRank = { low: 0, medium: 1, high: 2 } as const;

function stableNumber(value: number): string {
  return String(Object.is(value, -0) ? 0 : value);
}

function selectPrimaryAttention(
  anomalies: ReturnType<typeof mapAnomaly>[]
): PrimaryAnalyticsAttention | null {
  const primary = [...anomalies].sort((left, right) => {
    const severityDifference =
      severityRank[right.severity] - severityRank[left.severity];
    if (severityDifference !== 0) {
      return severityDifference;
    }

    const amountDifference = right.amount - left.amount;
    if (amountDifference !== 0) {
      return amountDifference;
    }

    if (left.expenseId < right.expenseId) return -1;
    if (left.expenseId > right.expenseId) return 1;
    return 0;
  })[0];

  if (!primary) {
    return null;
  }

  return {
    expenseId: primary.expenseId,
    description: primary.description,
    reason: primary.anomalyType,
    amount: primary.amount,
    ...(primary.hasExpectedRange
      ? {
          expectedContext: `Expected range: ${stableNumber(
            primary.expectedLowerAmount
          )} to ${stableNumber(primary.expectedUpperAmount)}`,
        }
      : {}),
    severity: primary.severity,
  };
}

export function mapAnomalyResponse(
  response: DetectAnomaliesResponse
): AnalyticsAnomalyData {
  const data = response.anomalies.map(mapAnomaly);

  return {
    data,
    totalAnomalousSpend: analyticsMoney(
      response.anomalousSpendTotalCents,
      response.anomalousSpendTotal
    ),
    topCategory: response.topAnomalyCategory,
    analyzedCount: response.analyzedExpenseCount,
    eligibleCount: response.eligibleCategoryCount,
    minimumSample: response.minimumCategorySample,
    hasSufficientHistory: response.hasSufficientHistory,
    categoryCoverage: response.categoryCoverage.map((coverage) => ({
      category: analyticsCategoryLabel(coverage.category),
      sampleCount: coverage.sampleCount,
      hasSufficientHistory: coverage.hasSufficientHistory,
    })),
    primaryAttention: selectPrimaryAttention(data),
  };
}

function mapForecastPoint(point: ForecastPoint): ForecastSeries {
  const hasBounds =
    point.lowerBoundCents !== ZERO ||
    point.upperBoundCents !== ZERO ||
    point.lowerBound !== 0 ||
    point.upperBound !== 0;

  return {
    date: deterministicDate(point.date),
    predicted: analyticsMoney(point.predictedCents, point.predicted),
    lowerBound: analyticsMoney(point.lowerBoundCents, point.lowerBound),
    upperBound: analyticsMoney(point.upperBoundCents, point.upperBound),
    hasBounds,
    isRecurring: point.isRecurring,
  };
}

function mapHistoryPoint(point: TimeSeriesDataPoint): ForecastHistoryPoint {
  return {
    date: point.date,
    label: point.label,
    value: analyticsMoney(point.valueCents, point.value),
  };
}

export function mapCashFlowForecastResponse(
  response: GetCashFlowForecastResponse
): CashFlowForecastData {
  return {
    incomeForecast: response.incomeForecast.map(mapForecastPoint),
    expenseForecast: response.expenseForecast.map(mapForecastPoint),
    netForecast: response.netForecast.map(mapForecastPoint),
    incomeHistory: response.incomeHistory.map(mapHistoryPoint),
    expenseHistory: response.expenseHistory.map(mapHistoryPoint),
  };
}

export function mapWaterfallResponse(
  response: GetWaterfallDataResponse
): WaterfallData {
  return {
    data: response.entries.map((entry) => ({
      label: entry.label,
      amount: analyticsMoney(entry.amountCents, entry.amount),
      type: waterfallTypeLabel(entry.entryType),
      runningTotal: analyticsMoney(
        entry.runningTotalCents,
        entry.runningTotal
      ),
      color: waterfallColor(entry.entryType),
    })),
    periodLabel: response.periodLabel,
  };
}
