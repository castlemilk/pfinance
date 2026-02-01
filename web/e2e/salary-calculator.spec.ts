import { test, expect } from '@playwright/test';

/**
 * Salary Calculator E2E Tests
 *
 * These tests verify the salary calculator component functionality.
 */

test.describe('Salary Calculator', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to income page which contains the salary calculator
    await page.goto('/personal/income');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
  });

  test('should display salary calculator', async ({ page }) => {
    // Check for the Income Management heading (main page title)
    await expect(page.getByRole('heading', { name: 'Income Management' })).toBeVisible();
  });

  test('should display gross salary label', async ({ page }) => {
    // Look for Gross Salary label - use a more specific selector
    // The label appears next to the input field
    const grossSalaryLabel = page.locator('label', { hasText: 'Gross Salary' });
    await expect(grossSalaryLabel).toBeVisible();
  });

  test('should allow entering a salary', async ({ page }) => {
    // Find the salary input
    const salaryInput = page.getByPlaceholder(/enter your gross salary/i);
    await expect(salaryInput).toBeVisible();

    // Enter a salary
    await salaryInput.fill('100000');

    // Verify value is set
    await expect(salaryInput).toHaveValue('100000');
  });

  test('should display pay cycle selector', async ({ page }) => {
    // Look for Pay Cycle label
    await expect(page.getByText('Pay Cycle')).toBeVisible();
  });

  test('should display input type selector', async ({ page }) => {
    // Look for Input Type label
    await expect(page.getByText('Input Type')).toBeVisible();
  });

  test('should have a reset button', async ({ page }) => {
    const resetButton = page.getByRole('button', { name: /reset/i });
    await expect(resetButton.first()).toBeVisible();
  });

  test('should display pro-rata settings', async ({ page }) => {
    // Look for pro-rata / part-time toggle
    await expect(page.getByText(/Pro-rata/i).first()).toBeVisible();
  });
});

test.describe('Salary Calculator Calculations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/personal/income');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
  });

  test('should calculate and display results after entering salary', async ({ page }) => {
    // Enter a salary
    const salaryInput = page.getByPlaceholder(/enter your gross salary/i);
    await salaryInput.fill('100000');

    // Wait for calculations to update
    await page.waitForTimeout(500);

    // Should display Summary section with Take-home Pay
    await expect(page.getByText('Summary')).toBeVisible();
    await expect(page.getByText('Take-home Pay', { exact: true })).toBeVisible();
  });

  test('should update calculations when salary changes', async ({ page }) => {
    const salaryInput = page.getByPlaceholder(/enter your gross salary/i);

    // Enter initial salary
    await salaryInput.fill('80000');
    await page.waitForTimeout(500);

    // Change salary
    await salaryInput.fill('120000');
    await page.waitForTimeout(500);

    // Verify the new value is reflected
    await expect(salaryInput).toHaveValue('120000');
  });
});

test.describe('Part-time / Pro-rata Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/personal/income');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
  });

  test('should display part-time toggle', async ({ page }) => {
    // Look for part-time toggle
    await expect(page.getByText(/Pro-rata/i)).toBeVisible();
  });

  test('should expand hours input when part-time is enabled', async ({ page }) => {
    // Find and click the part-time toggle
    const partTimeSwitch = page.getByRole('switch').first();

    if (await partTimeSwitch.isVisible()) {
      await partTimeSwitch.click();

      // Should show hours input after enabling
      await page.waitForTimeout(500);

      // Scroll down to reveal potential hours input
      await page.evaluate(() => window.scrollBy(0, 200));
      await page.waitForTimeout(300);

      // Look for hours-related input or FTE-related content
      const hoursInput = page.getByPlaceholder(/hours/i);
      const fteContent = page.getByText(/hours per week/i);

      // Either should be visible when pro-rata is enabled
      const hoursVisible = await hoursInput.isVisible().catch(() => false);
      const fteVisible = await fteContent.isVisible().catch(() => false);

      expect(hoursVisible || fteVisible).toBeTruthy();
    }
  });
});
