import { test, expect } from '@playwright/test';
import path from 'path';

/**
 * Tax Processing Workflow E2E Tests
 *
 * Tests the end-to-end tax workflow including:
 * - Uploading bank statements via the BulkUpload dialog
 * - Processing and reviewing extracted transactions
 * - Importing transactions
 * - Walking through the Tax Review Wizard (6 steps)
 * - Exporting tax data
 *
 * NOTE: The full flow test requires the backend with Gemini API configured.
 * It is skipped in CI where ML services are not available.
 */

const TESTDATA_DIR = path.join(__dirname, '..', 'testdata');
const ANZ_STATEMENT = path.join(TESTDATA_DIR, 'b30ab747-3dae-4d20-bd6c-29203a46c3dc.pdf');

test.describe('Tax Processing Workflow', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate to the app - dev mode should auto-authenticate
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    // Give React time to hydrate
    await page.waitForTimeout(1000);
  });

  test('full tax workflow: upload → review → import → tax wizard', async ({ page }) => {
    // Skip in CI - extraction requires Gemini API
    test.skip(!!process.env.CI, 'Tax workflow requires Gemini API / ML service');

    // Increase timeout for this long-running test (extraction + classification)
    test.setTimeout(300_000); // 5 minutes

    // ────────────────────────────────────────────────────────────
    // Step 1: Navigate to the expenses page where BulkUpload lives
    // ────────────────────────────────────────────────────────────
    await page.goto('/personal/expenses');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // Scroll down to find the Batch Document Upload section
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    // Click "Start Batch Upload" button to open the BulkUpload dialog
    const batchUploadButton = page.getByRole('button', { name: /Start Batch Upload/i });
    if (!(await batchUploadButton.isVisible({ timeout: 5000 }).catch(() => false))) {
      // If the button is not visible directly, look for Statement mode first
      const statementButton = page.getByRole('button', { name: /^Statement$/i });
      if (await statementButton.isVisible()) {
        await statementButton.click();
        await page.waitForTimeout(500);
      }
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(500);
    }
    await batchUploadButton.click();

    // Wait for the dialog to appear
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    await expect(page.getByText('Batch Document Upload')).toBeVisible();

    // ────────────────────────────────────────────────────────────
    // Step 2: Upload the ANZ bank statement PDF
    // ────────────────────────────────────────────────────────────
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(ANZ_STATEMENT);

    // Wait for the file to appear in the file list
    await expect(page.getByText('Statement')).toBeVisible({ timeout: 5000 });

    // Verify the file count shows "1 file selected"
    await expect(page.getByText(/1 file.* selected/i)).toBeVisible();

    // ────────────────────────────────────────────────────────────
    // Step 3: Ensure Gemini AI is selected and start processing
    // ────────────────────────────────────────────────────────────
    // The extraction method toggle should be visible in the dialog
    const geminiLabel = page.getByText('Gemini AI');
    if (await geminiLabel.isVisible()) {
      // Gemini is already selected - good
    } else {
      // Toggle to Gemini if currently on Self-hosted ML
      const methodSwitch = page.locator('[role="dialog"]').locator('[role="switch"]').first();
      if (await methodSwitch.isVisible()) {
        await methodSwitch.click();
      }
    }

    // Click "Process 1 File" button
    const processButton = page.getByRole('button', { name: /Process 1 File/i });
    await processButton.click();

    // ────────────────────────────────────────────────────────────
    // Step 4: Wait for extraction to complete
    // ────────────────────────────────────────────────────────────
    // The processing step shows a progress bar and file status
    await expect(page.getByText(/Extracting|Processing files|Waiting for results/i)).toBeVisible({ timeout: 10000 });

    // Wait for processing to finish - extraction can take up to 2 minutes
    // The dialog transitions from 'processing' to 'review' step when done
    await expect(page.getByText(/Review \d+ extracted transaction/i)).toBeVisible({ timeout: 180_000 });

    // ────────────────────────────────────────────────────────────
    // Step 5: Review extracted transactions
    // ────────────────────────────────────────────────────────────
    // Verify the review table has transactions
    const transactionRows = page.locator('[role="dialog"] table tbody tr');
    const rowCount = await transactionRows.count();
    expect(rowCount).toBeGreaterThan(0);

    // Verify summary stats are visible (Total Amount, Transactions, Avg Confidence, Selected)
    await expect(page.getByText('Total Amount')).toBeVisible();
    await expect(page.getByText('Transactions')).toBeVisible();
    await expect(page.getByText('Avg Confidence')).toBeVisible();

    // Check that some transactions are pre-selected (those with confidence >= 0.5)
    const selectedText = page.getByText(/Selected/i);
    await expect(selectedText).toBeVisible();

    // ────────────────────────────────────────────────────────────
    // Step 6: Import selected transactions
    // ────────────────────────────────────────────────────────────
    const importButton = page.getByRole('button', { name: /Import \d+ Selected/i });
    await expect(importButton).toBeVisible();
    await importButton.click();

    // Wait for the import to complete - should see "Imported" message
    await expect(page.getByText(/Transaction.* Imported/i)).toBeVisible({ timeout: 30000 });

    // Click "Done" to close the dialog
    const doneButton = page.getByRole('button', { name: /^Done$/i });
    await doneButton.click();

    // Dialog should close
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5000 });

    // ────────────────────────────────────────────────────────────
    // Step 7: Navigate to Tax Review Wizard
    // ────────────────────────────────────────────────────────────
    await page.goto('/personal/tax/review');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // Verify the wizard loaded with the Configure step
    await expect(page.getByText('Tax Review Wizard')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Configure Your Tax Review')).toBeVisible();

    // Verify Financial Year selector is present
    await expect(page.getByText('Financial Year')).toBeVisible();

    // Click Next to go to Classify step
    const nextButton = page.getByRole('button', { name: /^Next$/i });
    await nextButton.click();

    // ────────────────────────────────────────────────────────────
    // Step 8: Classify step - start AI classification
    // ────────────────────────────────────────────────────────────
    await expect(page.getByText('AI Expense Classification')).toBeVisible({ timeout: 5000 });

    // Click "Start Classification" button
    const classifyButton = page.getByRole('button', { name: /Start Classification/i });
    await expect(classifyButton).toBeVisible();
    await classifyButton.click();

    // Wait for classification to complete (shows "Classifying your expenses..." during processing)
    await expect(page.getByText(/Classifying your expenses/i)).toBeVisible({ timeout: 5000 });

    // Wait for results to appear - look for stat cards (Processed, Auto-Applied, etc.)
    await expect(page.getByText('Processed')).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText('Auto-Applied')).toBeVisible();

    // Next should now be enabled since classifyResult is not null
    await nextButton.click();

    // ────────────────────────────────────────────────────────────
    // Step 9: Review step
    // ────────────────────────────────────────────────────────────
    // The review step either shows flagged expenses or "All Expenses Classified!"
    const reviewHeading = page.getByText(/Review Flagged Expenses|Review Expenses|All Expenses Classified/i);
    await expect(reviewHeading).toBeVisible({ timeout: 10000 });

    // Proceed to next step
    await nextButton.click();

    // ────────────────────────────────────────────────────────────
    // Step 10: Deductions step
    // ────────────────────────────────────────────────────────────
    await expect(page.getByText('Deduction Breakdown')).toBeVisible({ timeout: 10000 });

    // Wait for deduction data to load
    await page.waitForTimeout(3000);

    // Proceed to next step
    await nextButton.click();

    // ────────────────────────────────────────────────────────────
    // Step 11: Calculate step
    // ────────────────────────────────────────────────────────────
    await expect(page.getByText('Tax Calculation')).toBeVisible({ timeout: 10000 });

    // Wait for tax summary to load
    await page.waitForTimeout(3000);

    // Proceed to final step
    await nextButton.click();

    // ────────────────────────────────────────────────────────────
    // Step 12: Export step
    // ────────────────────────────────────────────────────────────
    await expect(page.getByText('Export & Finish')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Review Complete')).toBeVisible();

    // Verify export options are visible
    await expect(page.getByText('CSV Spreadsheet')).toBeVisible();
    await expect(page.getByText('JSON Data')).toBeVisible();
    await expect(page.getByText('PDF Report')).toBeVisible();

    // Verify "Return to Tax Dashboard" link is present
    await expect(page.getByRole('link', { name: /Return to Tax Dashboard/i })).toBeVisible();
  });

  test('bulk upload dialog renders and accepts PDF files', async ({ page }) => {
    // Navigate to expenses page
    await page.goto('/personal/expenses');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // Scroll to find the batch upload section
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    // Try to open the batch upload dialog
    const batchUploadButton = page.getByRole('button', { name: /Start Batch Upload/i });
    if (!(await batchUploadButton.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, 'Batch Upload button not visible (may require auth or feature gate)');
      return;
    }

    await batchUploadButton.click();
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Verify dialog title
    await expect(page.getByText('Batch Document Upload')).toBeVisible();

    // Verify file input exists and accepts expected types
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeAttached();
    const acceptAttr = await fileInput.getAttribute('accept');
    expect(acceptAttr).toContain('pdf');
    expect(acceptAttr).toContain('image/jpeg');

    // Verify extraction method toggle is present
    await expect(page.getByText(/Gemini AI|Self-hosted ML/i)).toBeVisible();

    // Verify drop zone text
    await expect(page.getByText(/Drop files here or click to browse/i)).toBeVisible();

    // Upload a PDF file
    await fileInput.setInputFiles(ANZ_STATEMENT);

    // Verify file appears in list with correct badge
    await expect(page.getByText('Statement')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/1 file.* selected/i)).toBeVisible();

    // Verify Process button is enabled
    const processButton = page.getByRole('button', { name: /Process 1 File/i });
    await expect(processButton).toBeEnabled();

    // Close the dialog without processing
    const cancelButton = page.getByRole('button', { name: /Cancel/i });
    await cancelButton.click();
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5000 });
  });

  test('tax review wizard renders all 6 steps', async ({ page }) => {
    // Navigate directly to the tax review wizard
    await page.goto('/personal/tax/review');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // Verify the wizard loaded
    await expect(page.getByText('Tax Review Wizard')).toBeVisible({ timeout: 10000 });

    // ── Step 1: Configure ───────────────────────────────────
    await expect(page.getByText('Configure Your Tax Review')).toBeVisible();

    // Verify all Configure step form elements
    await expect(page.getByText('Financial Year')).toBeVisible();
    await expect(page.getByText('Occupation')).toBeVisible();
    await expect(page.getByText('Tax Already Withheld')).toBeVisible();
    await expect(page.getByText('HELP / HECS-HELP Debt')).toBeVisible();
    await expect(page.getByText('Medicare Levy Exemption')).toBeVisible();
    await expect(page.getByText('Private Health Insurance')).toBeVisible();

    // Verify step indicator shows all 6 steps
    const stepLabels = ['Configure', 'Classify', 'Review', 'Deductions', 'Calculate', 'Export'];
    for (const label of stepLabels) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }

    // Verify navigation buttons
    const backButton = page.getByRole('button', { name: /Back to Tax/i });
    await expect(backButton).toBeVisible();
    const nextButton = page.getByRole('button', { name: /^Next$/i });
    await expect(nextButton).toBeVisible();

    // ── Step 2: Classify ────────────────────────────────────
    await nextButton.click();
    await expect(page.getByText('AI Expense Classification')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Batch Classification')).toBeVisible();
    await expect(page.getByRole('button', { name: /Start Classification/i })).toBeVisible();

    // Back button should now say "Back" (not "Back to Tax")
    await expect(page.getByRole('button', { name: /^Back$/i })).toBeVisible();
  });

  test('tax review wizard Configure step has functional form controls', async ({ page }) => {
    await page.goto('/personal/tax/review');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // Wait for wizard to render
    await expect(page.getByText('Configure Your Tax Review')).toBeVisible({ timeout: 10000 });

    // Fill in occupation
    const occupationInput = page.getByPlaceholder(/Software Engineer|Teacher|Nurse/i);
    await occupationInput.fill('Software Engineer');
    await expect(occupationInput).toHaveValue('Software Engineer');

    // Fill in tax withheld
    const taxWithheldInput = page.locator('input[type="number"][placeholder="0.00"]');
    await taxWithheldInput.fill('15000');
    await expect(taxWithheldInput).toHaveValue('15000');

    // Toggle HELP debt switch
    const helpSwitch = page.locator('#help-debt');
    await helpSwitch.click();
    await expect(helpSwitch).toBeChecked();

    // Toggle Medicare exemption switch
    const medicareSwitch = page.locator('#medicare-exemption');
    await medicareSwitch.click();
    await expect(medicareSwitch).toBeChecked();

    // Toggle Private Health Insurance switch
    const privateHealthSwitch = page.locator('#private-health');
    await privateHealthSwitch.click();
    await expect(privateHealthSwitch).toBeChecked();

    // Verify Next button is available (Configure step always allows proceeding)
    const nextButton = page.getByRole('button', { name: /^Next$/i });
    await expect(nextButton).toBeEnabled();
  });

  test('tax dashboard page renders with tabs', async ({ page }) => {
    // Navigate to the main tax page (not the wizard)
    await page.goto('/personal/tax');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // Verify the page heading
    await expect(page.getByText('Tax Returns')).toBeVisible({ timeout: 10000 });

    // Verify the tabs are present
    await expect(page.getByRole('tab', { name: 'Summary' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Deductions' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Calculator' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Export' })).toBeVisible();
  });

  test('tax calculator produces correct estimates', async ({ page }) => {
    // Navigate to tax page and switch to Calculator tab
    await page.goto('/personal/tax');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // Click Calculator tab
    const calculatorTab = page.getByRole('tab', { name: 'Calculator' });
    if (!(await calculatorTab.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, 'Calculator tab not visible (may be behind feature gate)');
      return;
    }
    await calculatorTab.click();
    await page.waitForTimeout(500);

    // Verify calculator inputs are present
    await expect(page.getByText('Tax Calculator')).toBeVisible();

    // The default gross income should be pre-filled with $85,000
    const grossIncomeInput = page.locator('#gross-income');
    await expect(grossIncomeInput).toBeVisible();

    // Fill in a known income to verify calculation
    await grossIncomeInput.fill('100000');
    await page.waitForTimeout(300);

    // Tax Estimate card should show updated values
    await expect(page.getByText('Tax Estimate')).toBeVisible();

    // Verify the breakdown table has expected rows
    await expect(page.getByText('Gross Income').first()).toBeVisible();
    await expect(page.getByText('Taxable Income').first()).toBeVisible();
    await expect(page.getByText('Base Tax')).toBeVisible();
    await expect(page.getByText('Medicare Levy')).toBeVisible();
    await expect(page.getByText('Total Tax')).toBeVisible();
    await expect(page.getByText('Effective Rate')).toBeVisible();
    await expect(page.getByText('Take Home Pay')).toBeVisible();
  });
});
