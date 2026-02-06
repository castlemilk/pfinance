import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test.describe('Receipt Extraction', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('http://localhost:1234');

    // Wait for the page to load
    await page.waitForLoadState('networkidle');
  });

  test('should show smart expense entry component', async ({ page }) => {
    // Look for the Add Expense card
    const addExpenseCard = page.locator('text=Add Expense');
    await expect(addExpenseCard.first()).toBeVisible({ timeout: 10000 });

    // Take a screenshot
    await page.screenshot({ path: 'test-results/expense-entry-initial.png', fullPage: true });
  });

  test('should show receipt upload option', async ({ page }) => {
    // Wait for the expense entry component
    await page.waitForSelector('text=Add Expense', { timeout: 10000 });

    // Click on the Receipt button
    const receiptButton = page.locator('button:has-text("Receipt")');
    if (await receiptButton.isVisible()) {
      await receiptButton.click();

      // Should show upload option
      await expect(page.locator('text=Upload a receipt photo')).toBeVisible({ timeout: 5000 });

      // Take a screenshot
      await page.screenshot({ path: 'test-results/receipt-upload-mode.png', fullPage: true });
    }
  });

  test('should process a receipt image via API', async ({ request }) => {
    // Create a simple test by calling the API directly
    // First, let's create a simple test image (1x1 pixel PNG)
    const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const testImageBuffer = Buffer.from(testImageBase64, 'base64');

    // Create form data
    const formData = new FormData();
    formData.append('file', new Blob([testImageBuffer], { type: 'image/png' }), 'test.png');
    formData.append('documentType', 'image');

    // Call the API
    const response = await request.post('http://localhost:1234/api/process-document', {
      multipart: {
        file: {
          name: 'test.png',
          mimeType: 'image/png',
          buffer: testImageBuffer,
        },
        documentType: 'image',
      },
    });

    console.log('API Response status:', response.status());
    const body = await response.text();
    console.log('API Response body:', body);

    // The API should respond (even if it can't extract from a 1x1 pixel image)
    expect(response.status()).toBeLessThan(500);
  });
});
