import { test, expect } from '@playwright/test';

test('projects super from user assumptions and explains contribution timing', async ({ page }) => {
  await page.goto('/tools/super-calculator');
  await expect(page.getByRole('heading', { name: 'Super calculator & estimator' })).toBeVisible();
  await page.getByLabel('Starting super balance (AUD)').fill('1000');
  await page.getByLabel('Average annual contributions (AUD)').fill('100');
  await page.getByLabel('Assumed annual return (%)').fill('5');
  await page.getByLabel('Years to project').fill('2');
  await expect(page.getByTestId('super-projected-balance')).toHaveText('$1,308');
  await expect(page.getByRole('img', { name: /Projected super balance/ })).toBeVisible();
  await page.getByText('Year-by-year breakdown', { exact: true }).click();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('row').last()).toContainText('$1,308');
  await expect(page.getByText(/added at the end of each year/)).toBeVisible();
});

test('invalid assumptions hide stale results and resetting recovers', async ({ page }) => {
  await page.goto('/tools/super-calculator');
  await page.getByLabel('Starting super balance (AUD)').fill('');
  await expect(page.getByTestId('super-projected-balance')).toHaveCount(0);
  await expect(page.getByLabel('Starting super balance (AUD)')).toHaveAttribute('aria-invalid', 'true');
  await page.getByRole('button', { name: 'Reset example' }).click();
  await expect(page.getByTestId('super-projected-balance')).toBeVisible();
});

test('is available alongside the salary calculator', async ({ page }) => {
  await page.goto('/personal/income');
  await page.getByRole('button', { name: 'Super Calculator', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Super growth calculator' })).toBeVisible();
});
