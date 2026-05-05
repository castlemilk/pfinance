import { expect, test, type Route } from '@playwright/test';

async function fulfillConnect(route: Route, body: Record<string, unknown>) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: {
      'connect-protocol-version': '1',
    },
    body: JSON.stringify(body),
  });
}

test.describe('Advanced Analytics', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const fixedNow = new Date('2026-05-05T12:00:00.000Z').getTime();
      const RealDate = Date;

      class FixedDate extends RealDate {
        constructor(...args: any[]) {
          if (args.length === 0) {
            super(fixedNow);
          } else {
            super(...args);
          }
        }

        static now() {
          return fixedNow;
        }
      }

      window.Date = FixedDate as DateConstructor;
    });

    await page.route('**/pfinance.v1.FinanceService/GetDailyAggregates', async (route) => {
      await fulfillConnect(route, {
        aggregates: [
          {
            date: '2026-05-01',
            totalAmount: 42,
            transactionCount: 1,
            categoryAmounts: [{ category: 1, amount: 42, count: 1 }],
          },
          {
            date: '2026-05-03',
            totalAmount: 18,
            transactionCount: 2,
            categoryAmounts: [{ category: 3, amount: 18, count: 2 }],
          },
        ],
        maxDailyAmount: 42,
      });
    });

    await page.route('**/pfinance.v1.FinanceService/GetSpendingTrends', async (route) => {
      await fulfillConnect(route, {
        expenseSeries: [
          { date: '2026-04-20', value: 100, label: 'Apr 20' },
          { date: '2026-04-27', value: 140, label: 'Apr 27' },
          { date: '2026-05-04', value: 90, label: 'May 04' },
        ],
        incomeSeries: [
          { date: '2026-04-20', value: 500, label: 'Apr 20' },
          { date: '2026-04-27', value: 500, label: 'Apr 27' },
          { date: '2026-05-04', value: 500, label: 'May 04' },
        ],
        trendSlope: -5,
        trendRSquared: 0.73,
      });
    });

    await page.route('**/pfinance.v1.FinanceService/GetCategoryComparison', async (route) => {
      await fulfillConnect(route, {
        categories: [
          { category: 1, currentAmount: 240, previousAmount: 180, changePercent: 33.3 },
          { category: 3, currentAmount: 90, previousAmount: 120, changePercent: -25 },
          { category: 7, currentAmount: 75, previousAmount: 50, changePercent: 50 },
        ],
      });
    });

    await page.route('**/pfinance.v1.FinanceService/DetectAnomalies', async (route) => {
      await fulfillConnect(route, {
        anomalies: [],
        totalAnomalies: 0,
        anomalousSpendTotal: 0,
        topAnomalyCategory: '',
      });
    });

    await page.route('**/pfinance.v1.FinanceService/GetCashFlowForecast', async (route) => {
      await fulfillConnect(route, {
        incomeForecast: [
          { date: '2026-05-05', predicted: 120 },
          { date: '2026-05-06', predicted: 120 },
        ],
        expenseForecast: [
          { date: '2026-05-05', predicted: 40, lowerBound: 20, upperBound: 80 },
          { date: '2026-05-06', predicted: 50, lowerBound: 25, upperBound: 90 },
        ],
        netForecast: [
          { date: '2026-05-05', predicted: 80 },
          { date: '2026-05-06', predicted: 70 },
        ],
      });
    });

    await page.route('**/pfinance.v1.FinanceService/GetWaterfallData', async (route) => {
      await fulfillConnect(route, {
        entries: [
          { label: 'Gross Income', amount: 5000, entryType: 1, runningTotal: 5000 },
          { label: 'Tax', amount: 1000, entryType: 3, runningTotal: 4000 },
          { label: 'Food', amount: 800, entryType: 2, runningTotal: 3200 },
          { label: 'Net Savings', amount: 3200, entryType: 4, runningTotal: 3200 },
        ],
        periodLabel: 'May 2026',
      });
    });

    await page.route('**/pfinance.v1.FinanceService/GetExtractionMetrics', async (route) => {
      await fulfillConnect(route, {
        totalExtractions: 2,
        totalTransactions: 12,
        totalCorrections: 1,
        correctionRate: 0.08,
        averageConfidence: 0.91,
        correctionsByField: { amount: 1 },
        correctionsByCategory: { food: 1 },
        recentEvents: [],
      });
    });
  });

  test('renders every analytics tab with populated chart data', async ({ page }) => {
    await page.goto('/personal/analytics');

    await expect(page.getByText('Spending Heatmap')).toBeVisible();
    await expect(page.getByRole('tabpanel', { name: 'Heatmap' }).getByText('May').first()).toBeVisible();

    await page.getByRole('tab', { name: 'Trends' }).click();
    await expect(page.getByText('Spending Trends')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Category Spend Over Time' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Trend time window' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Category trend category' })).toBeVisible();
    await page.getByRole('combobox', { name: 'Trend time window' }).click();
    await page.getByRole('option', { name: '24 weeks' }).click();
    await expect(page.getByRole('combobox', { name: 'Trend time window' })).toContainText('24 weeks');

    await page.getByRole('tab', { name: 'Categories' }).click();
    await expect(page.getByText('Category Comparison')).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Category comparison time window' })).toBeVisible();
    await page.getByRole('combobox', { name: 'Category comparison time window' }).click();
    await page.getByRole('option', { name: 'Quarter' }).click();
    await expect(page.getByRole('combobox', { name: 'Category comparison time window' })).toContainText('Quarter');
    await expect(page.getByText('No category data available.')).toBeHidden();
    await expect(page.getByText('Food').first()).toBeVisible();

    await page.getByRole('tab', { name: 'Anomalies' }).click();
    await expect(page.getByText('No anomalies detected. Your spending looks normal!')).toBeVisible();

    await page.getByRole('tab', { name: 'Forecast' }).click();
    await expect(page.getByText('Cash Flow Forecast')).toBeVisible();

    await page.getByRole('tab', { name: 'Flow' }).click();
    await expect(page.getByText('Money Flow')).toBeVisible();

    await page.getByRole('tab', { name: 'Extraction' }).click();
    await expect(page.getByText('Extraction Quality')).toBeVisible();
    await expect(page.getByText('91.0%')).toBeVisible();
  });
});
