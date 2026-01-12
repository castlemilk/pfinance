---
name: pfinance-development
description: Full-stack pfinance development guidance. Use when working on the personal finance app, creating features, debugging issues, or understanding the codebase architecture. Covers Next.js frontend, Go backend, Connect-RPC API, Firebase integration, and protobuf workflows.
---

# PFinance Full-Stack Development

This skill provides comprehensive guidance for developing the pfinance personal finance application.

## Architecture Overview

PFinance is a full-stack personal finance application with:
- **Frontend**: Next.js 15 + React 19 + TypeScript + Tailwind + shadcn/ui
- **Backend**: Go + Connect-RPC (gRPC-Web compatible)
- **Data**: Firestore (prod) / In-memory store (dev)
- **Auth**: Firebase Authentication
- **Visualization**: visx for charts/visualizations

## Critical Port Configuration (DO NOT CHANGE)

- **Backend**: `http://localhost:8111` (NOT 8080)
- **Frontend**: `http://localhost:1234`
- **Health Check**: `http://localhost:8111/health`

## Project Structure

```
pfinance/
├── web/                    # Next.js frontend (App Router)
│   └── src/
│       ├── app/            # Pages and feature components
│       │   ├── components/ # Feature-specific React components
│       │   ├── context/    # React Context providers
│       │   └── utils/      # Utility functions
│       ├── components/ui/  # shadcn/ui components
│       ├── gen/            # Generated protobuf TS types
│       └── lib/            # Core services (firebase, financeService)
├── backend/                # Go backend
│   ├── cmd/server/         # Server entrypoint
│   └── internal/
│       ├── auth/           # Firebase auth middleware
│       ├── service/        # Business logic (FinanceService)
│       └── store/          # Data access (Firestore + Memory)
└── proto/                  # Protobuf definitions
    └── pfinance/v1/        # API contract definitions
```

## Development Commands

```bash
# Start full development environment
make dev

# Individual services
make dev-backend    # Go server on :8111 (in-memory store)
make dev-frontend   # Next.js on :1234

# Check service health
make status

# Run tests
make test           # All tests
make test-backend   # Backend only
make test-frontend  # Frontend only

# Code generation (after proto changes)
make proto          # Generate protobuf code
make generate       # Generate all (proto + mocks)

# Build
make build          # Build both frontend and backend
```

## Key Patterns

### Frontend State Management
```typescript
// Context hierarchy
<AuthProvider>
  <FinanceProvider>
    <MultiUserFinanceProvider>
      <App />
    </MultiUserFinanceProvider>
  </FinanceProvider>
</AuthProvider>
```

### Backend Service Pattern
```go
// Service implements the Connect-RPC interface
type FinanceService struct {
    store store.Store
    auth  auth.Authenticator
}

func (s *FinanceService) CreateExpense(ctx context.Context, req *connect.Request[v1.CreateExpenseRequest]) (*connect.Response[v1.CreateExpenseResponse], error) {
    // Implementation
}
```

### API Client Usage (Frontend)
```typescript
import { createClient } from "@bufbuild/connect";
import { FinanceService } from "@/gen/pfinance/v1/finance_service_connect";

const client = createClient(FinanceService, transport);
const response = await client.createExpense({ ... });
```

## Best Practices

1. **Always run `make proto` after changing `.proto` files**
2. **Use the store interface for data access** - enables testing with mocks
3. **Validate with Zod schemas** on the frontend for forms
4. **Use shadcn/ui components** from `@/components/ui/` for consistency
5. **Add tests** for new service methods and components
6. **Check `make status`** before debugging connectivity issues
