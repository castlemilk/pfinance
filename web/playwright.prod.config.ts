import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for running E2E tests against pfinance.dev (production)
 * with Firebase email/password authentication.
 *
 * Firebase Auth stores tokens in IndexedDB, not localStorage, so Playwright's
 * storageState approach doesn't work. Instead, each test signs in via the UI
 * using the helper in e2e/helpers/login.ts.
 *
 * Usage:
 *   npx playwright test --config=playwright.prod.config.ts e2e/tax-workflow.spec.ts
 */

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  timeout: 300_000, // 5 minutes per test (extraction is slow)
  expect: { timeout: 15000 },

  use: {
    baseURL: process.env.PREVIEW_URL || 'https://pfinance.dev',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    ...devices['Desktop Chrome'],
  },

  outputDir: 'test-results/',
});
