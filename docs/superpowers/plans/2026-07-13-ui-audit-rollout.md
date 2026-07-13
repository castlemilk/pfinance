# UI Audit Rollout Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the analytics enhancement with a responsive, accessible, palette-correct application shell and green clean-main browser journeys.

**Architecture:** Keep fixes at existing boundaries: shared finance behavior in its context/layout/components and global error/navigation behavior in the app shell. Existing contexts and Radix/shadcn primitives remain authoritative. Each behavior begins with a failing unit or E2E test and is committed independently.

**Tech Stack:** Next.js 16.1.4, React 19, TypeScript, Tailwind, shadcn/Radix, Jest/React Testing Library, Playwright, Go/Connect-RPC validation, Cuttlefish production deployment.

**Local E2E precondition:** Run `rtk make proto` once if backend generated packages are absent. Start `rtk make dev-backend-memory` and `rtk make dev-frontend` in separate long-running sessions from this rollout worktree, then run `rtk make status` and require backend 8111 plus frontend 1234 to be healthy. Only then use the `CI=1` Playwright commands below so Playwright does not launch competing servers.

---

## Chunk 1: Shared Finance Release Blocker

### Task 1: Repair the shared header and group-selection contract

**Files:**
- Create: `web/src/app/components/__tests__/EnhancedGroupSelector.test.tsx`
- Modify: `web/src/app/components/EnhancedGroupSelector.tsx`
- Modify: `web/src/app/context/multiuser/hooks/useGroups.ts`
- Modify: `web/src/app/context/__tests__/MultiUserFinanceContext.test.tsx`
- Modify: `web/src/app/(app)/shared/layout.tsx`
- Modify: `web/src/app/(app)/shared/expenses/page.tsx`
- Modify: `web/src/app/(app)/shared/reports/page.tsx`
- Modify: `web/src/app/components/GroupConfiguration.tsx`
- Test: `web/e2e/shared-analytics.spec.ts`

- [ ] Write RTL tests for the `h1`, active-group trigger label, radio-item checked state/member-count name, configured AUD/GBP/USD code, and mobile-safe wrapping classes.
- [ ] Write context tests for persisted active-group restoration, stale-preference fallback, refreshed-object reconciliation, per-user explicit-selection persistence, a deferred user-A response after switching to user B, and overlapping group IDs across users.
- [ ] Run `cd web && rtk npm test -- --runInBand --runTestsByPath src/app/context/__tests__/MultiUserFinanceContext.test.tsx src/app/components/__tests__/EnhancedGroupSelector.test.tsx`; expect RED because persistence, heading, labels, radio semantics, and display currency are absent.
- [ ] Run the existing shared analytics isolation test with `--retries=0` and confirm it fails at the missing level-one heading.
- [ ] Replace the item/check implementation with one Radix `DropdownMenuRadioGroup` and `DropdownMenuRadioItem` per group.
- [ ] Bind selection/request reconciliation to the current UID, ignore stale responses, invalidate state on UID changes, then reconcile current same-user selection, the user-scoped localStorage preference, and the first group; persist explicit changes.
- [ ] Make the toolbar `top-14 lg:top-0`, wrapping, `min-w-0`, and height-content-driven; keep every actionable control at least 40px.
- [ ] Demote authenticated shared-route child headings to `h2` so the shared-shell `h1` is unique.
- [ ] Derive the currency code from `FinanceContext.taxConfig.country` through the existing analytics currency formatter.
- [ ] Add a Playwright persistence case where group B is persisted while A is listed first, switching to A persists, reload keeps A active, and exactly A is the checked `menuitemradio`.
- [ ] Run `cd web && rtk npm test -- --runInBand --runTestsByPath src/app/context/__tests__/MultiUserFinanceContext.test.tsx src/app/components/__tests__/EnhancedGroupSelector.test.tsx`; expect GREEN.
- [ ] Run `cd web && rtk env CI=1 npx playwright test e2e/shared-analytics.spec.ts --project=chromium --workers=1 --retries=0`; expect all shared analytics and persistence journeys GREEN.
- [ ] Commit as `fix: repair shared finance selector contract`.

### Task 2: Remove the unavailable shared-income action

**Files:**
- Modify: `web/src/app/components/analytics/AnalyticsStates.tsx`
- Modify: `web/src/app/components/analytics/__tests__/AnalyticsWorkspaceShell.test.tsx`

- [ ] Replace the current group-income expectation with a failing test that renders truthful copy and no `/shared/income` anchor.
- [ ] Keep a separate test proving personal income still links to `/personal/income`.
- [ ] Keep a separate test proving a supplied custom action renders exactly once.
- [ ] Run `cd web && rtk npm test -- --runInBand --runTestsByPath src/app/components/analytics/__tests__/AnalyticsWorkspaceShell.test.tsx`; expect RED because the default group CTA still renders.
- [ ] Allow the default action to be absent only for group income, while preserving the action for group expenses/both states.
- [ ] Re-run the same exact command; expect GREEN.
- [ ] Commit as `fix: remove unavailable group income action`.

## Chunk 2: App-Shell Accessibility and Error State

### Task 3: Make Firebase failures hydration-safe and non-blocking

**Files:**
- Create: `web/src/app/components/__tests__/FirebaseInitBanner.test.tsx`
- Create: `web/src/app/components/__tests__/AppLayout.test.tsx`
- Modify: `web/src/app/components/FirebaseInitBanner.tsx`
- Modify: `web/src/app/components/AppLayout.tsx`
- Test: `web/src/app/layout.tsx`
- Create: `web/e2e/ui-rollout.spec.ts`

- [ ] Write an SSR/hydration regression test proving the server and initial client tree are empty and exactly one alert appears after hydration when an error exists.
- [ ] Write an AppLayout test proving it does not mount a second banner and that the alert location cannot overlay top navigation.
- [ ] Run `cd web && rtk npm test -- --runInBand --runTestsByPath src/app/components/__tests__/FirebaseInitBanner.test.tsx src/app/components/__tests__/AppLayout.test.tsx`; expect RED for initial client divergence, duplicate ownership, and fixed top placement.
- [ ] Gate the banner on a hydration-safe external-store snapshot and position the single root alert at a compact bottom-edge surface.
- [ ] Remove the AppLayout banner mount.
- [ ] Add the `Firebase notice is singular, hydrated, and does not block top navigation` journey to `web/e2e/ui-rollout.spec.ts`.
- [ ] Re-run the exact Jest command; expect GREEN, then run `cd web && rtk env CI=1 npx playwright test e2e/ui-rollout.spec.ts --project=chromium --workers=1 --retries=0 --grep 'Firebase'`; expect GREEN.
- [ ] Commit as `fix: make firebase error notice non-blocking`.

### Task 4: Repair navigation and assistant semantics

**Files:**
- Modify: `web/src/app/components/__tests__/AppLayout.test.tsx`
- Create: `web/src/app/components/chat/__tests__/ChatPanelAccessibility.test.tsx`
- Modify: `web/src/app/components/AppLayout.tsx`
- Modify: `web/src/app/auth/layout.tsx`
- Modify: `web/src/app/not-found.tsx`
- Modify: `web/src/app/components/SidebarNav.tsx`
- Modify: `web/src/app/components/chat/ChatPanel.tsx`
- Modify: `web/src/app/globals.css`
- Test: `web/src/app/components/__tests__/SidebarNavAnalytics.test.tsx`
- Modify: `web/e2e/ui-rollout.spec.ts`

- [ ] Write failing tests for `main-content`, labelled assistant trigger/input/send/history/new/clear controls, 40px targets, and the absence of buttons inside sidebar links.
- [ ] Run `cd web && rtk npm test -- --runInBand --runTestsByPath src/app/components/__tests__/AppLayout.test.tsx src/app/components/__tests__/SidebarNavAnalytics.test.tsx src/app/components/chat/__tests__/ChatPanelAccessibility.test.tsx`; expect RED for missing targets/names and nested controls.
- [ ] Add the skip target and accessible names; add one target to auth/not-found surfaces; use `auto` scrolling when reduced motion is requested.
- [ ] Convert every SidebarNav Link/Button pair to `Button asChild`, render disabled Shared as a button, and make account/sign-out sibling controls.
- [ ] Replace chat `transition: all`, make controls at least 40px, and preserve visible focus.
- [ ] Add skip-link focus, named assistant dialog, and no-nested-navigation journeys to `web/e2e/ui-rollout.spec.ts` before running the grep command.
- [ ] Re-run the exact Jest command; expect GREEN. Then run `cd web && rtk env CI=1 npx playwright test e2e/ui-rollout.spec.ts --project=chromium --workers=1 --retries=0 --grep 'skip|assistant|navigation'`; expect GREEN.
- [ ] Commit as `fix: harden app shell interactions`.

## Chunk 3: Design-System and Analytics Polish

### Task 5: Normalize audited target size, contrast, palette, and reduced motion

**Files:**
- Create: `web/src/app/components/__tests__/ThemePaletteControls.test.tsx`
- Modify: `web/src/app/components/ThemeToggle.tsx`
- Modify: `web/src/app/components/PaletteSelector.tsx`
- Modify: `web/src/app/components/SidebarNav.tsx`
- Modify: `web/src/app/components/EnhancedGroupSelector.tsx`
- Modify: `web/src/app/globals.css`

- [ ] Write failing tests for local 40px targets, foreground-on-tinted audited badges, radio-selected theme/palette state, and accessible trigger names.
- [ ] Run `cd web && rtk npm test -- --runInBand --runTestsByPath src/app/components/__tests__/ThemePaletteControls.test.tsx src/app/components/__tests__/EnhancedGroupSelector.test.tsx src/app/components/__tests__/SidebarNavAnalytics.test.tsx src/app/components/chat/__tests__/ChatPanelAccessibility.test.tsx`; expect RED for the old target classes, item semantics, and hard-coded accents.
- [ ] Add `min-h-10`/`min-w-10` only to the audited shell/sidebar/theme/palette/chat/group-selector controls.
- [ ] Use tinted token surfaces with `text-foreground` on the Pro, owner, and group-member-count badges without changing the global Badge primitive.
- [ ] Convert theme/palette menus to Radix radio groups; use Framer's reduced-motion signal and palette-aware glow tokens.
- [ ] Update the global reduced-motion rule with `animation-iteration-count: 1` and `scroll-behavior: auto`; replace the hard-coded focus amber with `--ring`.
- [ ] Add palette-state, reduced-motion, and audited 40px bounding-box journeys to `web/e2e/ui-rollout.spec.ts` before running their grep command.
- [ ] Re-run the exact Jest command; expect GREEN. Then run `cd web && rtk env CI=1 npx playwright test e2e/ui-rollout.spec.ts --project=chromium --workers=1 --retries=0 --grep 'palette|reduced motion|touch targets'`; expect GREEN.
- [ ] Commit as `fix: normalize palette-aware shell controls`.

## Chunk 4: Verification and Production Rollout

### Task 6: Verify, review, merge, deploy, and monitor

**Files:** No planned production edits.

- [ ] Run `rtk git diff --check main...HEAD` and inspect every changed file.
- [ ] Run `cd web && rtk npm run type-check && rtk npm run lint && rtk npm test -- --runInBand`.
- [ ] Run `cd web && rtk npm run build`.
- [ ] Generate protobuf code only as needed for the clean worktree, then run `cd backend && rtk go test ./... -count=1` and non-mutating backend builds.
- [ ] Run analytics E2E on Chromium, Firefox, WebKit, Mobile Chrome, and Mobile Safari.
- [ ] Inspect desktop/mobile, light/dark, every palette, missing-Firebase, keyboard, and reduced-motion rendering.
- [ ] Dispatch final spec and code-quality reviews; fix every Critical/Important issue and rerun its owning test.
- [ ] From `/Users/benebsworth/projects/pfinance-ui-rollout`, run `rtk git fetch origin main`, verify `rtk git merge-base --is-ancestor origin/main HEAD` and `rtk git merge-base --is-ancestor main HEAD`, and stop if either fails or if remote drift introduces commits not reviewed.
- [ ] Verify `/Users/benebsworth/projects/pfinance-main` is clean, fast-forward its local `main` with `rtk git merge --ff-only issue/ui-audit-rollout`, and inspect the resulting range. Never run merge, reset, clean, checkout, add, commit, or push from `/Users/benebsworth/projects/pfinance`.
- [ ] Push the verified clean `main` from `/Users/benebsworth/projects/pfinance-main` with `rtk git push origin main` to trigger Cuttlefish.
- [ ] Confirm the frontend production URL and `https://api.pfinance.app/health`; inspect rollout status/logs for failure.
- [ ] If production validation fails, stop rollout and use the documented Vercel/Cloud Run rollback path.
