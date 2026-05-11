# Product SEO Hardening Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Solidify customer-facing product surfaces by removing legacy import UI, fixing SEO metadata and structured data, adding missing public pages, and resolving mobile salary calculator regressions.

**Architecture:** Keep the existing Next.js App Router structure. Add public marketing pages as static server components, centralize reusable SEO page data, and keep app route fixes scoped to the affected components.

**Tech Stack:** Next.js App Router, TypeScript, Jest, React Testing Library, Playwright, Tailwind CSS, shadcn/ui.

---

### Task 1: SEO And Public Route Regressions

**Files:**
- Create: `web/src/app/(marketing)/__tests__/seo-routes.test.ts`
- Modify: `web/src/app/layout.tsx`
- Modify: `web/src/app/(marketing)/page.tsx`
- Modify: `web/src/app/(marketing)/blog/page.tsx`
- Modify: `web/src/components/seo/JsonLd.tsx`
- Modify: `web/src/app/sitemap.ts`

- [ ] Write failing Jest tests for canonical metadata, Open Graph images, sitemap URLs, JSON-LD trust claims, and legal/feature/tool route exports.
- [ ] Run the focused Jest file and confirm failures are for missing/faulty SEO behavior.
- [ ] Add legal and SEO landing pages with explicit metadata.
- [ ] Fix root/page metadata and JSON-LD.
- [ ] Run the focused Jest file until it passes.

### Task 2: Legacy Import Flow Removal

**Files:**
- Modify: `web/src/app/(app)/personal/expenses/page.tsx`
- Delete: `web/src/app/components/TransactionImport.tsx`
- Delete or replace: `web/src/app/components/__tests__/TransactionImport.test.tsx`
- Modify: `web/e2e/transaction-import.spec.ts`

- [ ] Write/update E2E expectations around the modern SmartExpenseEntry import modes and absence of legacy OpenAI-key/test import UI.
- [ ] Run the focused E2E and confirm it fails before implementation.
- [ ] Remove the legacy component from the expenses page and delete the dangerous unused component.
- [ ] Run the focused E2E until it passes.

### Task 3: App UX Hardening

**Files:**
- Modify: `web/src/app/components/SidebarNav.tsx`
- Modify: `web/src/app/components/salary-calculator/SalaryCalculatorNew.tsx`
- Modify: `web/src/app/components/salary-calculator/IncomeSection.tsx`
- Modify: `web/e2e/salary-calculator.spec.ts`

- [ ] Add/adjust E2E coverage for one app `h1`, accessible app controls, and no mobile horizontal overflow.
- [ ] Run focused E2E and confirm the current overflow failure.
- [ ] Replace sidebar brand `h1` with non-heading text.
- [ ] Tighten mobile calculator layout and action wrapping.
- [ ] Run focused E2E until stable.

### Task 4: Quality Gates

**Files:**
- Modify: `web/package.json`
- Optionally modify: `web/src/app/context/AuthWithAdminContext.tsx`

- [ ] Re-enable the lint command using the existing flat ESLint config.
- [ ] Remove targeted noisy auth console logging only if it does not conflict with existing dirty changes.
- [ ] Run `npm run type-check`, `npm run lint`, focused Jest, and focused Playwright.
