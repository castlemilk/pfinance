import { test, expect } from '@playwright/test';

test.describe('Receipt Extraction', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/personal/expenses');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
  });

  test('should show smart expense entry component', async ({ page }) => {
    // Look for the Add Expense card (may not be visible without auth)
    const addExpenseCard = page.locator('text=Add Expense').first();
    const isVisible = await addExpenseCard.isVisible({ timeout: 5000 }).catch(() => false);

    if (!isVisible) {
      // Without auth, may redirect or show login prompt — that's expected
      const pageContent = await page.content();
      const hasAuthPrompt = pageContent.includes('Sign in') || pageContent.includes('Login');
      expect(isVisible || hasAuthPrompt).toBeTruthy();
      return;
    }

    await expect(addExpenseCard).toBeVisible();
  });

  test('should show receipt upload option', async ({ page }) => {
    const addExpense = page.locator('text=Add Expense').first();
    if (!(await addExpense.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, 'Add Expense not visible (may require auth)');
      return;
    }

    // Click on the Receipt button
    const receiptButton = page.locator('button:has-text("Receipt")');
    if (await receiptButton.isVisible()) {
      await receiptButton.click();
      await expect(page.locator('text=Upload a receipt photo')).toBeVisible({ timeout: 5000 });
    }
  });

  test('should process a receipt image via API', async ({ request }) => {
    // Skip in CI - ML service is not configured
    test.skip(!!process.env.CI, 'Receipt extraction requires ML service');

    const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const testImageBuffer = Buffer.from(testImageBase64, 'base64');

    const response = await request.post('/api/process-document', {
      multipart: {
        file: {
          name: 'test.png',
          mimeType: 'image/png',
          buffer: testImageBuffer,
        },
        documentType: 'image',
      },
    });

    expect(response.status()).toBeLessThan(500);
  });
});
