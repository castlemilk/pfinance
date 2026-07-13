import { expect, test } from '@playwright/test';

test('Firebase notice is singular, hydrated, and does not block top navigation', async ({
  page,
}) => {
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
