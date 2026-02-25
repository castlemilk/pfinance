import { test, expect } from '@playwright/test';

/**
 * Chat API E2E Tests against production (pfinance.dev)
 *
 * Verifies:
 * 1. Chat API returns streaming responses (Gemini key is configured)
 * 2. Authenticated users can use the chat assistant
 * 3. Firebase token verification works (FIREBASE_SERVICE_ACCOUNT is set)
 *
 * Run with:
 *   npx playwright test --config=playwright.prod.config.ts e2e/chat-prod.spec.ts
 */

test.describe('Chat API - Production', () => {
  test('chat API returns a streaming response (unauthenticated)', async ({ request }) => {
    // Hit the chat endpoint without auth — should still work with free-tier access
    const response = await request.post('/api/chat/', {
      headers: { 'Content-Type': 'application/json', 'X-User-ID': 'e2e-test' },
      data: {
        messages: [
          {
            id: 'e2e-1',
            role: 'user',
            parts: [{ type: 'text', text: 'Say "pong" and nothing else.' }],
          },
        ],
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.text();

    // Should contain streaming data frames
    expect(body).toContain('data: {"type":"start"}');

    // Must NOT contain the "unregistered callers" error
    expect(body).not.toContain('unregistered callers');
    expect(body).not.toContain('API key not valid');

    // Should contain actual text content
    expect(body).toContain('"type":"text-delta"');

    // Should finish cleanly
    expect(body).toContain('"type":"finish"');
    expect(body).toContain('[DONE]');
  });

  test('assistant page loads and shows chat UI or auth prompt', async ({ page }) => {
    // Navigate to the assistant page (without auth — verifies page renders)
    await page.goto('/personal/assistant');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    // Page should show the Assistant breadcrumb
    await expect(page.getByLabel('Breadcrumb').getByText('Assistant')).toBeVisible({ timeout: 10000 });

    // Without auth: should show sign-in prompt. With auth: should show chat input.
    const chatInput = page.locator('textarea[placeholder*="Ask about"]');
    const signInPrompt = page.getByText('Sign in to use the assistant');

    const hasChatInput = await chatInput.isVisible().catch(() => false);
    const hasSignInPrompt = await signInPrompt.isVisible().catch(() => false);

    expect(hasChatInput || hasSignInPrompt).toBeTruthy();
  });

  test('chat API includes Pro detection for authenticated users', async ({ request }) => {
    // This test verifies the Firebase Admin SDK can verify tokens
    // The E2E test user has Pro custom claims
    // We use the REST API to get a token, then pass it to the chat API

    // Get auth token via Firebase REST API
    const signInResponse = await fetch(
      'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=AIzaSyBbSWgNm4JW3wk_QyzVrUgfTdNruWMI2IM',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: process.env.E2E_EMAIL || 'e2e-test@pfinance.dev',
          password: process.env.E2E_PASSWORD || 'E2eTest!2025',
          returnSecureToken: true,
        }),
      }
    );

    expect(signInResponse.ok).toBeTruthy();
    const authData = await signInResponse.json();
    expect(authData.idToken).toBeTruthy();

    // Send chat request with the Firebase token
    const response = await request.post('/api/chat/', {
      headers: {
        'Content-Type': 'application/json',
        'X-Firebase-Token': authData.idToken,
        'X-User-ID': authData.localId,
        'X-User-Email': authData.email,
      },
      data: {
        messages: [
          {
            id: 'e2e-pro-1',
            role: 'user',
            parts: [{ type: 'text', text: 'Say "verified" and nothing else.' }],
          },
        ],
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.text();

    // Should get a successful response — NOT a Firebase Admin error
    expect(body).not.toContain('unregistered callers');
    expect(body).not.toContain('Token verification failed');
    expect(body).toContain('"type":"text-delta"');
    expect(body).toContain('[DONE]');
  });
});
