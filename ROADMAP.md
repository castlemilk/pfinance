# PFinance Roadmap

> Last Updated: February 2026

## Vision

PFinance is building **Australia's most intuitive personal finance platform** for both **individuals** and **households** — combining AI-powered automation, collaborative money management, and a retro design aesthetic that makes finance feel approachable.

**North Star Metric**: *Time to first useful insight* — a new user should understand their finances better within 2 minutes of signing up.

**Tech Stack**: Next.js 15, Go + Connect-RPC, Firebase Auth, Firestore, Gemini AI (extraction + NLP), self-hosted Qwen2-VL (receipt OCR).

---

## What's Shipped (v0.9)

Everything below is built, deployed, and working.

| Area | What's There |
|------|-------------|
| **Expense & Income Tracking** | Full CRUD, 15+ categories, visx visualizations, Sankey diagrams |
| **Smart Expense Entry** | Natural language parsing (Gemini Flash), dual ML extraction (Qwen2-VL + Gemini), image compression, debounced AI |
| **Goals System** | Savings/debt/spending goals, milestones, contribution tracking, progress visualization |
| **Spending Insights** | AI-generated analysis, category comparisons, trend detection |
| **Budget Management** | Category-based budgets with real-time progress tracking |
| **Multi-User Groups** | Role-based (owner/admin/member), invite links, expense splitting, balance tracking |
| **AU Salary Calculator** | ATO tax rates, superannuation, HECS-HELP, Medicare levy |
| **Reports & Export** | PDF generation, Sankey flow diagrams, financial summaries |
| **Design System** | 4 retro palettes (Amber Terminal, Soft Retro Chic, Mint & Peach, Terracotta & Sage), dark/light mode |
| **Marketing Site** | Landing page, pricing (Free / Pro $9/mo), feature showcase |
| **Auth & Security** | Firebase Auth, role-based access, ownership validation on all 43+ RPCs |
| **Backend** | 43+ Connect-RPC endpoints, Store interface abstraction (memory + Firestore) |
| **Frontend** | 76+ components, App Router, shadcn/ui, React Context state management |

---

## Phase 1: Polish & Monetize (Weeks 1-6)

*Theme: Fix foundations, ship features that justify charging money.*

### 1.1 Critical Foundations (Week 1-2)

**Replace `double` with `int64 amount_cents`**
- 18 proto fields in `types.proto` use `double` for money — binary floating-point is wrong for financial math
- Migration: add new `_cents` fields, dual-write, backfill, deprecate old fields
- Ref: TODO.md P1

**Implement pagination**
- `page_token` is defined in proto but not implemented (4 List endpoints)
- Affected: ListExpenses, ListGroups, ListInvitations, ListBudgets
- Ref: TODO.md P1

**Production security guards**
- Add environment check preventing `SKIP_AUTH=true` outside development
- File: `backend/cmd/server/main.go`
- Ref: TODO.md P0

**Frontend auth fixes**
- Fix auth initialization race condition (5s timeout fires before listener registers)
- Add Firebase initialization error boundary
- Ref: TODO.md P1

### 1.2 Recurring Transactions Engine (Week 2-3)

The `ExpenseFrequency` enum already exists (DAILY through ANNUALLY) but nothing processes it — expenses are created once and that's it.

- Backend: recurring transaction generator (cron job or on-access materialization)
- "Upcoming bills" section on dashboard showing next 7/30 days
- Recurring badge on expenses in list view
- Edit/pause/cancel recurring series

*Highest-impact feature per line of code — makes the app feel alive.*

### 1.3 Subscription Detection (Week 3-4)

Auto-detect recurring patterns in expense history (same merchant + similar amount + regular interval).

- Subscription dashboard: monthly total, renewal calendar, category breakdown
- "Forgotten subscription" alerts (no transaction in 60+ days from expected renewal)
- One-click "mark as recurring" from detection results

*Builds directly on 1.2. Extremely high perceived value.*

### 1.4 Full-Text Search (Week 4-5)

- New `SearchTransactions` RPC with filters (description, merchant, category, amount range, date range)
- Global search bar in sidebar (Cmd+K shortcut)
- Results across expenses, incomes, and group transactions

### 1.5 Notification & Alert System (Week 5-6)

- In-app notification center (bell icon in header)
- Budget threshold alerts (50%, 80%, 100% of limit)
- Goal milestone notifications
- Upcoming bill reminders (from recurring transactions)
- Unusual spending flags
- Optional weekly email digest
- Per-notification-type preferences

*Essential for retention — gives users a reason to come back.*

### 1.6 Stripe Integration (Week 6)

- Implement payment flow for Pro tier ($9/mo or $7/mo annual)
- Feature gating middleware (backend checks subscription status)
- Frontend feature gates with upgrade prompts
- Webhook handler for subscription lifecycle events

---

## Phase 2: Intelligence & Connectivity (Weeks 7-14)

*Theme: AI features that justify premium pricing + bank sync foundation.*

### 2.1 AI Financial Chatbot (Week 7-10)

Slide-out panel accessible from any page, with quick action chips.

| Type | Examples |
|------|----------|
| **Query** | "How much on food last month?" / "Am I on track for my savings goal?" |
| **Action** | "Add $45 groceries" / "Create a $500 dining budget" |
| **Proactive** | Spending alerts, weekly summaries, goal celebrations |

- Gemini function calling with existing RPCs as tools
- Confirmation step before any write operations
- Multi-turn conversation with session memory
- Quick action chips: "Spending summary", "Budget status", "Recent expenses"

*Core premium differentiator — no AU competitor has this.*

### 2.2 Predictive Analytics (Week 10-12)

- 30/60/90 day cash flow forecast using recurring transactions + spending history
- What-if scenarios with interactive sliders ("What if I cut dining by 20%?")
- End-of-month spending estimates per category
- Goal achievement probability with confidence intervals

### 2.3 Open Banking via Basiq (Week 11-14)

Staged rollout — recurring transactions and notifications must exist first so synced transactions benefit from them.

**Stage 1 — Infrastructure (Week 11-12)**
- Basiq API integration, OAuth consent flow
- Encrypted token storage, consent management
- Account connection UI

**Stage 2 — Transaction Sync (Week 13)**
- Daily auto-sync with AI categorization via existing merchant normalizer
- Duplicate detection against manual entries
- Sync status indicator

**Stage 3 — Reconciliation (Week 14)**
- Match synced transactions with existing manual entries
- Conflict resolution UI
- Multi-bank account overview

### 2.4 Enhanced Household Finance (Week 12-14)

- Shared savings goals with per-person contribution tracking
- Bill assignment & responsibility rotation
- "Our money" vs "My money" toggle for combined/individual views
- Income contribution visibility and fair-split recommendations

---

## Phase 3: Scale & Delight (Weeks 15-24)

*Theme: Power features, mobile presence, AU-specific value.*

### 3.1 Spending Heatmap & Visualizations (Week 15-16)

- GitHub-style spending heatmap calendar
- Category radar chart
- Net worth timeline
- Waterfall chart (income → expenses → savings)

*Highly shareable / screenshot-worthy.*

### 3.2 Smart Rules Engine (Week 16-18)

User-defined automation rules:
- Merchant rules: "Woolworths → always Food"
- Threshold rules: "Over $500 → notify immediately"
- Time-based rules: "Weekend food → Entertainment"
- Auto-apply on new transactions (manual + synced)

### 3.3 EOFY Tax Reports (Week 18-20)

- End of Financial Year report generation (Jul-Jun)
- Deductible expense report with category subtotals
- Superannuation summary
- HECS-HELP repayment summary
- ATO-friendly export formats (CSV, PDF)
- "Tax time checklist" feature

*Massive AU differentiator. Time release for April-May.*

### 3.4 PWA & Mobile Experience (Week 20-24)

- Service worker for offline support
- Add to Home Screen / install prompt
- Web Push notifications (integrates with 1.5 notification system)
- Camera-optimized receipt scanning flow
- Responsive design audit across all pages

*80% of native app value at 20% of the effort.*

### 3.5 ML Pipeline Enhancements (Ongoing)

- Confidence-based UI warnings ("Low confidence — please verify")
- User correction learning (track corrections, apply to future extractions)
- Multi-page PDF support with progress indicator
- Fallback chain: Self-hosted → Gemini → Manual entry prompt

*See [ML_ROADMAP.md](./ML_ROADMAP.md) for detailed ML-specific plans.*

---

## Future Vision (Post Week 24)

Evaluated based on user demand — explicitly NOT committed:

- **Mobile native app** — only if PWA proves insufficient
- **Investment tracking & net worth** — portfolio performance, dividends, asset allocation
- **AI financial advisor** — personalized recommendations, tax optimization, retirement projections
- **Multi-currency support** — currency detection, auto-conversion, historical rates
- **Voice entry** — speech-to-text piped into smart text parser

Explicitly deprioritized:

- **Social/community features** — low ROI, significant privacy concerns
- **Round-up savings** — requires bank integration maturity
- **Bill pay integration** — regulatory complexity outweighs value

---

## Technical Debt Tracker

Consolidated from [TODO.md](./TODO.md). Phase assignments indicate when each item should be addressed.

| Priority | Item | Phase | Status |
|----------|------|-------|--------|
| P0 | Production guard for `SKIP_AUTH=true` | 1 | Open |
| P1 | Implement pagination (4 List endpoints) | 1 | Open |
| P1 | Replace `double` with `int64 amount_cents` (18 fields) | 1 | Open |
| P1 | Fix auth initialization race condition | 1 | Open |
| P1 | Add Firebase initialization error boundary | 1 | Open |
| P2 | Extract pagination helper function | 1 | Open |
| P2 | Create query builder for Firestore (~200 lines saved) | 2 | Open |
| P2 | Create generic CRUD hook (~350 lines saved) | 2 | Open |
| P2 | Consolidate type definitions (use proto types directly) | 2 | Open |
| P2 | Fix context provider memory leaks | 2 | Open |
| P3 | Add batch update/delete operations | 3 | Open |
| P3 | Add soft delete support | 3 | Open |
| P3 | Improve offline support with sync queue | 3 | Open |
| P3 | Add optimistic updates | 3 | Open |

---

## Monetization Strategy

Aligned with the existing marketing site pricing (see `Pricing.tsx`).

### Free Tier
- Expense & income tracking
- Basic budgets (3 categories)
- Monthly reports
- Single user
- Data export

### Pro ($9/mo or $7/mo annual — save 22%)
- Everything in Free
- Unlimited budgets
- Advanced reports & analytics
- Multi-user groups (up to 10)
- AI-powered categorization
- Bank statement import
- Budget notifications
- AI chatbot
- Bank sync (Basiq)
- Cash flow forecasting
- EOFY tax reports
- API access
- Priority support

### Implementation
- Stripe integration in Phase 1 (Week 6)
- Feature gating middleware: backend checks subscription status on protected RPCs
- Frontend: conditional rendering with upgrade prompts for gated features
- 14-day free trial, no credit card required

---

## Success Metrics

Realistic targets for an early-stage product.

| Category | Metric | Target |
|----------|--------|--------|
| **North Star** | Time to First Value | < 2 minutes |
| **Growth** | Weekly Active Users (end of Phase 2) | 500 |
| **Revenue** | Pro conversion within 30 days | 5%+ |
| **Retention** | 7-day retention | 40%+ |
| **Performance** | Dashboard load time | < 2 seconds |
| **AI Quality** | Extraction accuracy (receipts) | 90%+ |
| **AI Quality** | Smart text parse accuracy | 95%+ |
| **Reliability** | Uptime | 99.9% |

---

## Risk Mitigation

| Risk | Impact | Mitigation | Contingency |
|------|--------|------------|-------------|
| Money type migration breaks existing data | High | Dual-write with new `_cents` fields, backfill script, feature flag rollout | Revert to double with rounding at display layer |
| Basiq API complexity / CDR compliance | High | Start with sandbox, scope to read-only initially | Enhanced CSV/PDF import as primary path |
| AI chatbot hallucinations | Medium | Constrain to function calling (no free-form answers about finances), confirmation before writes | Clarifying questions, fallback to manual search |
| Solo dev burnout | Medium | Strict phase gates, cut scope aggressively, ship MVP of each feature | Defer Phase 3 items, focus on monetization |
| Low early adoption | Medium | Ship EOFY reports before tax season (April), target AU finance Reddit/forums | Pivot to B2B expense tracking for small teams |

---

## Related Documentation

- [CLAUDE.md](./CLAUDE.md) — Development setup, commands, architecture
- [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) — UI/UX design guidelines and palette system
- [TODO.md](./TODO.md) — Detailed technical debt items
- [ML_ROADMAP.md](./ML_ROADMAP.md) — ML extraction pipeline roadmap
- [ARCHITECTURE.md](./ARCHITECTURE.md) — System architecture and design decisions

---

*This roadmap is a living document. Features and timelines adjust based on user feedback and what ships.*
