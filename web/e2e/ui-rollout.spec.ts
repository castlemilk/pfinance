import { expect, test } from '@playwright/test';

async function openMobileNavigationIfNeeded(
  page: import('@playwright/test').Page
) {
  const opener = page.getByRole('button', { name: 'Open navigation' });
  if (await opener.isVisible()) {
    await opener.click();
    await expect(
      page.getByRole('dialog', { name: 'Mobile navigation' })
    ).toBeVisible();
  }
}

function durationInMilliseconds(value: string) {
  const numericValue = Number.parseFloat(value);
  return value.endsWith('ms') ? numericValue : numericValue * 1000;
}

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
      if (!window.localStorage.getItem('pfinance-theme')) {
        window.localStorage.setItem('pfinance-theme', 'light');
      }
      if (!window.localStorage.getItem('pfinance-palette')) {
        window.localStorage.setItem('pfinance-palette', 'amber-terminal');
      }
    });

    await page.goto('/personal', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('main')).toBeVisible();
    await expect(
      page.getByText('UI Rollout Tester', { exact: true })
    ).toHaveCount(1, { timeout: 20_000 });
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
    const assistantTrigger = page.getByRole('button', {
      name: 'Open finance assistant',
    });
    // The dev-only mobile DebugPanel overlaps this production-absent pointer target.
    // Keyboard activation keeps the mobile fixture representative and accessible.
    if (await page.getByRole('button', { name: 'Open navigation' }).isVisible()) {
      await assistantTrigger.focus();
      await expect(assistantTrigger).toBeFocused();
      await page.keyboard.press('Enter');
    } else {
      await assistantTrigger.click();
    }

    const dialog = page.getByRole('dialog', { name: 'Finance Assistant' });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole('textbox', { name: 'Message finance assistant' })
    ).toBeVisible();

    const close = dialog.getByRole('button', { name: 'Close' });
    const newChat = dialog.getByRole('button', { name: 'Start new chat' });
    const controls = [
      close,
      dialog.getByRole('button', { name: 'Show chat history' }),
      newChat,
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

    const closeBox = await close.boundingBox();
    const newChatBox = await newChat.boundingBox();
    expect(closeBox).not.toBeNull();
    expect(newChatBox).not.toBeNull();
    expect(closeBox!.x - (newChatBox!.x + newChatBox!.width))
      .toBeGreaterThanOrEqual(8);
  });

  test('navigation contains no nested interactive controls', async ({ page }) => {
    const openNavigation = page.getByRole('button', {
      name: 'Open navigation',
    });
    if (await openNavigation.isVisible()) {
      await openNavigation.click();
      await expect(
        page.getByRole('dialog', { name: 'Mobile navigation' })
      ).toBeVisible();
    }

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

  test('theme and palette radio state persists across reloads', async ({
    page,
  }) => {
    await openMobileNavigationIfNeeded(page);

    const themeTrigger = page.getByRole('button', {
      name: 'Current theme: Light. Change theme',
    });
    await themeTrigger.click();
    const lightTheme = page.getByRole('menuitemradio', { name: 'Light' });
    const darkTheme = page.getByRole('menuitemradio', { name: 'Dark' });
    await expect(lightTheme).toHaveAttribute('aria-checked', 'true');
    await expect(darkTheme).toHaveAttribute('aria-checked', 'false');
    await darkTheme.click();

    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    expect(
      await page.evaluate(() => localStorage.getItem('pfinance-theme'))
    ).toBe('dark');

    const paletteTrigger = page.getByRole('button', {
      name: 'Current color palette: Amber Terminal. Change palette',
    });
    await paletteTrigger.click();
    const amberPalette = page.getByRole('menuitemradio', {
      name: 'Amber Terminal',
    });
    const retroPalette = page.getByRole('menuitemradio', {
      name: 'Soft Retro Chic',
    });
    await expect(amberPalette).toHaveAttribute('aria-checked', 'true');
    await expect(retroPalette).toHaveAttribute('aria-checked', 'false');
    await retroPalette.click();

    await expect(page.locator('html')).toHaveAttribute(
      'data-palette',
      'retro-chic'
    );
    expect(
      await page.evaluate(() => localStorage.getItem('pfinance-palette'))
    ).toBe('retro-chic');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('main')).toBeVisible();
    await expect(
      page.getByText('UI Rollout Tester', { exact: true })
    ).toHaveCount(1, { timeout: 20_000 });
    await openMobileNavigationIfNeeded(page);

    await expect(
      page.getByRole('button', {
        name: 'Current theme: Dark. Change theme',
      })
    ).toBeVisible();
    await page
      .getByRole('button', {
        name: 'Current theme: Dark. Change theme',
      })
      .click();
    await expect(
      page.getByRole('menuitemradio', { name: 'Dark' })
    ).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');

    await page
      .getByRole('button', {
        name: 'Current color palette: Soft Retro Chic. Change palette',
      })
      .click();
    await expect(
      page.getByRole('menuitemradio', { name: 'Soft Retro Chic' })
    ).toHaveAttribute('aria-checked', 'true');
  });

  test('reduced motion collapses global animation and scrolling', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });

    const styles = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.animationDuration = '1s';
      probe.style.animationIterationCount = 'infinite';
      probe.style.transitionDuration = '1s';
      document.body.append(probe);
      const probeStyle = getComputedStyle(probe);
      const result = {
        animationDuration: probeStyle.animationDuration,
        animationIterationCount: probeStyle.animationIterationCount,
        scrollBehavior: getComputedStyle(document.documentElement)
          .scrollBehavior,
        transitionDuration: probeStyle.transitionDuration,
      };
      probe.remove();
      return result;
    });

    expect(durationInMilliseconds(styles.animationDuration)).toBeCloseTo(0.01);
    expect(styles.animationIterationCount).toBe('1');
    expect(styles.scrollBehavior).toBe('auto');
    expect(durationInMilliseconds(styles.transitionDuration)).toBeCloseTo(0.01);
  });

  test('palette focus ring follows the alternate palette token', async ({
    browserName,
    page,
  }) => {
    await page.evaluate(() => {
      localStorage.setItem('pfinance-palette', 'midcentury');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute(
      'data-palette',
      'midcentury'
    );

    await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab');
    const skipLink = page.getByRole('link', { name: 'Skip to main content' });
    await expect(skipLink).toBeFocused();
    await skipLink.evaluate(async (element) => {
      await Promise.allSettled(
        element.getAnimations({ subtree: true }).map(({ finished }) => finished)
      );
    });

    const focusColors = await skipLink.evaluate((element) => {
      const probe = document.createElement('input');
      probe.style.caretColor = 'var(--ring)';
      probe.style.outlineColor = 'var(--ring)';
      document.body.append(probe);
      const probeStyles = getComputedStyle(probe);
      const elementStyles = getComputedStyle(element);
      const result = {
        caretColor: probeStyles.caretColor,
        expectedOutlineColor: probeStyles.outlineColor,
        focusVisible: element.matches(':focus-visible'),
        outlineColor: elementStyles.outlineColor,
        outlineStyle: elementStyles.outlineStyle,
        outlineWidth: elementStyles.outlineWidth,
      };
      probe.remove();
      return result;
    });

    expect(focusColors.focusVisible, JSON.stringify(focusColors)).toBe(true);
    expect(focusColors.outlineStyle, JSON.stringify(focusColors)).toBe('solid');
    expect(Number.parseFloat(focusColors.outlineWidth)).toBeGreaterThanOrEqual(
      2
    );
    expect(focusColors.outlineColor, JSON.stringify(focusColors)).toBe(
      focusColors.expectedOutlineColor
    );
    expect(focusColors.caretColor).toBe(focusColors.expectedOutlineColor);
  });

  test('audited theme and palette touch targets are at least 40px', async ({
    page,
  }) => {
    await openMobileNavigationIfNeeded(page);

    const assertTouchSize = async (
      locator: import('@playwright/test').Locator
    ) => {
      await expect(locator).toBeVisible();
      const box = await locator.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(40);
      expect(box!.height).toBeGreaterThanOrEqual(40);
    };
    const settleOpenMenuMotion = async () => {
      await page.getByRole('menu').evaluate(async (menu) => {
        await Promise.allSettled(
          menu.getAnimations({ subtree: true }).map(({ finished }) => finished)
        );
      });
    };

    const themeTrigger = page.getByRole('button', {
      name: /^Current theme:/,
    });
    const paletteTrigger = page.getByRole('button', {
      name: /^Current color palette:/,
    });
    await assertTouchSize(themeTrigger);
    await assertTouchSize(paletteTrigger);

    await themeTrigger.click();
    await settleOpenMenuMotion();
    for (const name of ['Light', 'Dark', 'System']) {
      await assertTouchSize(
        page.getByRole('menuitemradio', { name })
      );
    }
    await page.keyboard.press('Escape');

    await paletteTrigger.click();
    await settleOpenMenuMotion();
    for (const name of [
      'Amber Terminal',
      'Soft Retro Chic',
      'Mint & Peach',
      'Terracotta & Sage',
    ]) {
      await assertTouchSize(
        page.getByRole('menuitemradio', { name })
      );
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
