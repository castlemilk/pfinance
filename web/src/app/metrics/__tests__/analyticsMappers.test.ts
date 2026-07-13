import {
  AnomalySeverity,
  AnomalyType,
  ExpenseCategory,
  WaterfallEntryType,
} from '@/gen/pfinance/v1/types_pb';
import type {
  DetectAnomaliesResponse,
  GetAnalyticsOverviewResponse,
  GetCashFlowForecastResponse,
  GetCategoryComparisonResponse,
  GetWaterfallDataResponse,
} from '@/gen/pfinance/v1/finance_service_pb';
import {
  mapAnalyticsOverviewResponse,
  mapAnomalyResponse,
  mapCashFlowForecastResponse,
  mapCategoryComparisonResponse,
  mapWaterfallResponse,
} from '../analyticsMappers';

function response<T>(value: unknown): T {
  return value as T;
}

describe('analytics response mappers', () => {
  describe('mapAnalyticsOverviewResponse', () => {
    it('maps bounds with nanos, authoritative cents, and explicit presence flags', () => {
      const source = response<GetAnalyticsOverviewResponse>({
        currentStart: { seconds: BigInt(1_700_000_000), nanos: 250_000_000 },
        currentEnd: { seconds: BigInt(1_700_086_400), nanos: 500_000_000 },
        previousStart: { seconds: BigInt(1_699_913_600), nanos: 0 },
        currentIncomeCents: BigInt(12_345),
        currentExpenseCents: BigInt(0),
        currentNetCents: BigInt(2_345),
        previousIncomeCents: BigInt(10_000),
        previousExpenseCents: BigInt(8_000),
        previousNetCents: BigInt(0),
        savingsRatePercent: 19,
        hasSavingsRate: true,
        incomeChangePercent: 23.45,
        hasIncomeChange: true,
        expenseChangePercent: 0,
        hasExpenseChange: false,
        largestCategory: ExpenseCategory.FOOD,
        largestCategoryAmountCents: BigInt(6_789),
        currentTransactionCount: 8,
        previousTransactionCount: 5,
        hasCurrentData: true,
      });

      const mapped = mapAnalyticsOverviewResponse(source);

      expect(mapped).toMatchObject({
        currentIncome: 123.45,
        currentExpense: 0,
        currentNet: 23.45,
        previousIncome: 100,
        previousExpense: 80,
        previousNet: 0,
        savingsRate: 19,
        hasSavingsRate: true,
        incomeChange: 23.45,
        hasIncomeChange: true,
        expenseChange: 0,
        hasExpenseChange: false,
        largestCategory: 'Food',
        largestCategoryAmount: 67.89,
        currentTransactionCount: 8,
        previousTransactionCount: 5,
        hasCurrentData: true,
      });
      expect(mapped.currentStart?.getTime()).toBe(1_700_000_000_250);
      expect(mapped.currentEnd?.getTime()).toBe(1_700_086_400_500);
      expect(mapped.previousStart?.getTime()).toBe(1_699_913_600_000);
      expect(mapped.previousEnd).toBeNull();
      expect(mapped.currentStart).not.toBe(source.currentStart);
    });

    it('returns null for invalid timestamp bounds instead of using a changing current time', () => {
      const mapped = mapAnalyticsOverviewResponse(
        response<GetAnalyticsOverviewResponse>({
          currentStart: { seconds: BigInt('999999999999999999'), nanos: 0 },
          currentIncomeCents: BigInt(0),
          currentExpenseCents: BigInt(0),
          currentNetCents: BigInt(0),
          previousIncomeCents: BigInt(0),
          previousExpenseCents: BigInt(0),
          previousNetCents: BigInt(0),
          largestCategoryAmountCents: BigInt(0),
        })
      );

      expect(mapped.currentStart).toBeNull();
      expect(mapped.currentEnd).toBeNull();
    });
  });

  describe('mapCategoryComparisonResponse', () => {
    it('maps per-axis and combined budgets cents-first without mutating the response', () => {
      const source = response<GetCategoryComparisonResponse>({
        categories: [
          {
            category: ExpenseCategory.FOOD,
            currentAmount: 999,
            currentAmountCents: BigInt(12_500),
            previousAmount: 80,
            previousAmountCents: BigInt(0),
            budgetAmount: 999,
            budgetAmountCents: BigInt(20_000),
          },
        ],
        combinedBudgets: [
          {
            budgetId: 'essentials',
            name: 'Essentials',
            categories: [ExpenseCategory.FOOD, ExpenseCategory.HOUSING],
            allowanceCents: BigInt(50_000),
            currentSpendCents: BigInt(21_250),
          },
        ],
      });
      const sourceCategories = [...source.combinedBudgets[0].categories];

      const mapped = mapCategoryComparisonResponse(source);

      expect(mapped.categories).toEqual([
        {
          category: 'Food',
          currentValue: 125,
          previousValue: 80,
          budgetValue: 200,
          maxValue: 200,
        },
      ]);
      expect(mapped.combinedBudgets).toEqual([
        {
          id: 'essentials',
          name: 'Essentials',
          categories: ['Food', 'Housing'],
          allowance: 500,
          currentSpend: 212.5,
        },
      ]);
      expect(source.combinedBudgets[0].categories).toEqual(sourceCategories);
    });
  });

  describe('mapAnomalyResponse', () => {
    it('maps ranges and coverage and selects attention by severity, amount, then expense ID', () => {
      const source = response<DetectAnomaliesResponse>({
        anomalies: [
          {
            id: 'low',
            expenseId: 'expense-z',
            description: 'Large but low',
            amount: 900,
            amountCents: BigInt(90_000),
            category: ExpenseCategory.SHOPPING,
            date: { seconds: BigInt(100), nanos: 500_000_000 },
            zScore: 1,
            expectedAmount: 100,
            expectedAmountCents: BigInt(10_000),
            expectedLowerCents: BigInt(0),
            expectedUpperCents: BigInt(0),
            hasExpectedRange: false,
            anomalyType: AnomalyType.CATEGORY_SPIKE,
            severity: AnomalySeverity.LOW,
          },
          {
            id: 'high-b',
            expenseId: 'expense-b',
            description: 'High B',
            amount: 999,
            amountCents: BigInt(5_000),
            category: ExpenseCategory.FOOD,
            date: undefined,
            zScore: 3,
            expectedAmount: 999,
            expectedAmountCents: BigInt(1_500),
            expectedLowerCents: BigInt(1_000),
            expectedUpperCents: BigInt(2_000),
            hasExpectedRange: true,
            anomalyType: AnomalyType.AMOUNT_OUTLIER,
            severity: AnomalySeverity.HIGH,
          },
          {
            id: 'high-a',
            expenseId: 'expense-a',
            description: 'High A',
            amount: 50,
            amountCents: BigInt(0),
            category: ExpenseCategory.FOOD,
            date: undefined,
            zScore: 3,
            expectedAmount: 15,
            expectedAmountCents: BigInt(0),
            expectedLowerCents: BigInt(1_000),
            expectedUpperCents: BigInt(2_000),
            hasExpectedRange: true,
            anomalyType: AnomalyType.AMOUNT_OUTLIER,
            severity: AnomalySeverity.HIGH,
          },
        ],
        anomalousSpendTotal: 999,
        anomalousSpendTotalCents: BigInt(100_000),
        topAnomalyCategory: 'Food',
        analyzedExpenseCount: 42,
        eligibleCategoryCount: 3,
        minimumCategorySample: 5,
        hasSufficientHistory: true,
        categoryCoverage: [
          {
            category: ExpenseCategory.FOOD,
            sampleCount: 12,
            hasSufficientHistory: true,
          },
          {
            category: ExpenseCategory.TRAVEL,
            sampleCount: 2,
            hasSufficientHistory: false,
          },
        ],
      });
      const sourceOrder = source.anomalies.map((anomaly) => anomaly.expenseId);

      const mapped = mapAnomalyResponse(source);

      expect(mapped.data).toHaveLength(3);
      expect(mapped.data[0]).toMatchObject({
        amount: 900,
        expectedLowerAmount: 0,
        expectedUpperAmount: 0,
        hasExpectedRange: false,
      });
      expect(mapped.data[0].date.getTime()).toBe(100_500);
      expect(mapped.data[1].date.getTime()).toBe(0);
      expect(mapped).toMatchObject({
        totalAnomalousSpend: 1000,
        topCategory: 'Food',
        analyzedCount: 42,
        eligibleCount: 3,
        minimumSample: 5,
        hasSufficientHistory: true,
        categoryCoverage: [
          { category: 'Food', sampleCount: 12, hasSufficientHistory: true },
          { category: 'Travel', sampleCount: 2, hasSufficientHistory: false },
        ],
        primaryAttention: {
          expenseId: 'expense-a',
          description: 'High A',
          reason: 'Amount Outlier',
          amount: 50,
          expectedContext: 'Expected range: 10 to 20',
          severity: 'high',
        },
      });
      expect(source.anomalies.map((anomaly) => anomaly.expenseId)).toEqual(
        sourceOrder
      );
    });

    it('omits expected context when the authoritative range flag is false', () => {
      const mapped = mapAnomalyResponse(
        response<DetectAnomaliesResponse>({
          anomalies: [
            {
              id: 'one',
              expenseId: 'expense-one',
              description: 'One',
              amount: 25,
              amountCents: BigInt(0),
              category: ExpenseCategory.OTHER,
              zScore: 2,
              expectedAmount: 10,
              expectedAmountCents: BigInt(0),
              expectedLowerCents: BigInt(900),
              expectedUpperCents: BigInt(1_100),
              hasExpectedRange: false,
              anomalyType: AnomalyType.NEW_MERCHANT,
              severity: AnomalySeverity.MEDIUM,
            },
          ],
          anomalousSpendTotal: 25,
          anomalousSpendTotalCents: BigInt(0),
          categoryCoverage: [],
        })
      );

      expect(mapped.primaryAttention).not.toHaveProperty('expectedContext');
    });
  });

  describe('mapCashFlowForecastResponse', () => {
    it('maps forecast bounds from raw presence and maps history cents-first', () => {
      const mapped = mapCashFlowForecastResponse(
        response<GetCashFlowForecastResponse>({
          incomeForecast: [
            {
              date: '2026-07-14',
              predicted: 999,
              predictedCents: BigInt(12_500),
              lowerBound: 0,
              lowerBoundCents: BigInt(10_000),
              upperBound: 0,
              upperBoundCents: BigInt(15_000),
              isRecurring: true,
            },
          ],
          expenseForecast: [
            {
              date: '2026-07-14',
              predicted: 50,
              predictedCents: BigInt(0),
              lowerBound: 45,
              lowerBoundCents: BigInt(0),
              upperBound: 60,
              upperBoundCents: BigInt(0),
              isRecurring: false,
            },
          ],
          netForecast: [
            {
              date: '2026-07-14',
              predicted: 75,
              predictedCents: BigInt(0),
              lowerBound: 0,
              lowerBoundCents: BigInt(0),
              upperBound: 0,
              upperBoundCents: BigInt(0),
              isRecurring: false,
            },
          ],
          incomeHistory: [
            {
              date: '2026-07-01',
              label: 'Jul 1',
              value: 999,
              valueCents: BigInt(30_000),
            },
          ],
          expenseHistory: [
            {
              date: '2026-07-01',
              label: 'Jul 1',
              value: 125,
              valueCents: BigInt(0),
            },
          ],
        })
      );

      expect(mapped.incomeForecast[0]).toMatchObject({
        predicted: 125,
        lowerBound: 100,
        upperBound: 150,
        hasBounds: true,
        isRecurring: true,
      });
      expect(mapped.expenseForecast[0]).toMatchObject({
        predicted: 50,
        lowerBound: 45,
        upperBound: 60,
        hasBounds: true,
        isRecurring: false,
      });
      expect(mapped.netForecast[0]).toMatchObject({
        predicted: 75,
        lowerBound: 0,
        upperBound: 0,
        hasBounds: false,
      });
      expect(mapped.incomeHistory).toEqual([
        { date: '2026-07-01', label: 'Jul 1', value: 300 },
      ]);
      expect(mapped.expenseHistory).toEqual([
        { date: '2026-07-01', label: 'Jul 1', value: 125 },
      ]);
    });
  });

  describe('mapWaterfallResponse', () => {
    it('preserves the period label and maps bar amounts cents-first', () => {
      const mapped = mapWaterfallResponse(
        response<GetWaterfallDataResponse>({
          periodLabel: 'July 2026',
          entries: [
            {
              label: 'Income',
              amount: 999,
              amountCents: BigInt(50_000),
              entryType: WaterfallEntryType.INCOME,
              runningTotal: 999,
              runningTotalCents: BigInt(50_000),
            },
          ],
        })
      );

      expect(mapped).toEqual({
        data: [
          {
            label: 'Income',
            amount: 500,
            type: 'income',
            runningTotal: 500,
            color: 'var(--chart-2)',
          },
        ],
        periodLabel: 'July 2026',
      });
    });
  });
});
