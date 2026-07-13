# UI Audit Rollout Design

Date: 2026-07-13
Status: Approved by the user's “roll this out now” instruction after the UI review
Parent design: `docs/superpowers/specs/2026-07-13-analytics-individual-group-enhancement-design.md`

## Outcome

Ship the completed individual and group analytics offering without the app-shell defects found during the clean-main UI audit. The rollout must make shared analytics pass its committed browser contract, keep navigation and assistant controls semantically valid, surface Firebase setup failures without blocking the product, and preserve the four-palette visual system across accessible interaction states.

## Scope

1. Make the shared finance header responsive and expose its active group as a labelled radio selection.
2. Restore and persist the active group per user so direct shared-route loads have a deterministic scope.
3. Use the viewing member's configured country for the group currency label.
4. Remove the dead shared-income CTA and keep the empty-state copy truthful until the product defines direct group income versus contributed personal income.
5. Render the Firebase initialization alert once, only after hydration, away from primary navigation.
6. Restore the root skip link by adding the app-shell target.
7. Remove nested interactive elements from the sidebar and label the assistant controls.
8. Bring audited shared-shell, sidebar, theme, palette, and chat controls to the 40px interaction target without globally resizing every Button.
9. Express selected theme and palette choices with radio semantics and respect reduced motion.
10. Replace hard-coded amber shell accents and audited low-contrast badges with palette-aware tokens.

## Constraints

- Do not modify the user's dirty `/Users/benebsworth/projects/pfinance` worktree.
- Work from clean local `main` in `/Users/benebsworth/projects/pfinance-ui-rollout`.
- Keep backend port 8111 and frontend port 1234.
- Do not introduce a second component library, icon set, global state system, or chart library.
- Preserve scope isolation: the active group remains the authority for shared income and analytics.
- No production deployment until unit, type, lint, build, backend, and targeted cross-browser journeys pass.

## Interaction Design

The shared header becomes a wrapping, mobile-safe toolbar beneath the fixed mobile app header. “Shared Finance” is the page-level heading. The group trigger announces `Active finance group: <name>` (or `Select a finance group`) and its options are a single radio group with member counts in their accessible names. Secondary controls wrap rather than causing page overflow.

The group context binds every selection to the authenticated UID. A UID change invalidates the current group immediately and stale list responses for the previous UID are ignored. For one unchanged UID, each loaded list reconciles against the current selection, then the user-scoped `pfinance-active-group-<uid>` preference, and finally the first available group. Explicit selection persists under the same key. Refreshed data replaces the active group object without retaining a stale group or crossing users, including when two users have groups with the same ID.

Firebase configuration failures appear as one compact, hydrated alert near the bottom edge. It remains visible but no longer covers navigation or changes the server/client first-render tree. App navigation uses one interactive element per action; account navigation and sign-out are siblings.

Theme and palette menus use native Radix radio-item state. Motion collapses to immediate state changes when reduced motion is requested. Palette identity comes from design tokens, including focus, Pro status, hover glow, and badge surfaces.

## Group-Income Empty State

PFinance currently has backend/context group-income operations but no approved UI decision between direct group income and contributing an existing personal income. The current `/shared/income` link is therefore removed. Group income emptiness retains clear explanatory copy without a deceptive CTA; personal income keeps its existing action and explicit custom actions remain supported.

## Deferred Follow-ups

First-class shared-income CRUD and lazy analytics-view retention remain separate guarded stories. Shared income needs a product decision about direct versus contributed income. View retention needs RPC-count guarantees for period and scope changes. Neither blocks the current analytics release, and neither is included in this production hotfix.

## Verification

- Jest/RTL tests prove heading, radio, currency, truthful empty-state action, hydration, skip target, labels, non-nesting, selected-state, reduced-motion, and local target sizing.
- The existing shared analytics Playwright suite is the authoritative red/green contract for the shared shell and responsive behavior.
- Analytics desktop/mobile journeys run on Chromium, Firefox, WebKit, Mobile Chrome, and Mobile Safari.
- A browser pass checks missing-Firebase error state, all four palettes, light/dark mode, keyboard navigation, and 390px layout.
- Production rollout occurs by updating `main`; existing Cuttlefish jobs deploy Vercel and Cloud Run. Post-deploy checks cover frontend reachability and backend health.
