---
name: go-backend
description: Go backend development guidance for pfinance. Use when working on backend services, adding new endpoints, writing tests, or debugging server issues.
---

# Go Backend Development

This skill covers backend development patterns for the pfinance Go server.

## Project Structure

```
backend/
├── cmd/server/
│   └── main.go           # Server entrypoint
├── internal/
│   ├── auth/
│   │   ├── firebase.go   # Firebase Auth validation
│   │   ├── interceptor.go # Auth middleware
│   │   └── local_dev.go  # Dev mode auth bypass
│   ├── service/
│   │   ├── finance_service.go      # Main service impl
│   │   ├── finance_service_test.go # Service tests
│   │   └── budget_service_test.go  # Budget tests
│   └── store/
│       ├── store.go      # Store interface
│       ├── firestore.go  # Firestore implementation
│       ├── memory.go     # In-memory implementation
│       └── store_mock.go # Generated mocks
└── gen/pfinance/v1/      # Generated protobuf code
```

## Running the Backend

```bash
# Development (in-memory store)
make dev-backend

# Or manually:
cd backend
export PORT=8111
export USE_MEMORY_STORE=true
go run cmd/server/main.go

# With Firestore (requires credentials)
export GOOGLE_CLOUD_PROJECT=pfinance-app-1748773335
export USE_MEMORY_STORE=false
go run cmd/server/main.go
```

## Adding a New Service Method

### 1. Define in Proto (see protobuf-workflow skill)

### 2. Implement the Handler

```go
// finance_service.go

func (s *FinanceService) NewMethod(
    ctx context.Context,
    req *connect.Request[v1.NewMethodRequest],
) (*connect.Response[v1.NewMethodResponse], error) {
    // 1. Extract user from context (auth interceptor sets this)
    userID := auth.UserIDFromContext(ctx)
    if userID == "" {
        return nil, connect.NewError(connect.CodeUnauthenticated, errors.New("user not authenticated"))
    }
    
    // 2. Validate request
    if req.Msg.RequiredField == "" {
        return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("required_field is required"))
    }
    
    // 3. Call store methods
    result, err := s.store.SomeOperation(ctx, userID, req.Msg)
    if err != nil {
        return nil, connect.NewError(connect.CodeInternal, err)
    }
    
    // 4. Return response
    return connect.NewResponse(&v1.NewMethodResponse{
        Result: result,
    }), nil
}
```

### 3. Add Store Method (if needed)

```go
// store/store.go - Add to interface
type Store interface {
    // Existing methods...
    SomeOperation(ctx context.Context, userID string, input *SomeInput) (*SomeOutput, error)
}

// store/memory.go - Implement for in-memory store
func (s *MemoryStore) SomeOperation(ctx context.Context, userID string, input *SomeInput) (*SomeOutput, error) {
    s.mu.Lock()
    defer s.mu.Unlock()
    // Implementation
}

// store/firestore.go - Implement for Firestore
func (s *FirestoreStore) SomeOperation(ctx context.Context, userID string, input *SomeInput) (*SomeOutput, error) {
    // Firestore implementation
}
```

### 4. Regenerate Mocks

```bash
cd backend
go generate ./internal/store
```

## Testing

### Service Tests with Mocks

```go
// finance_service_test.go

func TestCreateExpense(t *testing.T) {
    ctrl := gomock.NewController(t)
    defer ctrl.Finish()
    
    mockStore := store.NewMockStore(ctrl)
    svc := NewFinanceService(mockStore)
    
    // Setup expectations
    mockStore.EXPECT().
        CreateExpense(gomock.Any(), gomock.Any()).
        Return(&v1.Expense{Id: "exp-123"}, nil)
    
    // Call method
    ctx := auth.ContextWithUserID(context.Background(), "user-123")
    req := connect.NewRequest(&v1.CreateExpenseRequest{
        UserId:      "user-123",
        Description: "Test expense",
        Amount:      50.00,
    })
    
    resp, err := svc.CreateExpense(ctx, req)
    
    // Assert
    require.NoError(t, err)
    assert.Equal(t, "exp-123", resp.Msg.Expense.Id)
}
```

### Running Tests

```bash
# All backend tests
make test-backend

# Specific package
cd backend && go test ./internal/service -v

# Specific test
cd backend && go test ./internal/service -run TestCreateExpense -v

# With coverage
cd backend && go test ./... -coverprofile=coverage.out
```

## Connect-RPC Error Handling

```go
import "github.com/bufbuild/connect-go"

// Common error codes
connect.CodeInvalidArgument   // Bad request
connect.CodeUnauthenticated   // Not logged in
connect.CodePermissionDenied  // Not authorized
connect.CodeNotFound          // Resource not found
connect.CodeAlreadyExists     // Duplicate
connect.CodeInternal          // Server error

// Usage
return nil, connect.NewError(connect.CodeNotFound, fmt.Errorf("expense %s not found", id))
```

## Middleware/Interceptors

```go
// Auth interceptor extracts user from Firebase token
func AuthInterceptor() connect.UnaryInterceptorFunc {
    return func(next connect.UnaryFunc) connect.UnaryFunc {
        return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
            // Extract and validate token from Authorization header
            // Set user ID in context
            ctx = ContextWithUserID(ctx, userID)
            return next(ctx, req)
        }
    }
}
```

## Best Practices

1. **Always use the Store interface** - enables easy mocking
2. **Extract user ID from context** - set by auth interceptor
3. **Use proper Connect error codes** - helps frontend handling
4. **Write tests with gomock** - `go generate ./internal/store`
5. **Keep handlers thin** - business logic in store or separate packages
