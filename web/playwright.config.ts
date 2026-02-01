import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration for PFinance
 *
 * @see https://playwright.dev/docs/test-configuration
 *
 * Environment Variables:
 * - PREVIEW_URL: Run tests against a preview deployment (e.g., https://pr-5.preview.pfinance.dev)
 * - CI: Set automatically in CI environments
 */

const isCI = !!process.env.CI;
const previewUrl = process.env.PREVIEW_URL;
const baseURL = previewUrl || 'http://localhost:1234';

export default defineConfig({
  testDir: './e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: isCI,
  /* Retry on CI only */
  retries: isCI ? 2 : 0,
  /* Use 2 workers on CI for speed, unlimited locally */
  workers: isCI ? 2 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: isCI
    ? [['list'], ['github']]
    : [['html', { outputFolder: 'playwright-report' }], ['list']],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Take screenshot on failure */
    screenshot: 'only-on-failure',

    /* Record video on failure - disable in CI for speed */
    video: isCI ? 'off' : 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* Test against mobile viewports. */
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  /* Run your local dev server before starting the tests
   * - Disabled in CI (servers started manually)
   * - Disabled when PREVIEW_URL is set (testing against remote deployment)
   */
  webServer: isCI || previewUrl
    ? undefined
    : [
        {
          command: 'npm run dev -- -p 1234',
          url: 'http://localhost:1234',
          reuseExistingServer: true,
          timeout: 120 * 1000,
        },
        {
          command: 'cd ../backend && go run cmd/server/main.go',
          url: 'http://localhost:8111/health',
          reuseExistingServer: true,
          timeout: 120 * 1000,
          env: {
            PORT: '8111',
            USE_MEMORY_STORE: 'true',
          },
        },
      ],

  /* Output folder for test artifacts */
  outputDir: 'test-results/',

  /* Global timeout for each test - shorter in CI */
  timeout: isCI ? 20 * 1000 : 30 * 1000,

  /* Expect timeout */
  expect: {
    timeout: 5000,
  },
});
