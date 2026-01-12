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
- **AI-Powered Features**: Smart categorization, PDF bank statement import
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
│   ├── service/           # Business logic
│   │   └── finance_service.go
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
