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
- **Financial Visualizations** with visx charts

## Architecture Overview

### Frontend (Next.js 15 + TypeScript)

```
web/src/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # Root layout with providers
│   ├── page.tsx           # Main dashboard
│   ├── components/        # Feature components
│   │   ├── Dashboard.tsx
│   │   ├── ExpenseForm.tsx
│   │   ├── ExpenseList.tsx
│   │   ├── BudgetTracker.tsx
│   │   └── ...
│   ├── context/           # React Context providers
│   │   ├── AuthContext.tsx
│   │   ├── FinanceContext.tsx
│   │   └── MultiUserFinanceContext.tsx
│   └── utils/             # Utilities (categorization, PDF, reports)
├── components/ui/         # shadcn/ui components
├── gen/pfinance/v1/       # Generated protobuf types
└── lib/
    ├── firebase.ts        # Firebase client config
    └── financeService.ts  # Connect-RPC API client
```

### Backend (Go + Connect-RPC)

```
backend/
├── cmd/server/main.go     # Server entrypoint
├── internal/
│   ├── auth/              # Firebase Auth middleware
│   │   ├── firebase.go    # Token validation
│   │   ├── interceptor.go # Auth interceptor
│   │   └── local_dev.go   # Dev mode bypass
│   ├── extraction/        # ML document extraction
│   │   ├── service.go     # ExtractionService orchestration
│   │   ├── client.go      # Self-hosted ML HTTP client
│   │   ├── validator.go   # Gemini API integration
│   │   └── normalizer.go  # Merchant name & category mapping
│   ├── service/           # Business logic
│   │   ├── finance_service.go
│   │   └── extraction_handlers.go  # ExtractDocument, ParseExpenseText RPCs
│   └── store/             # Data access layer
│       ├── store.go       # Interface definition
│       ├── memory.go      # In-memory (dev)
│       ├── firestore.go   # Firestore (prod)
│       └── store_mock.go  # Generated mocks
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
<AuthProvider>           // Firebase authentication
  <FinanceProvider>      // Individual finance data
    <MultiUserFinanceProvider>  // Group features
      <App />
    </MultiUserFinanceProvider>
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

### GitHub Actions Workflows

- **PR Checks**: Type checking, linting, tests for both frontend and backend
- **Preview Deploys**: Auto-deploy PRs to preview environments
- **Production Deploy**: Deploy to production on merge to `main`

### Deployment Targets

- **Frontend**: Vercel (auto-deploys from GitHub)
- **Backend**: Google Cloud Run

## Project Dependencies

- Go 1.23+ (backend)
- Node.js 20+ (frontend)
- buf CLI (protobuf generation)
- Firebase project configured
- Google Cloud SDK (for deployment)

## Useful Links

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Detailed architecture documentation
- [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) - UI/UX design guidelines
- [BUDGET_IMPLEMENTATION.md](./BUDGET_IMPLEMENTATION.md) - Budget feature details
