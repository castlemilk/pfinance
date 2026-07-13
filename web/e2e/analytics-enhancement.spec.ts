import {
  expect,
  test,
  type Page,
  type Route,
} from '@playwright/test';

const CONNECT_METHODS = [
  'GetAnalyticsOverview',
  'GetDailyAggregates',
  'GetSpendingTrends',
  'ListExpenses',
  'GetCategoryComparison',
  'DetectAnomalies',
  'GetCashFlowForecast',
  'GetWaterfallData',
  'GetExtractionMetrics',
  'GetGroupSummary',
] as const;

type ConnectMethod = (typeof CONNECT_METHODS)[number];
type FixtureMode = 'success' | 'empty' | 'error';

type FixtureController = {
  requests: Record<ConnectMethod, Record<string, unknown>[]>;
  overviewMode: FixtureMode;
  anomalyMode: 'success' | 'insufficient';
  overviewDelayMs: number;
};

const controllers = new WeakMap<Page, FixtureController>();

const analyticsOverview = {
  currentStart: '2026-05-01T00:00:00Z',
  currentEnd: '2026-05-31T23:59:59Z',
  previousStart: '2026-04-01T00:00:00Z',
  previousEnd: '2026-04-30T23:59:59Z',
  currentIncomeCents: '620000',
  currentExpenseCents: '420000',
  currentNetCents: '200000',
  previousIncomeCents: '580000',
  previousExpenseCents: '350000',
  previousNetCents: '230000',
  savingsRatePercent: 32.3,
  hasSavingsRate: true,
  incomeChangePercent: 6.9,
  hasIncomeChange: true,
  expenseChangePercent: 20,
  hasExpenseChange: true,
  largestCategory: 'EXPENSE_CATEGORY_FOOD',
  largestCategoryAmountCents: '140000',
  currentTransactionCount: 18,
  previousTransactionCount: 15,
  hasCurrentData: true,
};

const emptyAnalyticsOverview = {
  ...analyticsOverview,
  currentIncomeCents: '0',
  currentExpenseCents: '0',
  currentNetCents: '0',
  savingsRatePercent: 0,
  hasSavingsRate: false,
  largestCategory: 'EXPENSE_CATEGORY_UNSPECIFIED',
  largestCategoryAmountCents: '0',
  currentTransactionCount: 0,
  hasCurrentData: false,
};

const spendingTrends = {
  expenseSeries: [
    { date: '2026-04-20', valueCents: '10000', label: '20 Apr' },
    { date: '2026-04-27', valueCents: '14000', label: '27 Apr' },
    { date: '2026-05-04', valueCents: '9000', label: '4 May' },
  ],
  incomeSeries: [
    { date: '2026-04-20', valueCents: '50000', label: '20 Apr' },
    { date: '2026-04-27', valueCents: '50000', label: '27 Apr' },
    { date: '2026-05-04', valueCents: '50000', label: '4 May' },
  ],
  trendSlope: -5,
  trendRSquared: 0.73,
};

const anomalySuccess = {
  anomalies: [
    {
      id: 'anomaly-1',
      expenseId: 'anomaly-expense-1',
      description: 'Unexpected grocery shop',
      amountCents: '26500',
      category: 'EXPENSE_CATEGORY_FOOD',
      date: '2026-05-03T10:00:00Z',
      zScore: 2.8,
      expectedAmountCents: '9000',
      anomalyType: 'ANOMALY_TYPE_AMOUNT_OUTLIER',
      severity: 'ANOMALY_SEVERITY_HIGH',
      expectedLowerCents: '6500',
      expectedUpperCents: '12000',
      hasExpectedRange: true,
    },
  ],
  totalAnomalies: 1,
  anomalousSpendTotalCents: '26500',
  topAnomalyCategory: 'Food',
  analyzedExpenseCount: 24,
  eligibleCategoryCount: 1,
  minimumCategorySample: 8,
  hasSufficientHistory: true,
  categoryCoverage: [
    {
      category: 'EXPENSE_CATEGORY_FOOD',
      sampleCount: 12,
      hasSufficientHistory: true,
    },
    {
      category: 'EXPENSE_CATEGORY_TRANSPORTATION',
      sampleCount: 4,
      hasSufficientHistory: false,
    },
  ],
};

const anomalyInsufficient = {
  anomalies: [],
  totalAnomalies: 0,
  anomalousSpendTotalCents: '0',
  topAnomalyCategory: '',
  analyzedExpenseCount: 4,
  eligibleCategoryCount: 0,
  minimumCategorySample: 8,
  hasSufficientHistory: false,
  categoryCoverage: [
    {
      category: 'EXPENSE_CATEGORY_FOOD',
      sampleCount: 4,
      hasSufficientHistory: false,
    },
  ],
};

function connectPattern(method: ConnectMethod) {
  return `**/pfinance.v1.FinanceService/${method}`;
}

function createController(): FixtureController {
  return {
    requests: Object.fromEntries(
      CONNECT_METHODS.map((method) => [method, []])
    ) as FixtureController['requests'],
    overviewMode: 'success',
    anomalyMode: 'success',
    overviewDelayMs: 0,
  };
}

function controllerFor(page: Page) {
  const controller = controllers.get(page);
  if (!controller) {
    throw new Error('Personal analytics fixtures were not installed');
  }
  return controller;
}

function categoryTrendExpenseRequests(controller: FixtureController) {
  return controller.requests.ListExpenses.filter(
    (request) => request.pageSize === 10_000
  );
}

async function fulfillConnect(
  route: Route,
  body: Record<string, unknown>,
  status = 200
) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    headers: {
      'connect-protocol-version': '1',
    },
    body: JSON.stringify(body),
  });
}

async function fulfillConnectError(route: Route, message: string) {
  await fulfillConnect(route, { code: 'internal', message }, 500);
}

async function requestBody(route: Route): Promise<Record<string, unknown>> {
  try {
    return (await route.request().postDataJSON()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function recordRequest(
  controller: FixtureController,
  method: ConnectMethod,
  route: Route
) {
  controller.requests[method].push(await requestBody(route));
}

async function installPersonalAnalyticsFixtures(
  page: Page,
  controller: FixtureController
) {
  await page.route(connectPattern('GetAnalyticsOverview'), async (route) => {
    await recordRequest(controller, 'GetAnalyticsOverview', route);
    if (controller.overviewDelayMs > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, controller.overviewDelayMs)
      );
    }
    if (controller.overviewMode === 'error') {
      await fulfillConnectError(route, 'Analytics fixture failed');
      return;
    }
    await fulfillConnect(
      route,
      controller.overviewMode === 'empty'
        ? emptyAnalyticsOverview
        : analyticsOverview
    );
  });

  await page.route(connectPattern('GetDailyAggregates'), async (route) => {
    await recordRequest(controller, 'GetDailyAggregates', route);
    await fulfillConnect(route, {
      aggregates: [
        {
          date: '2026-05-01',
          totalAmountCents: '4200',
          transactionCount: 1,
          categoryAmounts: [
            {
              category: 'EXPENSE_CATEGORY_FOOD',
              amountCents: '4200',
              count: 1,
            },
          ],
        },
        {
          date: '2026-05-03',
          totalAmountCents: '1800',
          transactionCount: 2,
          categoryAmounts: [
            {
              category: 'EXPENSE_CATEGORY_TRANSPORTATION',
              amountCents: '1800',
              count: 2,
            },
          ],
        },
      ],
      maxDailyAmountCents: '4200',
    });
  });

  await page.route(connectPattern('GetSpendingTrends'), async (route) => {
    await recordRequest(controller, 'GetSpendingTrends', route);
    await fulfillConnect(route, spendingTrends);
  });

  await page.route(connectPattern('ListExpenses'), async (route) => {
    await recordRequest(controller, 'ListExpenses', route);
    await fulfillConnect(route, {
      expenses: [
        {
          id: 'food-1',
          description: 'Groceries',
          amountCents: '4800',
          category: 'EXPENSE_CATEGORY_FOOD',
          frequency: 'EXPENSE_FREQUENCY_ONCE',
          date: '2026-04-20T10:00:00Z',
        },
        {
          id: 'transport-1',
          description: 'Train',
          amountCents: '2200',
          category: 'EXPENSE_CATEGORY_TRANSPORTATION',
          frequency: 'EXPENSE_FREQUENCY_ONCE',
          date: '2026-04-27T10:00:00Z',
        },
        {
          id: 'shopping-1',
          description: 'Supplies',
          amountCents: '3500',
          category: 'EXPENSE_CATEGORY_SHOPPING',
          frequency: 'EXPENSE_FREQUENCY_ONCE',
          date: '2026-05-04T10:00:00Z',
        },
      ],
      nextPageToken: '',
    });
  });

  await page.route(connectPattern('GetCategoryComparison'), async (route) => {
    await recordRequest(controller, 'GetCategoryComparison', route);
    await fulfillConnect(route, {
      categories: [
        {
          category: 'EXPENSE_CATEGORY_FOOD',
          currentAmountCents: '24000',
          previousAmountCents: '18000',
          budgetAmountCents: '30000',
          changePercent: 33.3,
        },
        {
          category: 'EXPENSE_CATEGORY_TRANSPORTATION',
          currentAmountCents: '9000',
          previousAmountCents: '12000',
          budgetAmountCents: '15000',
          changePercent: -25,
        },
        {
          category: 'EXPENSE_CATEGORY_SHOPPING',
          currentAmountCents: '7500',
          previousAmountCents: '5000',
          budgetAmountCents: '10000',
          changePercent: 50,
        },
      ],
      combinedBudgets: [
        {
          budgetId: 'essentials-budget',
          name: 'Household essentials',
          categories: [
            'EXPENSE_CATEGORY_FOOD',
            'EXPENSE_CATEGORY_TRANSPORTATION',
          ],
          allowanceCents: '50000',
          currentSpendCents: '33000',
        },
      ],
    });
  });

  await page.route(connectPattern('DetectAnomalies'), async (route) => {
    await recordRequest(controller, 'DetectAnomalies', route);
    await fulfillConnect(
      route,
      controller.anomalyMode === 'insufficient'
        ? anomalyInsufficient
        : anomalySuccess
    );
  });

  await page.route(connectPattern('GetCashFlowForecast'), async (route) => {
    await recordRequest(controller, 'GetCashFlowForecast', route);
    await fulfillConnect(route, {
      incomeHistory: [
        { date: '2026-05-01', valueCents: '50000' },
        { date: '2026-05-02', valueCents: '52000' },
      ],
      expenseHistory: [
        { date: '2026-05-01', valueCents: '30000' },
        { date: '2026-05-02', valueCents: '32000' },
      ],
      incomeForecast: [
        { date: '2026-05-06', predictedCents: '53000' },
        { date: '2026-05-07', predictedCents: '54000' },
      ],
      expenseForecast: [
        {
          date: '2026-05-06',
          predictedCents: '34000',
          lowerBoundCents: '28000',
          upperBoundCents: '40000',
        },
        {
          date: '2026-05-07',
          predictedCents: '35000',
          lowerBoundCents: '29000',
          upperBoundCents: '42000',
        },
      ],
      netForecast: [
        {
          date: '2026-05-06',
          predictedCents: '19000',
          lowerBoundCents: '12000',
          upperBoundCents: '25000',
        },
        {
          date: '2026-05-07',
          predictedCents: '19000',
          lowerBoundCents: '12000',
          upperBoundCents: '26000',
        },
      ],
    });
  });

  await page.route(connectPattern('GetWaterfallData'), async (route) => {
    await recordRequest(controller, 'GetWaterfallData', route);
    await fulfillConnect(route, {
      entries: [
        {
          label: 'Gross income',
          amountCents: '620000',
          entryType: 'WATERFALL_ENTRY_TYPE_INCOME',
          runningTotalCents: '620000',
        },
        {
          label: 'Food',
          amountCents: '140000',
          entryType: 'WATERFALL_ENTRY_TYPE_EXPENSE',
          runningTotalCents: '480000',
        },
        {
          label: 'Period balance',
          amountCents: '200000',
          entryType: 'WATERFALL_ENTRY_TYPE_SAVINGS',
          runningTotalCents: '200000',
        },
      ],
      periodLabel: 'May 2026',
    });
  });

  await page.route(connectPattern('GetExtractionMetrics'), async (route) => {
    await recordRequest(controller, 'GetExtractionMetrics', route);
    await fulfillConnect(route, {
      totalExtractions: 2,
      totalTransactions: 12,
      totalCorrections: 1,
      correctionRate: 0.0833,
      averageConfidence: 0.91,
      correctionsByField: {
        CORRECTION_FIELD_TYPE_AMOUNT: 1,
      },
      correctionsByCategory: {
        EXPENSE_CATEGORY_FOOD: 1,
      },
      recentEvents: [
        {
          id: 'extraction-event-1',
          method: 'EXTRACTION_METHOD_GEMINI',
          transactionCount: 6,
          acceptedCount: 5,
          rejectedCount: 0,
          correctedCount: 1,
          overallConfidence: 0.91,
          processingTimeMs: 840,
          documentType: 'DOCUMENT_TYPE_RECEIPT',
          createdAt: '2026-05-02T11:00:00Z',
        },
      ],
    });
  });

  // A personal workspace must never unlock its group-only settlement hook.
  await page.route(connectPattern('GetGroupSummary'), async (route) => {
    await recordRequest(controller, 'GetGroupSummary', route);
    await fulfillConnect(route, {
      memberBalances: [],
      totalIncomeCents: '0',
      totalExpensesCents: '0',
      unsettledAmountCents: '0',
      unsettledExpenseCount: 0,
    });
  });
}

async function openPersonalAnalytics(page: Page) {
  await page.goto('/personal/analytics', { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('heading', { level: 1, name: 'Personal analytics' })
  ).toBeVisible({ timeout: 20_000 });
}

async function expectNoPageOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const root = document.documentElement;
        return root.scrollWidth <= root.clientWidth + 1;
      })
    )
    .toBe(true);
}

async function expectActiveTabInsideNavigation(page: Page, name: string) {
  const tab = page.getByRole('tab', { name });
  await expect(tab).toHaveAttribute('data-state', 'active');
  await expect
    .poll(() =>
      tab.evaluate((element) => {
        const list = element.closest('[role="tablist"]');
        if (!list) return false;
        const trigger = element.getBoundingClientRect();
        const viewport = list.getBoundingClientRect();
        return (
          trigger.left >= viewport.left - 1 &&
          trigger.right <= viewport.right + 1
        );
      })
    )
    .toBe(true);
}

test.describe('Personal analytics enhancement', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const fixedNow = new Date('2026-05-05T12:00:00.000Z').getTime();
      const RealDate = Date;

      class FixedDate extends RealDate {
        // Preserve every native Date constructor overload while fixing zero-arg calls.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      window.localStorage.setItem('pfinance-admin-mode', 'true');
      window.localStorage.setItem(
        'pfinance-impersonated-user',
        JSON.stringify({
          uid: 'analytics-pro-user',
          email: 'analytics-pro-user@debug.local',
          displayName: 'Analytics Pro User',
          photoURL: null,
        })
      );
    });

    const controller = createController();
    controllers.set(page, controller);
    await installPersonalAnalyticsFixtures(page, controller);
  });

  test('personal analytics supports a decision-first journey', async ({
    page,
  }) => {
    const fixture = controllerFor(page);
    await openPersonalAnalytics(page);

    await expect(page.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
      'data-state',
      'active',
      { timeout: 15_000 }
    );
    await expect(page.getByRole('region', { name: 'Current period summary' }))
      .toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Largest spending driver')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Food' })).toBeVisible();

    await expect.poll(() => fixture.requests.GetAnalyticsOverview.length)
      .toBeGreaterThan(0);
    await expect.poll(() => fixture.requests.GetSpendingTrends.length)
      .toBeGreaterThan(0);
    await expect.poll(() => fixture.requests.DetectAnomalies.length)
      .toBeGreaterThan(0);
    await expect.poll(() => fixture.requests.GetWaterfallData.length)
      .toBeGreaterThan(0);

    expect(fixture.requests.GetDailyAggregates).toHaveLength(0);
    expect(categoryTrendExpenseRequests(fixture)).toHaveLength(0);
    expect(fixture.requests.GetCategoryComparison).toHaveLength(0);
    expect(fixture.requests.GetCashFlowForecast).toHaveLength(0);
    expect(fixture.requests.GetExtractionMetrics).toHaveLength(0);
    expect(fixture.requests.GetGroupSummary).toHaveLength(0);

    const foodLink = page.getByRole('link', {
      name: 'Review Food spending',
    }).first();
    await expect(foodLink).toHaveAttribute(
      'href',
      '/personal/expenses/?category=food&from=2026-05-01&to=2026-05-31'
    );
    await expect(page.getByRole('link', { name: 'Review expense' }))
      .toHaveAttribute(
        'href',
        '/personal/expenses/?expenseId=anomaly-expense-1'
      );

    await page
      .getByRole('button', {
        name: 'Show Spending trend values data table',
      })
      .click();
    await expect(
      page.getByRole('table', { name: 'Spending trend values' })
    ).toBeVisible();

    const overviewRequests = fixture.requests.GetAnalyticsOverview.length;
    await page.getByLabel('Analytics period').selectOption('quarter');
    await expect.poll(() => fixture.requests.GetAnalyticsOverview.length)
      .toBeGreaterThan(overviewRequests);
    expect(fixture.requests.GetAnalyticsOverview.at(-1)).toMatchObject({
      period: 'ANALYTICS_PERIOD_QUARTER',
    });
    await expect(page.getByRole('region', { name: 'Current period summary' }))
      .toBeVisible();

    await page.getByRole('tab', { name: 'Spending' }).click();
    await expect(
      page.getByRole('heading', { name: 'Spending patterns' })
    ).toBeVisible();
    await expect.poll(() => fixture.requests.GetDailyAggregates.length)
      .toBeGreaterThan(0);
    await expect.poll(() => categoryTrendExpenseRequests(fixture).length)
      .toBeGreaterThan(0);

    await page.getByRole('tab', { name: 'Categories' }).click();
    await expect(
      page.getByRole('heading', { name: 'Category comparison' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Combined budget context' })
    ).toBeVisible();
    await expect(page.getByText('Household essentials')).toBeVisible();
    await expect.poll(() => fixture.requests.GetCategoryComparison.length)
      .toBeGreaterThan(0);

    await page.getByRole('tab', { name: 'Attention' }).click();
    await expect(
      page.getByRole('heading', { name: 'Spending attention' })
    ).toBeVisible();
    await expect(page.getByRole('slider', { name: 'Sensitivity' }))
      .toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Unexpected grocery shop' })
    ).toBeVisible();

    await page.getByRole('tab', { name: 'Forecast' }).click();
    await expect(
      page.getByRole('heading', { name: 'Cash flow forecast' })
    ).toBeVisible();
    await expect(
      page.getByRole('table', {
        name: 'Cash flow history and forecast values',
      })
    ).toBeHidden();
    await expect.poll(() => fixture.requests.GetCashFlowForecast.length)
      .toBeGreaterThan(0);

    await page.getByRole('tab', { name: 'Data Quality' }).click();
    await expect(page.getByRole('heading', { name: 'Data quality' }))
      .toBeVisible();
    await expect(page.getByLabel('Review quality').getByText('91.0%'))
      .toBeVisible();
    await expect.poll(() => fixture.requests.GetExtractionMetrics.length)
      .toBeGreaterThan(0);

    expect(fixture.requests.GetGroupSummary).toHaveLength(0);
  });

  test('analytics remains reachable without page overflow on narrow screens', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await openPersonalAnalytics(page);

    const views = [
      ['Overview', 'Current period summary'],
      ['Spending', 'Spending patterns'],
      ['Categories', 'Category comparison'],
      ['Attention', 'Spending attention'],
      ['Forecast', 'Cash flow forecast'],
      ['Data Quality', 'Data quality'],
    ] as const;

    for (const [tabName, visibleName] of views) {
      await page.getByRole('tab', { name: tabName }).click();
      if (tabName === 'Overview') {
        await expect(
          page.getByRole('region', { name: visibleName })
        ).toBeVisible();
      } else {
        await expect(page.getByRole('heading', { name: visibleName }))
          .toBeVisible();
      }
      await expectActiveTabInsideNavigation(page, tabName);
      await expect(page.getByLabel('Analytics period')).toBeVisible();
      await expectNoPageOverflow(page);

      if (tabName === 'Spending') {
        await expect
          .poll(() =>
            page
              .getByTestId('spending-view-header')
              .evaluate((element) => getComputedStyle(element).flexDirection)
          )
          .toBe('column');
      }
    }
  });

  test('personal analytics keyboard and states remain actionable', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const fixture = controllerFor(page);
    await openPersonalAnalytics(page);
    await expect(page.getByRole('region', { name: 'Current period summary' }))
      .toBeVisible({ timeout: 15_000 });

    const period = page.getByLabel('Analytics period');
    await period.focus();
    await expect(period).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('tab', { name: 'Overview' })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Spending' })).toHaveAttribute(
      'data-state',
      'active'
    );
    await expect(
      page.getByRole('heading', { name: 'Spending patterns' })
    ).toBeVisible();

    const dataAlternative = page
      .getByRole('button', {
        name: 'Show Daily spending values data table',
      });
    await dataAlternative.focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('table', { name: 'Daily spending values' })
    ).toBeVisible();

    const attentionTab = page.getByRole('tab', { name: 'Attention' });
    await attentionTab.focus();
    await page.keyboard.press('Enter');
    const slider = page.getByRole('slider', { name: 'Sensitivity' });
    await slider.focus();
    await expect(slider).toHaveAttribute('aria-valuenow', '0.5');
    await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveAttribute('aria-valuenow', '0.6');
    await expect.poll(() => fixture.requests.DetectAnomalies.at(-1))
      .toMatchObject({ sensitivity: 0.6 });

    fixture.anomalyMode = 'insufficient';
    const anomalyRequestsBeforeInsufficient =
      fixture.requests.DetectAnomalies.length;
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => fixture.requests.DetectAnomalies.length)
      .toBeGreaterThan(anomalyRequestsBeforeInsufficient);
    await expect.poll(() => fixture.requests.DetectAnomalies.at(-1))
      .toMatchObject({ sensitivity: 0.7 });
    await expect(
      page.getByRole('heading', {
        name: 'More history is needed to check unusual spending',
      })
    ).toBeVisible();
    await expect(page.getByRole('list', { name: 'Categories needing history' }))
      .toBeVisible();

    fixture.overviewDelayMs = 2_000;
    await page.getByRole('tab', { name: 'Overview' }).click();
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: 'Loading analytics overview' })
    ).toBeVisible();
    fixture.overviewDelayMs = 0;
    await expect(page.getByRole('region', { name: 'Current period summary' }))
      .toBeVisible();

    fixture.overviewMode = 'empty';
    await period.selectOption('year');
    await expect(
      page.getByRole('heading', { name: 'No activity for this period' })
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Add an expense' }))
      .toBeVisible();

    fixture.overviewMode = 'error';
    await period.selectOption('quarter');
    await expect(
      page.getByRole('heading', { name: 'Analytics could not load' })
    ).toBeVisible();
    await expect(page.getByText('Analytics fixture failed')).toBeVisible();

    fixture.overviewMode = 'success';
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('region', { name: 'Current period summary' }))
      .toBeVisible();

  });

  test('analytics preserves palettes and reduced motion', async ({ page }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => {
      if (!window.localStorage.getItem('pfinance-theme')) {
        window.localStorage.setItem('pfinance-theme', 'light');
      }
      if (!window.localStorage.getItem('pfinance-palette')) {
        window.localStorage.setItem('pfinance-palette', 'amber-terminal');
      }
    });
    await openPersonalAnalytics(page);

    const primaryColor = () =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue('--primary')
          .trim()
      );

    await expect(page.locator('html')).toHaveClass(/light/);
    await expect(page.locator('html')).not.toHaveAttribute('data-palette');
    const amberLight = await primaryColor();
    expect(amberLight).not.toBe('');

    await page.evaluate(() => {
      window.localStorage.setItem('pfinance-theme', 'dark');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveClass(/dark/);
    const amberDark = await primaryColor();
    expect(amberDark).not.toBe(amberLight);

    await page.evaluate(() => {
      window.localStorage.setItem('pfinance-theme', 'light');
      window.localStorage.setItem('pfinance-palette', 'retro-chic');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveClass(/light/);
    await expect(page.locator('html')).toHaveAttribute(
      'data-palette',
      'retro-chic'
    );
    const retroLight = await primaryColor();
    expect(retroLight).not.toBe(amberLight);

    await page.getByLabel('Analytics period').selectOption('quarter');
    await page.getByRole('tab', { name: 'Forecast' }).click();
    await expect(
      page.getByRole('heading', { name: 'Cash flow forecast' })
    ).toBeVisible();

    const reducedMotionStyles = await page.evaluate(() => {
      const periodSelect = document.querySelector<HTMLSelectElement>(
        '[aria-label="Analytics period"]'
      );
      const activeTab = document.querySelector<HTMLElement>(
        '[role="tab"][data-state="active"]'
      );
      const activePanel = document.querySelector<HTMLElement>(
        '[role="tabpanel"][data-state="active"]'
      );
      if (!periodSelect || !activeTab || !activePanel) return null;
      return {
        periodTransition: getComputedStyle(periodSelect).transitionDuration,
        tabTransition: getComputedStyle(activeTab).transitionDuration,
        panelAnimation: getComputedStyle(activePanel).animationName,
      };
    });
    expect(reducedMotionStyles).not.toBeNull();
    expect(Number.parseFloat(reducedMotionStyles!.periodTransition))
      .toBeLessThanOrEqual(0.001);
    expect(Number.parseFloat(reducedMotionStyles!.tabTransition))
      .toBeLessThanOrEqual(0.001);
    expect(reducedMotionStyles!.panelAnimation).toBe('none');
  });
});
