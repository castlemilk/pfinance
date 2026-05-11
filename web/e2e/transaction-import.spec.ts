import { test, expect } from '@playwright/test';

test.setTimeout(60_000);

test.describe('Modern expense import workspace', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/personal/expenses', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await expect(page.getByRole('heading', { name: 'Receipts & Statements' })).toBeVisible();
  });

  test('shows the modern expense entry and document import modes', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Receipts & Statements' })).toBeVisible();
    await expect(page.getByText('Add Expense', { exact: false }).first()).toBeVisible();

    await expect(page.getByRole('button', { name: /Quick Add/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Receipt$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Statement$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Bulk$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Manual$/i })).toBeVisible();
  });

  test('does not expose the legacy OpenAI-key import flow', async ({ page }) => {
    await expect(page.getByText('Import Transactions')).toHaveCount(0);
    await expect(page.getByText(/OpenAI API Key/i)).toHaveCount(0);
    await expect(page.getByText(/GPT-4/i)).toHaveCount(0);
    await expect(page.getByText('Test Import')).toHaveCount(0);
    await expect(page.getByLabel(/Enable PDF Import/i)).toHaveCount(0);
  });
});
