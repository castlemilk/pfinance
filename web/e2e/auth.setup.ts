import { test as setup, expect } from '@playwright/test';
import path from 'path';

const AUTH_FILE = path.join(__dirname, '..', 'test-results', '.auth', 'user.json');

setup('authenticate demo user', async ({ page }) => {
  const email = process.env.E2E_EMAIL || 'test@example.com';
  const password = process.env.E2E_PASSWORD || 'testPassword123!';

  // Navigate to auth page
  await page.goto('/auth');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);

  // The auth page shows an AuthModal dialog automatically
  // Wait for the Sign In form to appear
  const emailInput = page.locator('#login-email');
  await expect(emailInput).toBeVisible({ timeout: 10000 });

  // Fill in credentials
  await emailInput.fill(email);
  await page.locator('#login-password').fill(password);

  // Click Sign In
  await page.getByRole('button', { name: /^Sign In$/i }).click();

  // Wait for redirect after successful login (redirects to /shared or /)
  await page.waitForURL(/\/(shared|personal|$)/, { timeout: 15000 });

  // Verify we're authenticated - should see user elements
  await page.waitForTimeout(2000);

  // Save the authenticated state (cookies, localStorage, etc.)
  await page.context().storageState({ path: AUTH_FILE });
});

export { AUTH_FILE };
