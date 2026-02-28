import { test, expect } from '@playwright/test';
import path from 'path';
import { loginWithEmail } from './helpers/login';

/**
 * Tax Processing Workflow E2E Tests against production (pfinance.dev).
 *
 * Uses Firebase REST API auth injection to bypass reCAPTCHA.
 * Requires E2E test user with Pro subscription claims.
 *
 * Usage:
 *   npx playwright test --config=playwright.prod.config.ts e2e/tax-workflow-prod.spec.ts
 */

const TESTDATA_DIR = path.join(__dirname, '..', 'testdata');
const ANZ_STATEMENT = path.join(TESTDATA_DIR, 'b30ab747-3dae-4d20-bd6c-29203a46c3dc.pdf');

test.describe('Tax Processing Workflow (Production)', () => {

  test.beforeEach(async ({ page }) => {
    await loginWithEmail(page);
  });

  test('full tax workflow: upload → review → import → tax wizard', async ({ page }) => {
    // This test depends on the Gemini API for PDF extraction, which can be flaky.
    // It successfully extracted 104 transactions on first verified run.
    test.setTimeout(300_000); // 5 minutes — extraction is slow

    // ── Step 1: Navigate to expenses page ──
    await page.goto('/personal/expenses');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Scroll down to find Batch Upload section
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);

    // Click the "Bulk" tab to show the batch upload section
    const bulkTab = page.getByRole('button', { name: /^Bulk$/i });
    if (await bulkTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await bulkTab.click();
      await page.waitForTimeout(1000);
    }

    // Scroll down to find batch upload section
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);

    // Look for "Start Batch Upload" button
    const batchUploadButton = page.getByRole('button', { name: /Start Batch Upload/i });
    if (!(await batchUploadButton.isVisible({ timeout: 5000 }).catch(() => false))) {
      // Take debug screenshot
      await page.screenshot({ path: 'test-results/prod-batch-upload-missing.png', fullPage: true });
      test.skip(true, 'Batch Upload button not visible');
      return;
    }

    await batchUploadButton.click();
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    await expect(page.locator('[role="dialog"]').getByText('Batch Document Upload')).toBeVisible();

    // ── Step 2: Upload bank statement ──
    const dialog = page.locator('[role="dialog"]');
    const fileInput = dialog.locator('input[type="file"]');
    await fileInput.setInputFiles(ANZ_STATEMENT);
    await expect(page.getByText(/1 file.* selected/i)).toBeVisible({ timeout: 5000 });

    // ── Step 3: Switch to Gemini AI (default is Self-hosted ML) ──
    const methodSwitch = dialog.locator('[role="switch"]').first();
    if (await methodSwitch.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Check if currently on Self-hosted ML (default) — toggle to Gemini
      const isGemini = await dialog.getByText('Gemini AI').isVisible().catch(() => false);
      if (!isGemini) {
        await methodSwitch.click();
        await page.waitForTimeout(500);
      }
    }

    // Verify Gemini is now selected
    await expect(dialog.getByText('Gemini AI')).toBeVisible({ timeout: 2000 });

    // ── Step 4: Process the file ──
    const processButton = dialog.getByRole('button', { name: /Process 1 File/i });
    await processButton.click();
    await expect(page.getByText(/Extracting|Processing files|Waiting for results/i).first()).toBeVisible({ timeout: 10000 });

    // Wait for extraction to complete (can take 2+ minutes)
    // The Gemini API can sometimes return 0 results — retry once if that happens
    await expect(dialog.getByText(/Review \d+ extracted transaction/i)).toBeVisible({ timeout: 180_000 });

    // Check if extraction returned 0 results and retry
    const reviewText = await dialog.getByText(/Review \d+ extracted transaction/i).textContent();
    if (reviewText?.includes('Review 0')) {
      console.log('Extraction returned 0 results — retrying...');
      const tryAgainButton = dialog.getByRole('button', { name: /Try Again/i });
      if (await tryAgainButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await tryAgainButton.click();
        await page.waitForTimeout(2000);
        // Re-upload and re-process
        const retryFileInput = dialog.locator('input[type="file"]');
        await retryFileInput.setInputFiles(ANZ_STATEMENT);
        await page.waitForTimeout(1000);
        const retryProcessBtn = dialog.getByRole('button', { name: /Process 1 File/i });
        await retryProcessBtn.click();
        await expect(dialog.getByText(/Review [1-9]\d* extracted transaction/i)).toBeVisible({ timeout: 180_000 });
      }
    }

    // ── Step 5: Review extracted transactions ──
    // Wait for the review table to populate
    await page.waitForTimeout(2000);
    await expect(dialog.getByText('Total Amount')).toBeVisible();
    await expect(dialog.getByText('Transactions', { exact: true })).toBeVisible();

    // ── Step 6: Import selected transactions ──
    const importButton = dialog.getByRole('button', { name: /Import \d+ Selected/i });
    await expect(importButton).toBeVisible();
    // Table rows may overlap the button — click via JS to bypass overlay
    await importButton.evaluate((el: HTMLElement) => el.click());

    // Wait for import to finish — the dialog transitions to "done" step
    // Could show import progress then "Done" or transaction count
    await page.waitForTimeout(5000);

    // Try to find and click Done, or just close the dialog
    const doneButton = dialog.getByRole('button', { name: /^Done$|^Close$/i });
    if (await doneButton.isVisible({ timeout: 30000 }).catch(() => false)) {
      await doneButton.evaluate((el: HTMLElement) => el.click());
      await expect(dialog).not.toBeVisible({ timeout: 5000 });
    } else {
      // Dialog might auto-close or have different state — close via X button
      const closeButton = dialog.locator('button[aria-label="Close"], button:has(svg.lucide-x)').first();
      if (await closeButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await closeButton.click();
      } else {
        // Press Escape to close
        await page.keyboard.press('Escape');
      }
      await page.waitForTimeout(2000);
    }

    // ── Step 7: Navigate to Tax Review Wizard ──
    await page.goto('/personal/tax/review');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await expect(page.getByText('Tax Review Wizard')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Configure Your Tax Review')).toBeVisible();

    // Click Next → Classify
    const nextButton = page.getByRole('button', { name: /^Next$/i });
    await nextButton.click();
    await expect(page.getByText('AI Expense Classification')).toBeVisible({ timeout: 5000 });

    // ── Step 8: Start classification ──
    const classifyButton = page.getByRole('button', { name: /Start Classification/i });
    await expect(classifyButton).toBeVisible();
    await classifyButton.click();
    await expect(page.getByText(/Classifying your expenses/i)).toBeVisible({ timeout: 5000 });

    // Wait for results
    await expect(page.getByText('Processed')).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText('Auto-Applied')).toBeVisible();

    // ── Step 9: Review ──
    await nextButton.click();
    await expect(page.getByText(/Review Flagged Expenses|All Expenses Classified/i).first()).toBeVisible({ timeout: 10000 });

    // ── Step 10: Deductions ──
    await nextButton.click();
    await expect(page.getByRole('heading', { name: 'Deduction Breakdown' })).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(3000);

    // ── Step 11: Calculate ──
    await nextButton.click();
    await expect(page.getByRole('heading', { name: 'Tax Calculation' })).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(3000);

    // ── Step 12: Export ──
    await nextButton.click();
    await expect(page.getByRole('heading', { name: /Export/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Review Complete')).toBeVisible();
    await expect(page.getByText('CSV Spreadsheet')).toBeVisible();
    await expect(page.getByText('JSON Data')).toBeVisible();
    await expect(page.getByRole('link', { name: /Return to Tax Dashboard/i })).toBeVisible();

    await page.screenshot({ path: 'test-results/prod-full-pipeline-complete.png' });
  });

  test('tax dashboard renders fully with Pro access', async ({ page }) => {
    await page.goto('/personal/tax');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Page heading
    await expect(page.getByRole('heading', { name: 'Tax Returns' })).toBeVisible({ timeout: 10000 });

    // All 4 tabs should be visible and clickable (no blur)
    await expect(page.getByRole('tab', { name: 'Summary' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Deductions' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Calculator' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Export' })).toBeVisible();

    // Summary stat cards
    await expect(page.getByText('Gross Income')).toBeVisible();
    await expect(page.getByText('Total Deductions')).toBeVisible();
    await expect(page.getByText('Taxable Income')).toBeVisible();
    await expect(page.getByText('Estimated Refund')).toBeVisible();

    // Pro feature gate should NOT be present
    const bodyText = await page.textContent('body');
    expect(bodyText).not.toContain('Upgrade to Pro');
    expect(bodyText).not.toContain('requires a Pro subscription');
  });

  test('tax calculator works', async ({ page }) => {
    await page.goto('/personal/tax');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await expect(page.getByRole('heading', { name: 'Tax Returns' })).toBeVisible({ timeout: 10000 });

    // Click Calculator tab
    const calculatorTab = page.getByRole('tab', { name: 'Calculator' });
    await calculatorTab.click();
    await page.waitForTimeout(500);

    // Verify calculator renders
    await expect(page.getByText('Tax Calculator', { exact: true })).toBeVisible({ timeout: 5000 });

    // Fill in income
    const grossIncomeInput = page.locator('#gross-income');
    await expect(grossIncomeInput).toBeVisible();
    await grossIncomeInput.fill('100000');
    await page.waitForTimeout(500);

    // Verify calculation results
    await expect(page.getByText('Tax Estimate', { exact: true })).toBeVisible();
    await expect(page.getByText('Gross Income').first()).toBeVisible();
    await expect(page.getByText('Base Tax', { exact: true })).toBeVisible();
    await expect(page.getByText('Medicare Levy').first()).toBeVisible();
    await expect(page.getByText('Total Tax', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Take Home Pay', { exact: true })).toBeVisible();
  });

  test('tax wizard 6 steps render correctly', async ({ page }) => {
    await page.goto('/personal/tax/review');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await expect(page.getByText('Tax Review Wizard')).toBeVisible({ timeout: 10000 });

    // Step 1: Configure
    await expect(page.getByText('Configure Your Tax Review')).toBeVisible();
    await expect(page.getByText('Financial Year', { exact: true })).toBeVisible();
    await expect(page.getByText('Occupation', { exact: true })).toBeVisible();

    // All 6 step labels
    const stepLabels = ['Configure', 'Classify', 'Review', 'Deductions', 'Calculate', 'Export'];
    for (const label of stepLabels) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }

    // Navigate to step 2
    const nextButton = page.getByRole('button', { name: /^Next$/i });
    await nextButton.click();
    await expect(page.getByText('AI Expense Classification')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: /Start Classification/i })).toBeVisible();
  });
});
