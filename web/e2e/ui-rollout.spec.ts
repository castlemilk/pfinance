import { expect, test } from '@playwright/test';

test.describe('Application shell interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('pfinance-admin-mode', 'true');
      window.localStorage.setItem(
        'pfinance-impersonated-user',
        JSON.stringify({
          uid: 'ui-rollout-shell-user',
          email: 'ui-rollout-shell-user@debug.local',
          displayName: 'UI Rollout Tester',
          photoURL: null,
        })
      );
    });

    await page.goto('/personal', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('main')).toBeVisible();
    await expect(
      page.getByRole('link', { name: /UI Rollout Tester/ })
    ).toBeVisible({ timeout: 20_000 });
  });

  test('skip link moves keyboard focus to the app main content', async ({
    page,
  }) => {
    await page.keyboard.press('Tab');
    const skipLink = page.getByRole('link', { name: 'Skip to main content' });
    await expect(skipLink).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
    await expect(page.getByRole('main')).toHaveAttribute('id', 'main-content');
  });

  test('assistant opens as a named dialog with named 40px controls', async ({
    page,
  }) => {
    await page
      .getByRole('button', { name: 'Open finance assistant' })
      .click();

    const dialog = page.getByRole('dialog', { name: 'Finance Assistant' });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole('textbox', { name: 'Message finance assistant' })
    ).toBeVisible();

    const controls = [
      dialog.getByRole('button', { name: 'Close' }),
      dialog.getByRole('button', { name: 'Show chat history' }),
      dialog.getByRole('button', { name: 'Start new chat' }),
      dialog.getByRole('button', { name: 'Send message' }),
    ];
    for (const control of controls) {
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(40);
      expect(box!.height).toBeGreaterThanOrEqual(40);
      expect(
        await control.evaluate((element) =>
          getComputedStyle(element).transitionProperty
        )
      ).not.toBe('all');
    }
  });

  test('navigation contains no nested interactive controls', async ({ page }) => {
    const primaryNavigation = page.getByRole('navigation', {
      name: 'Primary navigation',
    });
    await expect(primaryNavigation.locator('a button, button a')).toHaveCount(0);

    const personal = page.getByRole('link', { name: 'Personal' });
    const shared = page.getByRole('link', { name: 'Shared' });
    const account = page.getByRole('link', { name: /UI Rollout Tester/ });
    await expect(personal).toHaveAttribute('href', /^\/personal\/?$/);
    await expect(shared).toHaveAttribute('href', /^\/shared\/?$/);

    for (const target of [personal, shared, account]) {
      await expect(target.locator('button')).toHaveCount(0);
      expect(await target.evaluate((element) => element.parentElement?.tagName))
        .not.toBe('BUTTON');
      const box = await target.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(40);
    }
  });
});

test('Firebase notice is singular, hydrated, and does not block top navigation', async ({
  page,
}) => {
  test.skip(
    process.env.E2E_EXPECT_FIREBASE_INIT_ERROR !== '1',
    'Set E2E_EXPECT_FIREBASE_INIT_ERROR=1 when the target intentionally has no Firebase configuration.'
  );

  const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
  expect(response).not.toBeNull();

  const serverHtml = await response!.text();
  expect(serverHtml).not.toContain('Connection issue');

  // Next.js owns an empty route-announcer alert, so count the Firebase notice
  // by its user-facing message rather than conflating the two responsibilities.
  const notice = page
    .getByRole('alert')
    .filter({ hasText: 'Firebase configuration is missing' });
  await expect(notice).toHaveCount(1);
  await expect(notice).toContainText('Connection issue');

  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(navigation).toBeVisible();

  const noticeGeometry = await notice.evaluate((alert) => {
    const alertRect = alert.getBoundingClientRect();
    const navRect = document
      .querySelector('nav[aria-label="Main navigation"]')
      ?.getBoundingClientRect();

    return {
      alert: {
        bottom: alertRect.bottom,
        height: alertRect.height,
        top: alertRect.top,
        width: alertRect.width,
      },
      nav: navRect
        ? {
            bottom: navRect.bottom,
            left: navRect.left,
            right: navRect.right,
            top: navRect.top,
          }
        : null,
      pointerEvents: getComputedStyle(alert).pointerEvents,
      viewportHeight: window.innerHeight,
    };
  });

  expect(noticeGeometry.nav).not.toBeNull();
  expect(noticeGeometry.alert.top).toBeGreaterThan(
    noticeGeometry.viewportHeight / 2
  );
  expect(noticeGeometry.alert.bottom).toBeLessThanOrEqual(
    noticeGeometry.viewportHeight
  );
  expect(noticeGeometry.alert.height).toBeLessThanOrEqual(80);
  expect(noticeGeometry.pointerEvents).toBe('none');
  expect(noticeGeometry.alert.top).toBeGreaterThanOrEqual(
    noticeGeometry.nav!.bottom
  );
});
