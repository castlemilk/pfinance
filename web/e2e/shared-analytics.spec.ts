import {
  expect,
  test,
  type Page,
  type Route,
} from '@playwright/test';

const TEST_USER_ID = 'shared-analytics-e2e-user';
const GROUP_A_ID = 'analytics-group-aurora';
const GROUP_A_NAME = 'Aurora Household';
const GROUP_B_ID = 'analytics-group-beacon';
const GROUP_B_NAME = 'Beacon Household';
const DENIED_GROUP_ID = 'analytics-group-denied';
const DENIED_GROUP_NAME = 'Restricted Household';

const GROUP_ANALYTICS_VIEWS = [
  'Overview',
  'Spending',
  'Categories',
  'Attention',
  'Forecast',
] as const;

type ConnectBody = Readonly<{
  groupId?: string;
  period?: number | string;
}>;

type GroupFixture = Readonly<{
  id: string;
  name: string;
  memberUserId: string;
}>;

type RequestObservation = Readonly<{
  method: string;
  body: ConnectBody;
}>;

type SharedFixtureOptions = Readonly<{
  activeGroupId: string;
  groups: readonly GroupFixture[];
  overviewResponse?: (
    body: ConnectBody
  ) => Promise<Record<string, unknown>> | Record<string, unknown>;
  overviewError?: (
    route: Route,
    body: ConnectBody
  ) => Promise<void> | void;
  onRequest?: (observation: RequestObservation) => void;
  onOverviewFulfilled?: (body: ConnectBody) => void;
}>;

function deferred() {
  let resolvePromise: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });

  return { promise, resolve: resolvePromise };
}

function connectMethod(route: Route): string {
  const pathname = new URL(route.request().url()).pathname;
  return pathname.slice(pathname.lastIndexOf('/') + 1);
}

function connectBody(route: Route): ConnectBody {
  try {
    return route.request().postDataJSON() as ConnectBody;
  } catch {
    return {};
  }
}

async function fulfillConnect(
  route: Route,
  body: Record<string, unknown>
) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: {
      'connect-protocol-version': '1',
    },
    body: JSON.stringify(body),
  });
}

async function fulfillPermissionDenied(route: Route, message: string) {
  await route.fulfill({
    status: 403,
    contentType: 'application/json',
    headers: {
      'connect-protocol-version': '1',
    },
    body: JSON.stringify({
      code: 'permission_denied',
      message,
    }),
  });
}

function financeGroup({ id, name, memberUserId }: GroupFixture) {
  return {
    id,
    name,
    description: `${name} analytics fixture`,
    ownerId: memberUserId,
    memberIds: [memberUserId],
    members: [
      {
        userId: memberUserId,
        email: `${memberUserId}@debug.local`,
        displayName: 'Shared Analytics Tester',
        role: 4,
        joinedAt: '2026-01-01T00:00:00Z',
      },
    ],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
  };
}

function overviewFixture(groupId: string) {
  if (groupId === GROUP_B_ID) {
    return {
      currentStart: '2026-04-01T00:00:00Z',
      currentEnd: '2026-06-30T23:59:59.999Z',
      previousStart: '2026-01-01T00:00:00Z',
      previousEnd: '2026-03-31T23:59:59.999Z',
      currentIncomeCents: '876543',
      currentExpenseCents: '76543',
      currentNetCents: '800000',
      previousIncomeCents: '700000',
      previousExpenseCents: '100000',
      previousNetCents: '600000',
      savingsRatePercent: 91.27,
      hasSavingsRate: true,
      incomeChangePercent: 25.22,
      hasIncomeChange: true,
      expenseChangePercent: -23.46,
      hasExpenseChange: true,
      largestCategory: 3,
      largestCategoryAmountCents: '54321',
      currentTransactionCount: 8,
      previousTransactionCount: 7,
      hasCurrentData: true,
    };
  }

  return {
    currentStart: '2026-07-01T00:00:00Z',
    currentEnd: '2026-07-31T23:59:59.999Z',
    previousStart: '2026-06-01T00:00:00Z',
    previousEnd: '2026-06-30T23:59:59.999Z',
    currentIncomeCents: '123456',
    currentExpenseCents: '23457',
    currentNetCents: '99999',
    previousIncomeCents: '100000',
    previousExpenseCents: '20000',
    previousNetCents: '80000',
    savingsRatePercent: 81,
    hasSavingsRate: true,
    incomeChangePercent: 23.46,
    hasIncomeChange: true,
    expenseChangePercent: 17.29,
    hasExpenseChange: true,
    largestCategory: 1,
    largestCategoryAmountCents: '11111',
    currentTransactionCount: 4,
    previousTransactionCount: 3,
    hasCurrentData: true,
  };
}

function groupSummaryFixture(groupId: string) {
  if (groupId === GROUP_B_ID) {
    return {
      totalExpensesCents: '76543',
      totalIncomeCents: '876543',
      unsettledExpenseCount: 2,
      unsettledAmountCents: '8888',
      expenseByCategory: [],
      memberBalances: [],
    };
  }

  return {
    totalExpensesCents: '23457',
    totalIncomeCents: '123456',
    unsettledExpenseCount: 1,
    unsettledAmountCents: '7777',
    expenseByCategory: [],
    memberBalances: [],
  };
}

function defaultConnectResponse(method: string, body: ConnectBody) {
  switch (method) {
    case 'GetSubscriptionStatus':
      return { tier: 2, status: 1 };
    case 'ListExpenses':
      return { expenses: [], nextPageToken: '' };
    case 'ListIncomes':
      return { incomes: [], nextPageToken: '' };
    case 'GetTaxConfig':
      return {
        taxConfig: {
          enabled: true,
          country: 1,
          taxRate: 30,
          includeDeductions: true,
        },
      };
    case 'GetSpendingTrends':
      return {
        expenseSeries: [],
        incomeSeries: [],
        trendSlope: 0,
        trendRSquared: 0,
      };
    case 'DetectAnomalies':
      return {
        anomalies: [],
        totalAnomalies: 0,
        anomalousSpendTotalCents: '0',
        analyzedExpenseCount: 0,
        eligibleCategoryCount: 0,
        minimumCategorySample: 10,
        hasSufficientHistory: false,
        categoryCoverage: [],
      };
    case 'GetWaterfallData':
      return { entries: [], periodLabel: 'Fixture period' };
    case 'GetGroupSummary':
      return groupSummaryFixture(body.groupId ?? '');
    case 'GetDailyAggregates':
      return { aggregates: [], maxDailyAmountCents: '0' };
    case 'GetCategoryComparison':
      return { categories: [], combinedBudgets: [] };
    case 'GetCashFlowForecast':
      return {
        incomeForecast: [],
        expenseForecast: [],
        netForecast: [],
        historicalIncome: [],
        historicalExpenses: [],
        historicalNet: [],
      };
    default:
      return {};
  }
}

async function installSharedFixtures(
  page: Page,
  options: SharedFixtureOptions
) {
  await page.addInitScript(
    ({ activeGroupId, userId }) => {
      window.localStorage.setItem('pfinance-admin-mode', 'true');
      window.localStorage.setItem(
        'pfinance-impersonated-user',
        JSON.stringify({
          uid: userId,
          email: `${userId}@debug.local`,
          displayName: 'Shared Analytics Tester',
          photoURL: null,
        })
      );
      window.localStorage.setItem(
        `pfinance-active-group-${userId}`,
        activeGroupId
      );
    },
    { activeGroupId: options.activeGroupId, userId: TEST_USER_ID }
  );

  await page.route(
    '**/pfinance.v1.FinanceService/*',
    async (route) => {
      const method = connectMethod(route);
      const body = connectBody(route);
      options.onRequest?.({ method, body });

      if (method === 'ListGroups') {
        await fulfillConnect(route, {
          groups: options.groups.map(financeGroup),
          nextPageToken: '',
        });
        return;
      }

      if (method === 'GetAnalyticsOverview') {
        if (options.overviewError) {
          await options.overviewError(route, body);
          return;
        }

        const response = options.overviewResponse
          ? await options.overviewResponse(body)
          : overviewFixture(body.groupId ?? '');
        await fulfillConnect(route, response);
        options.onOverviewFulfilled?.(body);
        return;
      }

      await fulfillConnect(route, defaultConnectResponse(method, body));
    }
  );
}

async function gotoSharedAnalytics(page: Page, groupName: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto('/shared/analytics', {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
      await expect(page).toHaveURL(/\/shared\/analytics\/?$/, {
        timeout: 15_000,
      });
      await expect(
        page.getByRole('heading', { level: 1, name: 'Shared Finance' })
      ).toBeVisible({ timeout: 20_000 });
      await expect(
        page.getByRole('button', {
          name: `Active finance group: ${groupName}`,
        })
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        page.getByRole('heading', {
          level: 2,
          name: `${groupName} analytics`,
        })
      ).toBeVisible({ timeout: 30_000 });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const canRetry =
        message.includes('ERR_ABORTED') ||
        message.includes('frame was detached') ||
        message.includes('interrupted by another navigation');
      if (!canRetry || attempt === 2) throw error;
      await page.waitForTimeout(750);
    }
  }
}

async function selectGroup(page: Page, currentName: string, nextName: string) {
  await page
    .getByRole('button', { name: `Active finance group: ${currentName}` })
    .click();
  await page
    .getByRole('menuitemradio', { name: `${nextName}, 1 member` })
    .click();
  await expect(
    page.getByRole('button', { name: `Active finance group: ${nextName}` })
  ).toBeVisible();
}

async function waitForTwoAnimationFrames(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => resolve());
        });
      })
  );
}

test.describe('Shared analytics', () => {
  test.describe.configure({ timeout: 90_000 });

  test('shared analytics isolates active group responses', async ({ page }) => {
    const quarterRequestStarted = deferred();
    const releaseQuarterResponse = deferred();
    const quarterResponseFulfilled = deferred();

    await installSharedFixtures(page, {
      activeGroupId: GROUP_A_ID,
      groups: [
        {
          id: GROUP_A_ID,
          name: GROUP_A_NAME,
          memberUserId: TEST_USER_ID,
        },
        {
          id: GROUP_B_ID,
          name: GROUP_B_NAME,
          memberUserId: TEST_USER_ID,
        },
      ],
      overviewResponse: async (body) => {
        const isDelayedAuroraQuarter =
          body.groupId === GROUP_A_ID &&
          (body.period === 2 ||
            body.period === 'ANALYTICS_PERIOD_QUARTER');
        if (isDelayedAuroraQuarter) {
          quarterRequestStarted.resolve();
          await releaseQuarterResponse.promise;
        }
        return overviewFixture(body.groupId ?? '');
      },
      onOverviewFulfilled: (body) => {
        if (
          body.groupId === GROUP_A_ID &&
          (body.period === 2 ||
            body.period === 'ANALYTICS_PERIOD_QUARTER')
        ) {
          quarterResponseFulfilled.resolve();
        }
      },
    });

    await gotoSharedAnalytics(page, GROUP_A_NAME);
    await expect(
      page.getByRole('heading', {
        level: 2,
        name: `${GROUP_A_NAME} analytics`,
      })
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Current period summary' })
    ).toContainText('$1,235');
    await expect(
      page.getByRole('region', { name: 'Group settlement' })
    ).toContainText('$78');

    const analyticsNav = page.getByRole('navigation', {
      name: 'Analytics views',
    });
    await expect(analyticsNav.getByRole('tab')).toHaveCount(5);
    for (const view of GROUP_ANALYTICS_VIEWS) {
      await expect(
        analyticsNav.getByRole('tab', { name: view })
      ).toBeVisible();
    }
    await expect(
      analyticsNav.getByRole('tab', { name: 'Data Quality' })
    ).toHaveCount(0);

    await page
      .getByRole('combobox', { name: 'Analytics period' })
      .selectOption('quarter');
    await quarterRequestStarted.promise;

    await selectGroup(page, GROUP_A_NAME, GROUP_B_NAME);
    await expect(
      page.getByRole('heading', {
        level: 2,
        name: `${GROUP_B_NAME} analytics`,
      })
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Current period summary' })
    ).toContainText('$8,765');
    await expect(
      page.getByRole('region', { name: 'Group settlement' })
    ).toContainText('$89');

    releaseQuarterResponse.resolve();
    await quarterResponseFulfilled.promise;
    await waitForTwoAnimationFrames(page);

    const currentPeriodSummary = page.getByRole('region', {
      name: 'Current period summary',
    });
    const groupSettlement = page.getByRole('region', {
      name: 'Group settlement',
    });
    await expect(currentPeriodSummary).toContainText('$8,765');
    await expect(groupSettlement).toContainText('$89');
    await expect(currentPeriodSummary).not.toContainText('$1,235');
    await expect(groupSettlement).not.toContainText('$78');
  });

  test('shared analytics handles non-member denial without leaking data', async ({
    page,
  }) => {
    let overviewAttempts = 0;
    const downstreamAnalyticsRequests: RequestObservation[] = [];
    const downstreamMethods = new Set([
      'GetSpendingTrends',
      'DetectAnomalies',
      'GetWaterfallData',
      'GetGroupSummary',
      'GetDailyAggregates',
      'GetCategoryComparison',
      'GetCashFlowForecast',
    ]);

    await installSharedFixtures(page, {
      activeGroupId: DENIED_GROUP_ID,
      groups: [
        {
          id: DENIED_GROUP_ID,
          name: DENIED_GROUP_NAME,
          memberUserId: 'different-user',
        },
      ],
      overviewError: async (route) => {
        overviewAttempts += 1;
        await fulfillPermissionDenied(
          route,
          'Membership is required to view this group.'
        );
      },
      onRequest: (observation) => {
        if (downstreamMethods.has(observation.method)) {
          downstreamAnalyticsRequests.push(observation);
        }
      },
    });

    await gotoSharedAnalytics(page, DENIED_GROUP_NAME);
    await expect(
      page.getByRole('heading', {
        level: 2,
        name: `${DENIED_GROUP_NAME} analytics`,
      })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Analytics could not load' })
    ).toBeVisible();
    await expect(
      page.getByText('Membership is required to view this group.', {
        exact: false,
      })
    ).toBeVisible();
    await expect.poll(() => overviewAttempts).toBeGreaterThanOrEqual(1);
    const attemptsBeforeRetry = overviewAttempts;
    expect(downstreamAnalyticsRequests).toEqual([]);

    await page.getByRole('button', { name: 'Try again' }).click();
    await expect
      .poll(() => overviewAttempts)
      .toBe(attemptsBeforeRetry + 1);
    await expect(
      page.getByRole('heading', { name: 'Analytics could not load' })
    ).toBeVisible();
    expect(downstreamAnalyticsRequests).toEqual([]);

    await expect(page.getByText('$9,999.99', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Other Group Secret')).toHaveCount(0);
    await expect(page.getByText('Personal Secret')).toHaveCount(0);
  });

  test('analytics remains reachable without page overflow on narrow screens', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installSharedFixtures(page, {
      activeGroupId: GROUP_A_ID,
      groups: [
        {
          id: GROUP_A_ID,
          name: GROUP_A_NAME,
          memberUserId: TEST_USER_ID,
        },
      ],
    });

    await gotoSharedAnalytics(page, GROUP_A_NAME);
    const analyticsHeading = page.getByRole('heading', {
      level: 2,
      name: `${GROUP_A_NAME} analytics`,
    });
    const periodControl = page.getByRole('combobox', {
      name: 'Analytics period',
    });
    await expect(analyticsHeading).toBeVisible();
    await expect(periodControl).toBeVisible();

    const headerIsStacked = await Promise.all([
      analyticsHeading.boundingBox(),
      periodControl.boundingBox(),
    ]).then(([headingBox, controlBox]) => {
      if (!headingBox || !controlBox) return false;
      return controlBox.y >= headingBox.y + headingBox.height;
    });
    expect(headerIsStacked).toBe(true);

    const analyticsNav = page.getByRole('navigation', {
      name: 'Analytics views',
    });
    await expect(analyticsNav.getByRole('tab')).toHaveCount(5);
    await expect(
      analyticsNav.getByRole('tab', { name: 'Data Quality' })
    ).toHaveCount(0);

    for (const view of GROUP_ANALYTICS_VIEWS) {
      const trigger = analyticsNav.getByRole('tab', { name: view });
      await trigger.click();
      await expect(trigger).toHaveAttribute('aria-selected', 'true');
      await expect(
        page.getByRole('tabpanel', { name: view })
      ).toBeVisible();
    }

    const tabList = analyticsNav.getByRole('tablist', {
      name: 'Choose an analytics view',
    });
    const overviewTab = analyticsNav.getByRole('tab', { name: 'Overview' });
    const forecastTab = analyticsNav.getByRole('tab', { name: 'Forecast' });
    await overviewTab.click();
    await expect(overviewTab).toHaveAttribute('aria-selected', 'true');
    await tabList.evaluate((element) => {
      element.scrollLeft = 0;
    });
    await overviewTab.focus();
    await page.keyboard.press('End');
    await expect(forecastTab).toHaveAttribute('aria-selected', 'true');
    await expect
      .poll(async () => {
        return Promise.all([
          tabList.boundingBox(),
          forecastTab.boundingBox(),
        ]).then(([listBox, tabBox]) => {
          if (!listBox || !tabBox) return false;
          return (
            tabBox.x >= listBox.x - 1 &&
            tabBox.x + tabBox.width <= listBox.x + listBox.width + 1
          );
        });
      })
      .toBe(true);

    await expect
      .poll(() =>
        page.evaluate(() => {
          const root = document.documentElement;
          return root.scrollWidth <= root.clientWidth + 1;
        })
      )
      .toBe(true);
    await expect(periodControl).toBeInViewport();
  });
});
