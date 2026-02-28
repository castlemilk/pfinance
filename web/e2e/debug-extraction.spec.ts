import { test, expect } from '@playwright/test';
import path from 'path';
import { loginWithEmail } from './helpers/login';

const TESTDATA_DIR = path.join(__dirname, '..', 'testdata');
const ANZ_STATEMENT = path.join(TESTDATA_DIR, 'b30ab747-3dae-4d20-bd6c-29203a46c3dc.pdf');

test('debug extraction network requests', async ({ page }) => {
  test.setTimeout(180_000);

  // Collect all API requests and responses
  const apiCalls: { url: string; method: string; status: number; body: string }[] = [];

  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('pfinance') && (url.includes('Extract') || url.includes('extract') || url.includes('Import') || url.includes('finance'))) {
      console.log(`>> REQUEST: ${request.method()} ${url}`);
      const postData = request.postData();
      if (postData && postData.length < 500) {
        console.log(`   Body: ${postData}`);
      } else if (postData) {
        console.log(`   Body length: ${postData.length} bytes`);
      }
    }
  });

  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('pfinance') && (url.includes('Extract') || url.includes('extract') || url.includes('Import') || url.includes('finance'))) {
      const status = response.status();
      let body = '';
      try {
        body = await response.text();
        if (body.length > 2000) body = body.substring(0, 2000) + '... [truncated]';
      } catch {
        body = '[failed to read body]';
      }
      console.log(`<< RESPONSE: ${status} ${url}`);
      console.log(`   Body: ${body}`);
      apiCalls.push({ url, method: 'GET', status, body });
    }
  });

  // Also capture console errors from the page
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log(`[PAGE ERROR] ${msg.text()}`);
    }
  });

  await loginWithEmail(page);

  // Navigate to expenses page
  await page.goto('/personal/expenses');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Click Bulk tab
  const bulkTab = page.getByRole('button', { name: /^Bulk$/i });
  await bulkTab.click();
  await page.waitForTimeout(1000);

  // Scroll down and click Start Batch Upload
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);

  const batchUploadButton = page.getByRole('button', { name: /Start Batch Upload/i });
  if (!(await batchUploadButton.isVisible({ timeout: 5000 }).catch(() => false))) {
    console.log('Batch Upload button not found');
    await page.screenshot({ path: 'test-results/debug-extraction-no-button.png', fullPage: true });
    return;
  }

  await batchUploadButton.click();
  await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

  const dialog = page.locator('[role="dialog"]');

  // Upload the PDF
  const fileInput = dialog.locator('input[type="file"]');
  await fileInput.setInputFiles(ANZ_STATEMENT);
  await page.waitForTimeout(1000);

  // Check extraction method
  const dialogText = await dialog.textContent();
  console.log('Dialog has Gemini:', dialogText?.includes('Gemini'));
  console.log('Dialog has Self-hosted:', dialogText?.includes('Self-hosted'));

  // Take screenshot before processing
  await page.screenshot({ path: 'test-results/debug-extraction-before.png' });

  // Click Process
  const processButton = dialog.getByRole('button', { name: /Process 1 File/i });
  await processButton.click();

  console.log('Process button clicked, waiting for extraction...');

  // Wait for extraction to complete or fail
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'test-results/debug-extraction-processing.png' });

  // Wait for the review text
  try {
    await expect(dialog.getByText(/Review \d+ extracted transaction/i)).toBeVisible({ timeout: 120_000 });
  } catch {
    console.log('Extraction timed out or failed');
  }

  await page.screenshot({ path: 'test-results/debug-extraction-result.png' });

  // Get the final dialog text
  const resultText = await dialog.textContent();
  console.log('Result text:', resultText?.substring(0, 500));

  // Log all captured API calls
  console.log('\n=== API Calls Summary ===');
  apiCalls.forEach((call, i) => {
    console.log(`${i + 1}. [${call.status}] ${call.url}`);
  });
});
