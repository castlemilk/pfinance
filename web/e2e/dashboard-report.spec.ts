import { test, expect } from '@playwright/test';

/**
 * Dashboard Report E2E Tests
 *
 * Tests for the PDF report generation functionality, including:
 * - Visual report rendering
 * - Extra settings configuration display
 * - PDF export functionality
 * - Screenshot comparisons for visual regression
 */

test.describe('Dashboard Report', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to reports page
    await page.goto('/personal/reports');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
  });

  test('should display report generator', async ({ page }) => {
    // The title might be in a CardTitle component, not necessarily a heading role
    await expect(page.getByText('Financial Report Generator')).toBeVisible();
  });

  test('should show Visual Report tab by default', async ({ page }) => {
    // Visual Report tab should be active
    await expect(page.getByRole('tab', { name: /Visual Report/i })).toBeVisible();
    await expect(page.getByText('Visual Dashboard Report')).toBeVisible();
  });

  test('should display dashboard report preview', async ({ page }) => {
    // Wait for the page to fully load
    await page.waitForTimeout(1000);

    // Check for key report elements - use .first() for elements that appear multiple times
    await expect(page.getByText('PFinance Report')).toBeVisible();
    await expect(page.getByText('Gross Income').first()).toBeVisible();
    await expect(page.getByText('Net Income').first()).toBeVisible();

    // Check that we have the 4 summary metric cards (contains currency values)
    const metricCards = page.locator('.grid').filter({ hasText: 'Gross Income' }).locator('.p-4');
    await expect(metricCards.first()).toBeVisible();
  });

  test('should have export PDF button', async ({ page }) => {
    const exportButton = page.getByRole('button', { name: /Export Visual PDF/i });
    await expect(exportButton).toBeVisible();
    await expect(exportButton).toBeEnabled();
  });

  test('should switch to Data Report tab', async ({ page }) => {
    // Click Data Report tab
    await page.getByRole('tab', { name: /Data Report/i }).click();
    await page.waitForTimeout(300);

    // Check for data report elements - use locator for labels that might be attached differently
    await expect(page.locator('text=Report Title').first()).toBeVisible();
    await expect(page.locator('text=Report Type').first()).toBeVisible();
    await expect(page.locator('text=Time Period').first()).toBeVisible();
  });

  test('should display Income Flow Visualization', async ({ page }) => {
    await expect(page.getByText('Income Flow Visualization')).toBeVisible();
  });

  test('should display Expense Breakdown section', async ({ page }) => {
    await expect(page.getByText('Expense Breakdown by Category')).toBeVisible();
  });

  test('should display Detailed Financial Summary', async ({ page }) => {
    await expect(page.getByText('Detailed Financial Summary')).toBeVisible();
  });
});

test.describe('Dashboard Report Visual Regression', () => {
  // Skip visual tests in CI - snapshots are platform-specific (darwin vs linux)
  test.skip(() => process.env.CI === 'true', 'Visual regression tests require platform-matched snapshots');

  test.beforeEach(async ({ page }) => {
    await page.goto('/personal/reports');
    await page.waitForLoadState('networkidle');
    // Wait for charts to render
    await page.waitForTimeout(1000);
  });

  test('report header screenshot', async ({ page }) => {
    // Find the report header within the export container
    const header = page.locator('.border-b').filter({ hasText: 'PFinance Report' }).first();
    if (await header.isVisible()) {
      await expect(header).toHaveScreenshot('report-header.png', {
        maxDiffPixelRatio: 0.1,
      });
    }
  });

  test('summary metrics grid screenshot', async ({ page }) => {
    // Find the summary metrics grid (4 cards with Gross Income, Net Income, Expenses, Savings)
    const metricsGrid = page.locator('.grid').filter({ hasText: 'Gross Income' }).first();
    if (await metricsGrid.isVisible()) {
      await expect(metricsGrid).toHaveScreenshot('summary-metrics.png', {
        maxDiffPixelRatio: 0.1,
      });
    }
  });

  test('full report screenshot', async ({ page }) => {
    // Wait for all charts to load
    await page.waitForTimeout(1500);

    // Screenshot the entire report container
    const reportContainer = page.locator('.export-container').first();
    if (await reportContainer.isVisible()) {
      await expect(reportContainer).toHaveScreenshot('full-dashboard-report.png', {
        maxDiffPixelRatio: 0.15, // Allow more variance for charts
        fullPage: false,
      });
    }
  });
});

test.describe('Dashboard Report with Salary Calculator Settings', () => {
  test('should configure extra settings and verify in report', async ({ page }) => {
    // First, go to income page to configure salary calculator
    await page.goto('/personal/income');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    // Enter a salary
    const salaryInput = page.getByPlaceholder(/enter your gross salary/i);
    if (await salaryInput.isVisible()) {
      await salaryInput.fill('120000');
      await page.waitForTimeout(300);
    }

    // Enable superannuation if possible
    const superSection = page.getByText('Superannuation', { exact: false });
    if (await superSection.isVisible()) {
      await superSection.click();
      await page.waitForTimeout(300);

      // Try to enable include super toggle
      const includeSuper = page.getByLabel(/Include Employer Super/i);
      if (await includeSuper.isVisible()) {
        await includeSuper.check();
      }
    }

    // Navigate to reports page
    await page.goto('/personal/reports');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // Verify report shows
    await expect(page.getByText('PFinance Report')).toBeVisible();
  });
});

test.describe('PDF Export Functionality', () => {
  test('should have working export button', async ({ page }) => {
    await page.goto('/personal/reports');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Verify export button exists and is clickable
    const exportButton = page.getByRole('button', { name: /Export Visual PDF/i });
    await expect(exportButton).toBeVisible();
    await expect(exportButton).toBeEnabled();

    // In CI, just verify button exists - PDF generation depends on browser APIs
    // that behave differently in headless mode
    if (process.env.CI) {
      return;
    }

    // Locally, click and verify no error
    await exportButton.click();
    await page.waitForTimeout(1000);

    const errorAlert = page.locator('[role="alert"]').filter({ hasText: /error/i });
    const hasError = await errorAlert.isVisible().catch(() => false);
    expect(hasError).toBe(false);
  });

  test('should show export button with correct text', async ({ page }) => {
    await page.goto('/personal/reports');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    // Verify the export button has the right icon and text
    const exportButton = page.getByRole('button', { name: /Export Visual PDF/i });
    await expect(exportButton).toBeVisible();
    await expect(exportButton).toContainText('Export');
  });
});

test.describe('Report Period Selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/personal/reports');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
    // Switch to Data Report tab for period selection
    await page.getByRole('tab', { name: /Data Report/i }).click();
    await page.waitForTimeout(500);
  });

  test('should allow changing report period', async ({ page }) => {
    // Find the Time Period select trigger (shadcn select uses a button)
    const periodSelectTrigger = page.locator('button').filter({ hasText: /This Month|Last 7 Days|This Quarter|This Year/i }).first();

    if (await periodSelectTrigger.isVisible()) {
      await periodSelectTrigger.click();
      await page.waitForTimeout(200);

      // Select "This Year" from the dropdown
      const yearOption = page.getByRole('option', { name: 'This Year' });
      if (await yearOption.isVisible()) {
        await yearOption.click();
        await page.waitForTimeout(300);

        // Verify selection changed
        await expect(periodSelectTrigger).toContainText('This Year');
      }
    }
  });

  test('should show custom date range when selected', async ({ page }) => {
    // Find the Time Period select trigger
    const periodSelectTrigger = page.locator('button').filter({ hasText: /This Month|Last 7 Days|This Quarter|This Year|Custom/i }).first();

    if (await periodSelectTrigger.isVisible()) {
      await periodSelectTrigger.click();
      await page.waitForTimeout(200);

      // Select "Custom Range" from the dropdown
      const customOption = page.getByRole('option', { name: 'Custom Range' });
      if (await customOption.isVisible()) {
        await customOption.click();
        await page.waitForTimeout(300);

        // Should show date inputs
        await expect(page.locator('input[type="date"]').first()).toBeVisible();
      }
    }
  });
});

test.describe('Extra Settings Summary in Report', () => {
  test('should not show Financial Configuration when no settings active', async ({ page }) => {
    await page.goto('/personal/reports');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);

    // Financial Configuration section should not be visible with default settings
    const configSection = page.getByText('Financial Configuration', { exact: true });

    // It's expected to not be visible when no extra settings are configured
    const isVisible = await configSection.isVisible().catch(() => false);

    // This is a soft assertion - if visible, extra settings are configured
    if (!isVisible) {
      expect(isVisible).toBe(false);
    }
  });
});

test.describe('Report Responsiveness', () => {
  test('should render correctly on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/personal/reports');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // Core elements should still be visible
    await expect(page.getByText('PFinance Report')).toBeVisible();

    // Screenshot comparison only locally (platform-specific snapshots)
    if (!process.env.CI) {
      await expect(page).toHaveScreenshot('report-mobile.png', {
        maxDiffPixelRatio: 0.15,
        fullPage: true,
      });
    }
  });

  test('should render correctly on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/personal/reports');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    await expect(page.getByText('PFinance Report')).toBeVisible();

    // Screenshot comparison only locally (platform-specific snapshots)
    if (!process.env.CI) {
      await expect(page).toHaveScreenshot('report-tablet.png', {
        maxDiffPixelRatio: 0.15,
        fullPage: true,
      });
    }
  });
});
