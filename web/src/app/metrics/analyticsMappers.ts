import type { Timestamp } from '@bufbuild/protobuf/wkt';
import type {
  DetectAnomaliesResponse,
  GetAnalyticsOverviewResponse,
  GetCashFlowForecastResponse,
  GetCategoryComparisonResponse,
  GetSpendingTrendsResponse,
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
  AnalyticsTimestampBound,
  CashFlowForecastData,
  CategoryComparisonData,
  ForecastHistoryPoint,
  ForecastSeries,
  PrimaryAnalyticsAttention,
  WaterfallBar,
  WaterfallData,
} from './types';

const ZERO = BigInt(0);
const MAX_SAFE_CENTS = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_CENTS = BigInt(Number.MIN_SAFE_INTEGER);
const MIN_TIMESTAMP_SECONDS = BigInt(-62_135_596_800);
const MAX_TIMESTAMP_SECONDS = BigInt(253_402_300_799);
const EPOCH_MILLISECONDS = 0;

/** Prefer a populated integer-cents field, retaining legacy double compatibility. */
export function checkedCentsToDollars(
  cents: bigint | undefined,
  legacyAmount = 0
): number {
  const authoritativeCents = cents ?? ZERO;
  if (authoritativeCents !== ZERO) {
    if (
      authoritativeCents > MAX_SAFE_CENTS ||
      authoritativeCents < MIN_SAFE_CENTS
    ) {
      throw new RangeError('Analytics data contains an unsafe monetary value');
    }
    return Number(authoritativeCents) / 100;
  }

  return checkedFiniteNumber(legacyAmount);
}

function checkedFiniteNumber(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError('Analytics data contains an invalid number');
  }
  return value;
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

function analyticsTimestampBound(
  timestamp?: Timestamp
): AnalyticsTimestampBound | null {
  if (!timestamp) {
    return null;
  }

  if (
    timestamp.seconds < MIN_TIMESTAMP_SECONDS ||
    timestamp.seconds > MAX_TIMESTAMP_SECONDS
  ) {
    return null;
  }

  const seconds = Number(timestamp.seconds);
  const nanos = timestamp.nanos;
  if (
    !Number.isSafeInteger(seconds) ||
    !Number.isInteger(nanos) ||
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
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return Object.freeze({
    seconds: timestamp.seconds,
    nanos,
  });
}

function timestampMilliseconds(timestamp?: Timestamp): number | null {
  const bound = analyticsTimestampBound(timestamp);
  if (!bound) {
    return null;
  }

  return Number(bound.seconds) * 1_000 + bound.nanos / 1_000_000;
}

export function analyticsTimestampDate(timestamp?: Timestamp): Date | null {
  const milliseconds = timestampMilliseconds(timestamp);
  return milliseconds === null ? null : new Date(milliseconds);
}

function timestampDateOrEpoch(timestamp?: Timestamp): Date {
  return analyticsTimestampDate(timestamp) ?? new Date(EPOCH_MILLISECONDS);
}

function strictUtcCalendarDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new RangeError('Analytics data contains an invalid date');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) {
    throw new RangeError('Analytics data contains an invalid date');
  }

  const date = new Date(EPOCH_MILLISECONDS);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new RangeError('Analytics data contains an invalid date');
  }
  return date;
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

function signedWaterfallAmount(
  type: WaterfallBar['type'],
  amount: number
): number {
  if (type !== 'expense' && type !== 'tax') return amount;
  return amount === 0 ? 0 : -amount;
}

function waterfallDisplayLabel(
  label: string,
  type: WaterfallBar['type']
): string {
  const trimmed = label.trim();
  if (type !== 'expense' || !trimmed.startsWith('EXPENSE_CATEGORY_')) {
    return trimmed || 'Untitled step';
  }

  const category = trimmed.replace(/^EXPENSE_CATEGORY_/, '');
  return category
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Other';
}

export function mapAnalyticsOverviewResponse(
  response: GetAnalyticsOverviewResponse
): AnalyticsOverviewData {
  return {
    currentStart: analyticsTimestampDate(response.currentStart),
    currentEnd: analyticsTimestampDate(response.currentEnd),
    previousStart: analyticsTimestampDate(response.previousStart),
    previousEnd: analyticsTimestampDate(response.previousEnd),
    currentStartTimestamp: analyticsTimestampBound(response.currentStart),
    currentEndTimestamp: analyticsTimestampBound(response.currentEnd),
    previousStartTimestamp: analyticsTimestampBound(response.previousStart),
    previousEndTimestamp: analyticsTimestampBound(response.previousEnd),
    currentIncome: checkedCentsToDollars(response.currentIncomeCents),
    currentExpense: checkedCentsToDollars(response.currentExpenseCents),
    currentNet: checkedCentsToDollars(response.currentNetCents),
    previousIncome: checkedCentsToDollars(response.previousIncomeCents),
    previousExpense: checkedCentsToDollars(response.previousExpenseCents),
    previousNet: checkedCentsToDollars(response.previousNetCents),
    savingsRate: checkedFiniteNumber(response.savingsRatePercent),
    hasSavingsRate: response.hasSavingsRate,
    incomeChange: checkedFiniteNumber(response.incomeChangePercent),
    hasIncomeChange: response.hasIncomeChange,
    expenseChange: checkedFiniteNumber(response.expenseChangePercent),
    hasExpenseChange: response.hasExpenseChange,
    largestCategory: analyticsCategoryLabel(response.largestCategory),
    largestCategoryAmount: checkedCentsToDollars(
      response.largestCategoryAmountCents
    ),
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
      const currentValue = checkedCentsToDollars(
        category.currentAmountCents,
        category.currentAmount
      );
      const previousValue = checkedCentsToDollars(
        category.previousAmountCents,
        category.previousAmount
      );
      const budgetValue = checkedCentsToDollars(
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
      allowance: checkedCentsToDollars(budget.allowanceCents),
      currentSpend: checkedCentsToDollars(budget.currentSpendCents),
    })),
  };
}

function mapTrendPoint(point: TimeSeriesDataPoint): TimeSeriesDataPoint {
  return {
    ...point,
    value: checkedCentsToDollars(point.valueCents, point.value),
  };
}

export function mapSpendingTrendsResponse(
  response: GetSpendingTrendsResponse
) {
  return {
    expenseSeries: response.expenseSeries.map(mapTrendPoint),
    incomeSeries: response.incomeSeries.map(mapTrendPoint),
    trendSlope: checkedFiniteNumber(response.trendSlope),
    trendRSquared: checkedFiniteNumber(response.trendRSquared),
  };
}

function mapAnomaly(anomaly: SpendingAnomaly) {
  return {
    id: anomaly.id,
    expenseId: anomaly.expenseId,
    description: anomaly.description,
    amount: checkedCentsToDollars(anomaly.amountCents, anomaly.amount),
    category: analyticsCategoryLabel(anomaly.category),
    date: timestampDateOrEpoch(anomaly.date),
    zScore: checkedFiniteNumber(anomaly.zScore),
    expectedAmount: checkedCentsToDollars(
      anomaly.expectedAmountCents,
      anomaly.expectedAmount
    ),
    expectedLowerAmount: checkedCentsToDollars(anomaly.expectedLowerCents),
    expectedUpperAmount: checkedCentsToDollars(anomaly.expectedUpperCents),
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
          expectedLowerAmount: primary.expectedLowerAmount,
          expectedUpperAmount: primary.expectedUpperAmount,
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
    totalAnomalousSpend: checkedCentsToDollars(
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
    date: strictUtcCalendarDate(point.date),
    predicted: checkedCentsToDollars(point.predictedCents, point.predicted),
    lowerBound: checkedCentsToDollars(
      point.lowerBoundCents,
      point.lowerBound
    ),
    upperBound: checkedCentsToDollars(
      point.upperBoundCents,
      point.upperBound
    ),
    hasBounds,
    isRecurring: point.isRecurring,
  };
}

function mapHistoryPoint(point: TimeSeriesDataPoint): ForecastHistoryPoint {
  strictUtcCalendarDate(point.date);
  return {
    date: point.date,
    label: point.label,
    value: checkedCentsToDollars(point.valueCents, point.value),
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
    data: response.entries.map((entry) => {
      const type = waterfallTypeLabel(entry.entryType);
      const rawAmount = checkedCentsToDollars(
        entry.amountCents,
        entry.amount
      );

      return {
        label: waterfallDisplayLabel(entry.label, type),
        amount: signedWaterfallAmount(type, rawAmount),
        type,
        runningTotal: checkedCentsToDollars(
          entry.runningTotalCents,
          entry.runningTotal
        ),
        color: waterfallColor(entry.entryType),
      };
    }),
    periodLabel: response.periodLabel,
  };
}
