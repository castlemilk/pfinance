# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and Cursor when working with code in this repository.

## ⚠️ CRITICAL PORT CONFIGURATION - DO NOT CHANGE ⚠️

- **Backend Port**: **8111** (NOT 8080) - This is intentional to avoid conflicts with other local projects
- **Frontend Port**: **1234** (when using `npm run dev`)
- **API URL**: `http://localhost:8111`
- **NEVER change these ports without explicit user instruction**

## Project Overview

PFinance is a full-stack personal finance application with multi-user collaboration capabilities:

- **Expense & Income Tracking** with categories and recurring transactions
- **Multi-User Groups** for shared household finances
- **Budget Management** with progress tracking
- **AI-Powered Document Extraction**: Receipt/bank statement OCR via self-hosted ML (Qwen2-VL) or Gemini API
- **Smart Text Entry**: Natural language expense parsing with Gemini Flash
- **Financial Visualizations** with visx charts (Pro-tier: 6 chart types)
- **Tax Deduction Tracking**: AI classification, deduction finder, year comparison, ATO export (Pro-tier)
- **Receipt Vault**: Upload + store receipts, ZIP export by ATO category (Pro-tier)
- **Algolia Full-Text Search**: Real-time transaction search with tenant-isolated filters
- **Push Notifications / PWA**: FCM push tokens, service worker, install prompt
- **API Token Access**: Programmable access for Pro users (up to 5 tokens)
- **Stripe Billing**: Checkout, webhook, subscription management

## Architecture Overview

### Frontend (Next.js 15 + TypeScript)

```
web/src/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # Root layout with providers
│   ├── page.tsx           # Main dashboard
│   ├── (app)/personal/    # Routes: expenses, income, tax, analytics, goals, ...
│   ├── components/        # Feature components
│   │   ├── Dashboard.tsx, ExpenseForm.tsx, ExpenseList.tsx
│   │   ├── BulkUpload.tsx       # Multi-file import (CONCURRENCY=3, adaptive poll)
│   │   ├── SmartExpenseEntry.tsx
│   │   ├── TaxTrackerWidget.tsx, ReceiptViewer.tsx, InstallPrompt.tsx
│   │   └── tax/           # TaxReviewWizard, DeductionFinder, TaxYearComparison, ATODeadlineCard
│   ├── context/           # React Context providers
│   │   ├── AuthContext.tsx, FinanceContext.tsx, TaxContext.tsx
│   │   ├── NotificationContext.tsx  # 60s poll; 5min with FCM token
│   │   └── MultiUserFinanceContext.tsx
│   ├── hooks/             # usePushNotifications.ts, usePWAInstall.ts, useSubscription.ts
│   └── utils/             # Utilities (categorization, PDF, reports, receiptStorage)
├── components/ui/         # shadcn/ui components
├── gen/pfinance/v1/       # Generated protobuf types
└── lib/
    ├── firebase.ts        # Firebase client config (storage exported but rarely used directly)
    └── financeService.ts  # Connect-RPC API client
public/
└── firebase-messaging-sw.js  # FCM background message handler
```

### Backend (Go + Connect-RPC)

```
backend/
├── cmd/server/main.go     # Server entrypoint (wires all services + warmup scheduler)
├── internal/
│   ├── auth/              # Firebase Auth middleware
│   │   ├── firebase.go, interceptor.go, local_dev.go
│   │   └── apitoken.go    # API token interceptor (chain: Debug→ApiToken→Firebase)
│   ├── extraction/        # ML document extraction
│   │   ├── service.go     # ExtractionService + StartWarmupScheduler (45s Modal ping)
│   │   ├── client.go      # Self-hosted ML HTTP client
│   │   ├── normalizer.go  # Optimized merchant normalization (15 allocs/call)
│   │   ├── tax_classifier.go, tax_gemini.go, tax_pipeline.go
│   │   └── benchmark_test.go  # 6 benchmarks for extraction pipeline
│   ├── search/
│   │   └── algolia.go     # Tenant-isolated search (always uses claims.UID, escapeAlgoliaFilter)
│   ├── service/           # Business logic (109 RPCs total)
│   │   ├── finance_service.go, analytics_service.go
│   │   ├── extraction_handlers.go, tax_service.go, tax_deduction_finder.go
│   │   ├── receipt_service.go     # ExportReceipts ZIP
│   │   ├── push_notification_service.go  # FCM RegisterPushToken/UnregisterPushToken
│   │   ├── apitoken_service.go, stripe_client.go, stripe_webhook.go
│   │   ├── notification_triggers.go, recurring_processor.go, weekly_digest.go
│   │   └── ml_feedback_service.go
│   └── store/             # Data access layer
│       ├── store.go       # Interface (incl. BatchCreateExpenses, BatchDeleteExpenses)
│       ├── memory.go      # In-memory (dev)
│       ├── firestore.go   # Firestore (prod, TTL on notifications.ExpiresAt)
│       └── store_mock.go  # Generated mocks (go generate ./internal/store)
└── gen/pfinance/v1/       # Generated protobuf code
```

### Protocol Definitions

```
proto/pfinance/v1/
├── finance_service.proto  # RPC definitions
└── types.proto            # Shared message types
```

## Essential Commands

### Development

```bash
# Full stack development (recommended)
make dev

# Individual services
make dev-backend   # Go server on :8111 with in-memory store
make dev-frontend  # Next.js on :1234

# Check service health
make status

# Stop all services
make stop
```

### Testing

```bash
# Full test suite
make test

# Backend tests
make test-backend
cd backend && go test ./internal/service -v

# Frontend tests
make test-frontend
cd web && npm run test:watch
```

### Code Generation (Required after proto changes)

```bash
# Generate all protobuf code
make proto

# Generate mocks (after Store interface changes)
cd backend && go generate ./internal/store
```

### Build & Deploy

```bash
# Local build
make build

# Deployment
make deploy-backend   # Cloud Run
make deploy-frontend  # Vercel
```

## Key Architecture Patterns

### 1. Protocol-First API Design

All API contracts are defined in protobuf. After changing `.proto` files:

1. Run `make proto`
2. Update backend handler in `internal/service/`
3. Frontend types auto-generated in `web/src/gen/`

### 2. Store Interface Abstraction

```go
// Store interface enables testability and environment switching
type Store interface {
    CreateExpense(ctx context.Context, expense *Expense) error
    ListExpenses(ctx context.Context, userID string) ([]*Expense, error)
    // ...
}
```

- **Development**: `MemoryStore` (no external dependencies)
- **Production**: `FirestoreStore`

### 3. React Context State Management

```typescript
// Provider hierarchy
<AuthProvider>                    // Firebase authentication
  <FinanceProvider>               // Individual finance data
    <TaxProvider>                 // Tax estimates, reactive to expense changes
      <MultiUserFinanceProvider>  // Group features
        <App />
      </MultiUserFinanceProvider>
    </TaxProvider>
  </FinanceProvider>
</AuthProvider>
```

### 4. Connect-RPC Error Handling

```go
// Use appropriate error codes
connect.CodeInvalidArgument   // Bad request
connect.CodeUnauthenticated   // Not logged in
connect.CodeNotFound          // Resource not found
connect.CodeInternal          // Server error
```

### 5. Multi-Palette Theme System

PFinance supports 4 selectable retro color palettes, each with light and dark mode variants:

| ID | Name | Era/Style |
|----|------|-----------|
| `amber-terminal` | Amber Terminal (default) | 1970s CRT aesthetic |
| `retro-chic` | Soft Retro Chic | 1980s pastel diary |
| `midcentury` | Mint & Peach | 1950s kitchen appliance |
| `terracotta` | Terracotta & Sage | Organic rustic |

**Key Files:**
- **Palette config**: `web/src/app/constants/palettes.ts` - Palette metadata and types
- **CSS variables**: `web/src/app/globals.css` - All palette color definitions using `data-palette` attribute
- **Context**: `web/src/app/context/ThemeContext.tsx` - Provides `palette` state and `setPalette()` method
- **UI Component**: `web/src/app/components/PaletteSelector.tsx` - Dropdown selector in sidebar

**Usage Patterns:**
- Palettes use CSS variables that automatically adapt: `--primary`, `--secondary`, `--accent`, `--glow-color`
- Use Tailwind classes like `bg-primary`, `text-secondary` - they adapt to selected palette
- Glow effects use `--glow-color` variable and `.glow-hover` class
- Persistence: localStorage key `'pfinance-palette'`
- DOM: `data-palette` attribute on `<html>` element (absent for default amber-terminal)

## Development Notes

### Local Development

- Backend uses **in-memory store** by default (no Firebase/Firestore needed)
- Set `USE_MEMORY_STORE=true` for local development
- Authentication still validates Firebase tokens if configured

### Adding New Features

1. **Define API**: Add RPC to `proto/pfinance/v1/finance_service.proto`
2. **Generate**: Run `make proto`
3. **Implement Backend**: Add handler to `internal/service/finance_service.go`
4. **Update Store**: Add method to interface and implementations
5. **Frontend Integration**: Use generated types from `@/gen/pfinance/v1/`
6. **Add Tests**: Backend mocks + frontend integration tests

### Testing Strategy

- **Backend**: gomock for store mocks, test service methods directly
- **Frontend**: Jest + React Testing Library with mocked contexts
- **E2E**: `backend/tests/e2e_test.go`

## Performance Notes

### Modal Cold Start Prevention
`StartWarmupScheduler(45 * time.Second)` in `cmd/server/main.go` pings the ML service every 45s.
Modal containers idle out after 60s — without warmup, first extraction takes 5-10s extra.

### BulkUpload Concurrency
`CONCURRENCY = 3` in `BulkUpload.tsx` — up to 3 files processed simultaneously.
Adaptive async polling: `[500, 500, 750, 1000, 1250, 1500, 2000]ms` (not fixed 1500ms).

### Batch Store Operations
`BatchCreateExpenses` and `BatchDeleteExpenses` in the store interface use Firestore `client.Batch()`.
A 50-transaction import uses 1 batch commit (not 50 individual round trips).

### Extraction Benchmarks
Full pipeline (50 txns, mock server): ~188µs. Real bottleneck is Modal GPU: 2,000–10,000ms.
Run: `go test ./internal/extraction/... -bench=. -benchmem -benchtime=5s`

## ML Document Extraction Pipeline

PFinance includes a self-hosted ML pipeline for extracting expenses from receipts and bank statements.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Frontend (SmartExpenseEntry)                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ Smart Text  │  │ Photo/PDF   │  │ Manual Entry            │  │
│  │ (AI Parse)  │  │ Upload      │  │                         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│         │                │                                       │
│         ▼                ▼                                       │
│  ┌─────────────┐  ┌─────────────┐                               │
│  │ Gemini Flash│  │ Compress    │  (Images: max 1920px, 80%)   │
│  │ Text Parse  │  │ Image       │                               │
│  └─────────────┘  └─────────────┘                               │
└─────────────────────────────────────────────────────────────────┘
                                │
                         Connect-RPC
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Go Backend (Port 8111)                        │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ backend/internal/extraction/                                 ││
│  │  ├── service.go      - ExtractionService orchestration      ││
│  │  ├── client.go       - ML service HTTP client               ││
│  │  ├── validator.go    - Gemini API integration               ││
│  │  └── normalizer.go   - Merchant name & category mapping     ││
│  └─────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ backend/internal/service/extraction_handlers.go              ││
│  │  ├── ExtractDocument      - Document extraction RPC         ││
│  │  ├── ParseExpenseText     - Smart text parsing RPC          ││
│  │  └── ImportExtractedTransactions - Bulk import RPC          ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
┌─────────────────────────────┐ ┌─────────────────────────────────┐
│   Self-Hosted ML (Modal)    │ │      Gemini API (Google)        │
│  ┌───────────────────────┐  │ │  ┌───────────────────────────┐  │
│  │ Qwen2-VL-7B-Instruct  │  │ │  │ gemini-1.5-flash          │  │
│  │ - Receipt extraction  │  │ │  │ - Document extraction     │  │
│  │ - Bank statement OCR  │  │ │  │ - Text parsing            │  │
│  │ - A10G GPU on Modal   │  │ │  │ - Category detection      │  │
│  └───────────────────────┘  │ │  └───────────────────────────┘  │
│  URL: modal.run endpoint    │ │  Requires: GEMINI_API_KEY       │
└─────────────────────────────┘ └─────────────────────────────────┘
```

### Key Components

| Component | File | Purpose |
|-----------|------|---------|
| SmartExpenseEntry | `web/src/app/components/SmartExpenseEntry.tsx` | Main UI with 3 entry modes |
| ExtractionService | `backend/internal/extraction/service.go` | Orchestrates ML extraction |
| ValidationService | `backend/internal/extraction/validator.go` | Gemini API client |
| MLClient | `backend/internal/extraction/client.go` | Self-hosted ML HTTP client |
| MerchantNormalizer | `backend/internal/extraction/normalizer.go` | Name cleanup & categorization |

### Extraction Methods

Users can toggle between two extraction methods in the UI:

| Method | Icon | Description | Best For |
|--------|------|-------------|----------|
| Self-hosted ML | 🟢 CPU | Qwen2-VL-7B on Modal (private) | Privacy-sensitive documents |
| Gemini AI | 🔵 Cloud | Google's Gemini Flash API | Speed and accuracy |

### Smart Text Entry

The "Smart" entry mode uses Gemini Flash for natural language parsing:

**Example inputs:**
- `"Coffee $5.50"` → Coffee, $5.50, Food, one-time
- `"Monthly Netflix $15.99"` → Netflix, $15.99, Entertainment, monthly
- `"Split $50 dinner with John"` → Dinner, $50.00, Food, split with John
- `"Uber to airport $45 yesterday"` → Uber, $45.00, Transportation, yesterday's date

**Features:**
- 500ms debounce after typing stops
- Instant local regex parsing for immediate feedback
- AI enhancement with category detection and reasoning
- Date parsing (yesterday, last monday, etc.)
- Split detection (split with, share with)
- Frequency detection (monthly, weekly, annually)

### Image Compression

Before upload, images are compressed client-side:
- **Max dimension**: 1920px (maintains aspect ratio)
- **Quality**: 80% JPEG
- **UI states**: "Compressing image..." → "Processing receipt..."

### Environment Variables

**Backend (set in Makefile):**
```bash
ML_SERVICE_URL=https://ben-ebsworth--pfinance-extraction-7b-web-app.modal.run
GEMINI_API_KEY=<your-gemini-api-key>
```

**Frontend (web/.env.local):**
```bash
GEMINI_API_KEY=<your-gemini-api-key>  # For any client-side needs
```

### Proto Definitions

```protobuf
// Document extraction
rpc ExtractDocument(ExtractDocumentRequest) returns (ExtractDocumentResponse);
rpc ParseExpenseText(ParseExpenseTextRequest) returns (ParseExpenseTextResponse);
rpc ImportExtractedTransactions(ImportExtractedTransactionsRequest) returns (ImportExtractedTransactionsResponse);

// Extraction method enum
enum ExtractionMethod {
  EXTRACTION_METHOD_UNSPECIFIED = 0;
  EXTRACTION_METHOD_SELF_HOSTED = 1;  // Qwen2-VL on Modal
  EXTRACTION_METHOD_GEMINI = 2;       // Google Gemini API
}
```

### ML Service (Modal Deployment)

The self-hosted ML model runs on Modal serverless GPU:

```
ml-service/
├── src/
│   └── main.py              # FastAPI + vLLM inference
├── modal_app.py             # Modal deployment config
├── eval_runner.py           # Accuracy benchmarking
└── testdata/                # Test receipts with ground truth
```

**Deployment:**
```bash
cd ml-service
modal deploy modal_app.py
```

**Endpoint:** `https://ben-ebsworth--pfinance-extraction-7b-web-app.modal.run`

### Category Detection

Categories are detected via:
1. **ML model output** - Direct category from Gemini/Qwen
2. **Merchant normalizer** - Maps known merchants (Woolworths→Food, Uber→Transportation)
3. **Keyword fallback** - Generic keywords (restaurant→Food, pharmacy→Healthcare)

**Supported categories:**
Food, Housing, Transportation, Entertainment, Healthcare, Utilities, Shopping, Education, Travel, Other

## Environment Configuration

### Frontend (web/.env.local)

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_API_URL=http://localhost:8111
```

### Backend Environment

```bash
PORT=8111
GOOGLE_CLOUD_PROJECT=pfinance-app-1748773335
USE_MEMORY_STORE=true  # Set to false for Firestore

# ML Extraction (auto-set by Makefile)
ML_SERVICE_URL=https://ben-ebsworth--pfinance-extraction-7b-web-app.modal.run
GEMINI_API_KEY=<your-gemini-api-key>
```

## CI/CD Pipelines

CI/CD runs on Cuttlefish (project `pfinance`), not GitHub Actions; see
[.github/workflows/README.md](./.github/workflows/README.md). Keep `.github/workflows/`
free of workflow files: Cuttlefish runs them too.

| Workflow | Trigger | Description |
|----------|---------|-------------|
| `pfinance-ci` | PR into main, push to main | `scripts/ci/backend.sh` (proto-gen, gofmt, vet, race tests) and `scripts/ci/web.sh` (npm ci, type-check + lint + jest + contract tests in parallel, build) |
| `pfinance-deploy` | Push to main touching `web/**` or release scripts | `scripts/deploy-vercel-prebuilt.sh` → Vercel prod, then verifies pfinance.dev serves the commit |
| `pfinance-backend-deploy` | Push to main touching `backend/**`, `proto/**` | ko build → Cloud Run `pfinance-backend` (512Mi, max 5, min 0; env vars kept on the service) |

- Workflow YAML lives in the Cuttlefish repo (`workflows/pfinance-*.yaml`); the commands live here in `scripts/ci/`.
- Run CI locally with `make ci-backend` / `make ci-frontend`.
- Generator versions (buf, protoc-gen-go, protoc-gen-connect-go) are pinned in `scripts/ci/go-proto.sh`.
- Production installs use `npm ci` (`web/vercel.json`); never delete or bypass the lockfile.

### Deployment Targets

- **Frontend**: Vercel, prebuilt deploys from Cuttlefish (Git auto-deploys are off)
- **Backend**: Google Cloud Run (project: `pfinance-app-1748773335`, region `us-central1`)

### One-Time Setup Commands
```bash
make firestore-ttl    # Enable TTL policy on notifications.ExpiresAt (run once)
make deploy-indexes   # Deploy Firestore composite indexes (run once)
make algolia-setup    # Configure Algolia index settings (run once)
```

## Project Dependencies

- Go 1.25 (backend)
- Node.js 20+ (frontend)
- buf CLI (protobuf generation)
- Firebase project configured
- Google Cloud SDK (for deployment)

## Useful Links

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Detailed architecture documentation
- [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) - UI/UX design guidelines
- [BUDGET_IMPLEMENTATION.md](./BUDGET_IMPLEMENTATION.md) - Budget feature details
