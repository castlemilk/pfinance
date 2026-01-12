# PFinance Backend Service

This is the backend service for PFinance, providing multi-user finance tracking capabilities through a gRPC/Connect-RPC API.

## Architecture

- **Protocol**: Connect-RPC (gRPC-Web compatible)
- **Database**: Google Firestore
- **Authentication**: Firebase Auth
- **Deployment**: Google Cloud Run

## Local Development

### Prerequisites
- Go 1.22+
- buf CLI (`brew install bufbuild/buf/buf`)
- Google Cloud SDK configured

### Setup

1. Generate protobuf code:
```bash
cd ../proto
buf generate
```

2. Install dependencies:
```bash
go mod download
```

3. Set environment variables:
```bash
export GOOGLE_CLOUD_PROJECT=pfinance-app-1748773335
export PORT=8111
```

4. Run the server:
```bash
go run cmd/server/main.go
```

The server will be available at http://localhost:8111

## API Endpoints

The service implements the following RPC methods:

### User Operations
- `GetUser` - Get user profile
- `UpdateUser` - Update user profile

### Expense Operations
- `CreateExpense` - Create a new expense
- `UpdateExpense` - Update existing expense
- `DeleteExpense` - Delete an expense
- `ListExpenses` - List expenses with filters
- `BatchCreateExpenses` - Create multiple expenses

### Income Operations
- `CreateIncome` - Create a new income entry
- `UpdateIncome` - Update existing income
- `DeleteIncome` - Delete an income entry
- `ListIncomes` - List income entries

### Group Operations
- `CreateGroup` - Create a finance group
- `GetGroup` - Get group details
- `UpdateGroup` - Update group settings
- `DeleteGroup` - Delete a group
- `ListGroups` - List user's groups

### Group Member Operations
- `InviteToGroup` - Send group invitation
- `AcceptInvitation` - Accept group invitation
- `DeclineInvitation` - Decline invitation
- `RemoveFromGroup` - Remove member from group
- `UpdateMemberRole` - Change member's role

### Tax Configuration
- `GetTaxConfig` - Get tax settings
- `UpdateTaxConfig` - Update tax settings

## Deployment

The service is automatically deployed to Google Cloud Run via GitHub Actions when changes are pushed to the main branch.

### Manual Deployment

```bash
# Build and push Docker image
docker build -t gcr.io/pfinance-app-1748773335/pfinance-backend:latest .
docker push gcr.io/pfinance-app-1748773335/pfinance-backend:latest

# Deploy to Cloud Run
gcloud run deploy pfinance-backend \
  --image gcr.io/pfinance-app-1748773335/pfinance-backend:latest \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --port 8080
```

## Testing

### Quick Test Run
```bash
go test ./...
```

### Comprehensive Test Suite
```bash
./scripts/test.sh
```

This runs:
- Dependency checks
- Code generation (protobuf & mocks)
- Unit tests with mocks
- E2E integration tests
- Coverage analysis

### Test Coverage
- **Unit Tests**: 51.7% coverage on service layer
- **Integration Tests**: Full Connect-RPC interface validation
- **E2E Tests**: HTTP client-server communication

### Test Architecture
- **Store Interface**: Abstracted database layer with Uber Go Mock
- **Service Layer**: Business logic with comprehensive unit tests
- **Connect Integration**: E2E tests validating gRPC-Web compatibility
- **Firestore Implementation**: Production-ready store implementation

## Project Structure

```
backend/
├── cmd/
│   └── server/         # Main server application
├── internal/
│   └── service/        # Service implementations
├── gen/                # Generated protobuf code
├── go.mod              # Go module definition
├── go.sum              # Go module checksums
├── Dockerfile          # Container definition
└── README.md           # This file
```