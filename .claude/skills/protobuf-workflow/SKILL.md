---
name: protobuf-workflow
description: Protobuf and Connect-RPC workflow guidance. Use when modifying API contracts, adding new RPC methods, updating message types, or generating code from proto files.
---

# Protobuf & Connect-RPC Workflow

This skill covers the protocol-first API development workflow for pfinance.

## File Locations

```
proto/
├── buf.yaml              # Buf configuration
├── buf.gen.yaml          # Code generation config
└── pfinance/v1/
    ├── finance_service.proto  # Service definitions (RPCs)
    └── types.proto            # Shared message types

# Generated code locations
backend/gen/pfinance/v1/           # Go generated code
web/src/gen/pfinance/v1/           # TypeScript generated code
```

## Adding a New RPC Method

### Step 1: Define in proto

```protobuf
// In finance_service.proto
service FinanceService {
  // Existing methods...
  
  // Add new method
  rpc GetDashboardStats(GetDashboardStatsRequest) returns (GetDashboardStatsResponse);
}

// Define request/response messages
message GetDashboardStatsRequest {
  string user_id = 1;
  google.protobuf.Timestamp start_date = 2;
  google.protobuf.Timestamp end_date = 3;
}

message GetDashboardStatsResponse {
  double total_expenses = 1;
  double total_income = 2;
  double net_savings = 3;
  map<string, double> category_breakdown = 4;
}
```

### Step 2: Generate Code

```bash
# Generate for both backend and frontend
make proto

# Or manually:
cd proto && buf generate
```

### Step 3: Implement Backend Handler

```go
// In backend/internal/service/finance_service.go
func (s *FinanceService) GetDashboardStats(
    ctx context.Context,
    req *connect.Request[v1.GetDashboardStatsRequest],
) (*connect.Response[v1.GetDashboardStatsResponse], error) {
    // Validate user from context
    userID := auth.UserIDFromContext(ctx)
    if userID == "" {
        return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("user not authenticated"))
    }
    
    // Implement logic using store
    // ...
    
    return connect.NewResponse(&v1.GetDashboardStatsResponse{
        TotalExpenses: totalExp,
        TotalIncome: totalInc,
        NetSavings: netSav,
    }), nil
}
```

### Step 4: Call from Frontend

```typescript
// In a React component or service
import { useFinanceClient } from "@/lib/financeService";

const client = useFinanceClient();
const stats = await client.getDashboardStats({
  userId: user.uid,
  startDate: Timestamp.fromDate(startDate),
  endDate: Timestamp.fromDate(endDate),
});
```

## Common Proto Types

### Timestamps
```protobuf
import "google/protobuf/timestamp.proto";

message Event {
  google.protobuf.Timestamp created_at = 1;
}
```

### Enums
```protobuf
// In types.proto
enum ExpenseCategory {
  EXPENSE_CATEGORY_UNSPECIFIED = 0;
  EXPENSE_CATEGORY_FOOD = 1;
  EXPENSE_CATEGORY_TRANSPORT = 2;
  // ...
}
```

### Nested Messages
```protobuf
message Budget {
  string id = 1;
  string name = 2;
  double amount = 3;
  BudgetPeriod period = 4;
  repeated ExpenseCategory categories = 5;
}
```

## Buf Commands

```bash
# Lint proto files
cd proto && buf lint

# Check for breaking changes
cd proto && buf breaking --against .git#branch=main

# Generate code
cd proto && buf generate

# Format proto files
cd proto && buf format -w
```

## Troubleshooting

### "type not found" errors
- Ensure import paths are correct in proto files
- Check `buf.yaml` for proper module configuration

### Generated code not updating
- Delete generated directories and regenerate
- Check `buf.gen.yaml` output paths

### Type mismatches between frontend/backend
- Always regenerate both after proto changes
- Verify `buf.gen.yaml` plugins are up to date
