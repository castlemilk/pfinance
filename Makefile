# PFinance Makefile
# ==================

.PHONY: help dev dev-memory dev-firebase dev-backend dev-backend-memory dev-backend-firebase dev-backend-seed dev-backend-firebase-seed dev-frontend stop restart status test test-unit test-e2e test-e2e-ui test-e2e-headed test-e2e-report test-integration test-watch test-all proto generate build lint format type-check logs clean setup install health ports check-ports check-port-backend check-port-frontend kill-port-backend kill-port-frontend seed-data seed-data-auth check-firebase-creds deploy-indexes

# Default target
help:
	@echo "PFinance Development Commands"
	@echo "============================="
	@echo ""
	@echo "⚠️  Ports: Backend=$(BACKEND_PORT), Frontend=$(FRONTEND_PORT)"
	@echo ""
	@echo "Development Environment:"
	@echo "  make dev              - Start full dev environment (Firestore - default)"
	@echo "  make dev-memory       - Start full dev environment (memory store)"
	@echo "  make dev-backend      - Start only backend (Firestore - default)"
	@echo "  make dev-backend-memory - Start only backend (memory store)"
	@echo "  make dev-frontend     - Start only frontend (requires backend running)"
	@echo "  make stop             - Stop all services"  
	@echo "  make restart          - Restart all services"
	@echo "  make status           - Show status of all services"
	@echo ""
	@echo "Port Management:"
	@echo "  make ports            - Show port configuration and usage"
	@echo "  make check-ports      - Check if ports are available"
	@echo "  make kill-port-backend  - Force kill process on backend port"
	@echo "  make kill-port-frontend - Force kill process on frontend port"
	@echo ""
	@echo "Testing:"
	@echo "  make test             - Run all tests (lint + unit + integration)"
	@echo "  make test-unit        - Run only unit tests"
	@echo "  make test-integration - Run only integration tests"
	@echo "  make test-e2e         - Run Playwright E2E tests"
	@echo "  make test-e2e-ui      - Run Playwright E2E tests with UI"
	@echo "  make test-e2e-headed  - Run Playwright E2E tests in headed mode"
	@echo "  make test-watch       - Run tests in watch mode"
	@echo "  make test-all         - Run comprehensive test suite with linting and coverage"
	@echo "  make install-hooks    - Install git pre-commit hooks"
	@echo ""
	@echo "Code Generation:"
	@echo "  make proto            - Generate code from protobuf definitions"
	@echo "  make generate         - Run all code generation"
	@echo ""
	@echo "Build & Quality:"
	@echo "  make build            - Build application (both frontend and backend)"
	@echo "  make lint             - Run linters"
	@echo "  make format           - Format code"
	@echo "  make type-check       - Run TypeScript type checking"
	@echo ""
	@echo "Utility:"
	@echo "  make logs             - Show logs from all services"
	@echo "  make clean            - Clean all generated files and data"
	@echo "  make setup            - Initial project setup"
	@echo "  make install          - Install dependencies for all services"
	@echo ""
	@echo "Test Data:"
	@echo "  make seed-data        - Seed test data (requires backend with SKIP_AUTH=true)"
	@echo "  make seed-data USER_ID=<id> - Seed data for specific user"
	@echo "  make seed-data-auth AUTH_TOKEN=<token> USER_ID=<uid> - Seed with Firebase auth"
	@echo "  make dev-backend-seed - Start backend for seeding (memory store, no auth)"
	@echo "  make dev-backend-firebase-seed - Start backend for seeding (Firestore, no auth)"
	@echo ""
	@echo "  To seed data for your Firebase user:"
	@echo "    1. Run 'make dev-firebase' (or 'make dev-backend-firebase')"
	@echo "    2. Sign in to the frontend"
	@echo "    3. Go to Settings page to get your User ID and Auth Token"
	@echo "    4. Run: make seed-data-auth AUTH_TOKEN=<token> USER_ID=<uid>"
	@echo ""
	@echo "Firebase:"
	@echo "  make deploy-indexes   - Deploy Firestore indexes (run once for new project)"

# ===================
# Port Configuration (DO NOT CHANGE without updating all references)
# ===================
BACKEND_PORT := 8111
FRONTEND_PORT := 1234

# ===================
# Development Environment  
# ===================

dev: clean-ports generate
	@echo "🔥 Starting full development environment (Firestore)..."
	@echo "   Backend:  http://localhost:$(BACKEND_PORT)"
	@echo "   Frontend: http://localhost:$(FRONTEND_PORT)"
	@make -j2 dev-backend dev-frontend

dev-memory: clean-ports generate
	@echo "🚀 Starting full development environment (memory store)..."
	@echo "   Backend:  http://localhost:$(BACKEND_PORT)"
	@echo "   Frontend: http://localhost:$(FRONTEND_PORT)"
	@make -j2 dev-backend-memory dev-frontend

dev-firebase: clean-ports generate
	@echo "🔥 Starting full development environment (Firestore)..."
	@echo "   Backend:  http://localhost:$(BACKEND_PORT)"
	@echo "   Frontend: http://localhost:$(FRONTEND_PORT)"
	@make -j2 dev-backend-firebase dev-frontend

dev-backend: check-port-backend
	@echo "🔥 Starting backend service on port $(BACKEND_PORT) (Firestore)..."
	@cd backend && \
	export GOOGLE_CLOUD_PROJECT=pfinance-app-1748773335 && \
	export PORT=$(BACKEND_PORT) && \
	export USE_MEMORY_STORE=false && \
	export GOOGLE_APPLICATION_CREDENTIALS=$(CURDIR)/pfinance-app-1748773335-firebase-adminsdk-fbsvc-4adcc18be2.json && \
	go run cmd/server/main.go

dev-backend-memory: check-port-backend
	@echo "🔧 Starting backend service on port $(BACKEND_PORT) (memory store)..."
	@cd backend && \
	export GOOGLE_CLOUD_PROJECT=pfinance-app-1748773335 && \
	export PORT=$(BACKEND_PORT) && \
	export USE_MEMORY_STORE=true && \
	go run cmd/server/main.go

dev-backend-firebase: check-port-backend
	@echo "🔥 Starting backend service on port $(BACKEND_PORT) (Firestore)..."
	@cd backend && \
	export GOOGLE_CLOUD_PROJECT=pfinance-app-1748773335 && \
	export PORT=$(BACKEND_PORT) && \
	export USE_MEMORY_STORE=false && \
	export GOOGLE_APPLICATION_CREDENTIALS=$(CURDIR)/pfinance-app-1748773335-firebase-adminsdk-fbsvc-4adcc18be2.json && \
	go run cmd/server/main.go

dev-frontend: check-port-frontend
	@echo "🌐 Starting frontend service on port $(FRONTEND_PORT)..."
	@cd web && npm run dev -- -p $(FRONTEND_PORT)

# ===================
# Firebase Credentials Check
# ===================

check-firebase-creds:
	@echo "🔍 Checking Firebase/Firestore credentials..."
	@if [ -z "$$GOOGLE_APPLICATION_CREDENTIALS" ]; then \
		if ! gcloud auth application-default print-access-token >/dev/null 2>&1; then \
			echo ""; \
			echo "❌ Google Cloud credentials not found!"; \
			echo ""; \
			echo "To use Firestore, you need to set up Application Default Credentials:"; \
			echo "  1. Run: gcloud auth application-default login"; \
			echo "  2. Or set GOOGLE_APPLICATION_CREDENTIALS to a service account key file"; \
			echo ""; \
			echo "For more info: https://cloud.google.com/docs/authentication/application-default-credentials"; \
			exit 1; \
		else \
			echo "✅ Using Application Default Credentials"; \
		fi; \
	else \
		if [ ! -f "$$GOOGLE_APPLICATION_CREDENTIALS" ]; then \
			echo "❌ Service account key file not found: $$GOOGLE_APPLICATION_CREDENTIALS"; \
			exit 1; \
		else \
			echo "✅ Using service account key: $$GOOGLE_APPLICATION_CREDENTIALS"; \
		fi; \
	fi

# ===================
# Port Management
# ===================

check-ports: check-port-backend check-port-frontend

check-port-backend:
	@if lsof -Pi :$(BACKEND_PORT) -sTCP:LISTEN -t >/dev/null 2>&1; then \
		echo "❌ Port $(BACKEND_PORT) is already in use!"; \
		echo "   Run 'make stop' or 'make kill-port-backend' to free it"; \
		exit 1; \
	fi

check-port-frontend:
	@if lsof -Pi :$(FRONTEND_PORT) -sTCP:LISTEN -t >/dev/null 2>&1; then \
		echo "❌ Port $(FRONTEND_PORT) is already in use!"; \
		echo "   Run 'make stop' or 'make kill-port-frontend' to free it"; \
		exit 1; \
	fi

# Clean up ports before starting (auto-cleanup for dev)
clean-ports:
	@if lsof -Pi :$(BACKEND_PORT) -sTCP:LISTEN -t >/dev/null 2>&1; then \
		echo "🧹 Cleaning up port $(BACKEND_PORT)..."; \
		pgrep -f "go run cmd/server/main.go" | xargs -r ps -o pid,ppid,command 2>/dev/null | grep -F "$$PWD/backend" | awk '{print $$1}' | xargs -r kill -9 2>/dev/null || true; \
		lsof -ti:$(BACKEND_PORT) | xargs kill -9 2>/dev/null || true; \
	fi
	@if lsof -Pi :$(FRONTEND_PORT) -sTCP:LISTEN -t >/dev/null 2>&1; then \
		echo "🧹 Cleaning up port $(FRONTEND_PORT)..."; \
		pgrep -f "next dev" | xargs -r ps -o pid,ppid,command 2>/dev/null | grep -F "$$PWD/web" | awk '{print $$1}' | xargs -r kill -9 2>/dev/null || true; \
		lsof -ti:$(FRONTEND_PORT) | xargs kill -9 2>/dev/null || true; \
	fi
	@sleep 1

kill-port-backend:
	@echo "🔪 Killing process on port $(BACKEND_PORT)..."
	@lsof -ti:$(BACKEND_PORT) | xargs kill -9 2>/dev/null || echo "   No process found"

kill-port-frontend:
	@echo "🔪 Killing process on port $(FRONTEND_PORT)..."
	@lsof -ti:$(FRONTEND_PORT) | xargs kill -9 2>/dev/null || echo "   No process found"

stop:
	@echo "🛑 Stopping all services (only for this project folder)..."
	@pgrep -f "go run cmd/server/main.go" | xargs -r ps -o pid,ppid,command | grep -F "$$PWD/backend" | awk '{print $$1}' | xargs -r kill -9 2>/dev/null || true
	@pgrep -f "next dev" | xargs -r ps -o pid,ppid,command | grep -F "$$PWD/web" | awk '{print $$1}' | xargs -r kill -9 2>/dev/null || true
	@lsof -ti:$(BACKEND_PORT) -a +c15 | xargs -r kill -9 2>/dev/null || true
	@lsof -ti:$(FRONTEND_PORT) -a +c15 | xargs -r kill -9 2>/dev/null || true
	@echo "✅ All project-local services stopped"

restart: stop
	@sleep 1
	@make dev

status:
	@echo "📊 Service Status:"
	@echo "=================="
	@printf "Backend  (port $(BACKEND_PORT)): "
	@HTTP_CODE=$$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 http://localhost:$(BACKEND_PORT)/health 2>/dev/null); \
	if [ "$$HTTP_CODE" = "200" ]; then echo "✅ Running (HTTP $$HTTP_CODE)"; \
	elif [ "$$HTTP_CODE" = "000" ]; then echo "❌ Not running"; \
	else echo "⚠️  Unhealthy (HTTP $$HTTP_CODE)"; fi
	@printf "Frontend (port $(FRONTEND_PORT)): "
	@HTTP_CODE=$$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 http://localhost:$(FRONTEND_PORT) 2>/dev/null); \
	if [ "$$HTTP_CODE" = "200" ]; then echo "✅ Running (HTTP $$HTTP_CODE)"; \
	elif [ "$$HTTP_CODE" = "000" ]; then echo "❌ Not running"; \
	else echo "⚠️  Status: HTTP $$HTTP_CODE"; fi

ports:
	@echo "📍 PFinance Port Configuration:"
	@echo "   Backend:  $(BACKEND_PORT)"
	@echo "   Frontend: $(FRONTEND_PORT)"
	@echo ""
	@echo "🔍 Current port usage:"
	@echo "   Port $(BACKEND_PORT): $$(lsof -Pi :$(BACKEND_PORT) -sTCP:LISTEN -t 2>/dev/null && echo 'IN USE' || echo 'FREE')"
	@echo "   Port $(FRONTEND_PORT): $$(lsof -Pi :$(FRONTEND_PORT) -sTCP:LISTEN -t 2>/dev/null && echo 'IN USE' || echo 'FREE')"

# ===================  
# Testing
# ===================

test-unit: test-backend-unit test-frontend-unit

test-integration: test-backend-integration test-frontend-integration

test-backend:
	@echo "🧪 Running backend tests..."
	@cd backend && ./scripts/test.sh

test-backend-unit:
	@echo "🧪 Running backend unit tests..."
	@cd backend && go test ./internal/service/... ./internal/auth/... -v

test-backend-integration:
	@echo "🧪 Running backend integration/e2e tests..."
	@cd backend && go test ./tests/... -v

test-frontend:
	@echo "🧪 Running frontend tests..."
	@cd web && npm run test:ci

test-frontend-unit:
	@echo "🧪 Running frontend unit tests..."
	@cd web && npm run test -- --testPathIgnorePatterns=integration --testPathIgnorePatterns=e2e

test-frontend-integration:
	@echo "🧪 Running frontend integration tests..."
	@cd web && npm run test -- app/__tests__/integration

test-e2e:
	@echo "🎭 Running Playwright E2E tests..."
	@cd web && npm run test:e2e

test-e2e-ui:
	@echo "🎭 Running Playwright E2E tests with UI..."
	@cd web && npm run test:e2e:ui

test-e2e-headed:
	@echo "🎭 Running Playwright E2E tests in headed mode..."
	@cd web && npm run test:e2e:headed

test-e2e-report:
	@echo "📊 Opening Playwright test report..."
	@cd web && npm run test:e2e:report

test-watch:
	@echo "👀 Running tests in watch mode..."
	@cd web && npm run test:watch

test-all: generate lint test
	@echo "✅ Comprehensive test suite completed!"

install-hooks:
	@echo "🪝 Installing git hooks..."
	@mkdir -p .git/hooks
	@cp scripts/pre-commit .git/hooks/pre-commit
	@chmod +x .git/hooks/pre-commit
	@echo "✅ Git hooks installed"

# ===================
# Code Generation  
# ===================

proto:
	@echo "🔧 Generating protobuf code..."
	@cd proto && buf generate

generate: proto
	@echo "🏗️  Running all code generation..."
	@cd backend && go generate ./internal/store

# ===================
# Build & Quality
# ===================

build: build-backend build-frontend

build-backend: generate
	@echo "🏗️  Building backend..."
	@cd backend && go build -o server cmd/server/main.go

build-frontend: generate  
	@echo "🏗️  Building frontend..."
	@cd web && npm run build

lint: lint-backend lint-frontend

lint-backend:
	@echo "🔍 Linting backend..."
	@cd backend && go vet ./...
	@cd backend && go fmt ./...

lint-frontend:
	@echo "🔍 Linting frontend..."
	@cd web && npm run lint && npm run type-check

test: lint test-unit test-integration
	@echo "✅ All checks and tests passed!"

format: format-backend format-frontend

format-backend:
	@echo "✨ Formatting backend code..."
	@cd backend && go fmt ./...

format-frontend:
	@echo "✨ Formatting frontend code..."
	@cd web && npm run lint --fix || true

# ===================
# Utility
# ===================

logs:
	@echo "📋 Recent logs:"
	@echo "==============="
	@echo "Backend logs:"
	@echo "No centralized logging - check terminal output"
	@echo ""
	@echo "Frontend logs:"  
	@echo "No centralized logging - check terminal output"

clean:
	@echo "🧹 Cleaning generated files..."
	@cd backend && rm -f server
	@cd web && rm -rf .next out
	@cd web && rm -rf node_modules/.cache
	@echo "✅ Clean completed"

setup: install generate
	@echo "🎯 Initial project setup completed!"

install: install-backend install-frontend

install-backend:
	@echo "📦 Installing backend dependencies..."
	@cd backend && go mod download

install-frontend:
	@echo "📦 Installing frontend dependencies..."
	@cd web && npm install --legacy-peer-deps

# ===================
# Development Helpers
# ===================

type-check:
	@echo "🔍 Running TypeScript type check..."
	@cd web && npm run type-check

# ===================
# Seed Data
# ===================

# Start backend without auth for seeding (memory store)
dev-backend-seed: check-port-backend
	@echo "🔧 Starting backend in SEED mode (no auth, memory store) on port $(BACKEND_PORT)..."
	@cd backend && \
	export GOOGLE_CLOUD_PROJECT=pfinance-app-1748773335 && \
	export PORT=$(BACKEND_PORT) && \
	export USE_MEMORY_STORE=true && \
	export SKIP_AUTH=true && \
	go run cmd/server/main.go

# Start backend without auth for seeding (Firestore)
dev-backend-firebase-seed: check-port-backend check-firebase-creds
	@echo "🔧 Starting backend in SEED mode (no auth, Firestore) on port $(BACKEND_PORT)..."
	@cd backend && \
	export GOOGLE_CLOUD_PROJECT=pfinance-app-1748773335 && \
	export PORT=$(BACKEND_PORT) && \
	export USE_MEMORY_STORE=false && \
	export SKIP_AUTH=true && \
	go run cmd/server/main.go

seed-data:
	@echo "🌱 Seeding test data..."
	@echo "   API URL: http://localhost:$(BACKEND_PORT)"
	@echo "   User ID: $(or $(USER_ID),local-dev-user)"
	@echo ""
	@echo "ℹ️  Note: Backend must be running with SKIP_AUTH=true"
	@echo "   For memory store: Run 'make dev-backend-seed' in another terminal"
	@echo "   For Firestore: Run 'make dev-backend-firebase-seed' in another terminal"
	@echo ""
	@cd backend && API_URL=http://localhost:$(BACKEND_PORT) USER_ID=$(or $(USER_ID),local-dev-user) go run scripts/seed-data.go

seed-data-auth:
	@echo "🌱 Seeding test data with authentication..."
	@if [ -z "$(AUTH_TOKEN)" ]; then \
		echo "❌ AUTH_TOKEN is required."; \
		echo ""; \
		echo "To get your auth token and user ID:"; \
		echo "1. Start the frontend: make dev-frontend"; \
		echo "2. Sign in to the app"; \
		echo "3. Go to Settings page (http://localhost:$(FRONTEND_PORT)/personal/settings)"; \
		echo "4. Copy your User ID and generate an Auth Token"; \
		echo "5. Run: make seed-data-auth AUTH_TOKEN=<token> USER_ID=<uid>"; \
		echo ""; \
		echo "Note: Backend must be running with Firebase auth enabled"; \
		echo "   (use 'make dev-backend-firebase' or 'make dev-firebase')"; \
		exit 1; \
	fi
	@if [ -z "$(USER_ID)" ]; then \
		echo "❌ USER_ID is required."; \
		echo ""; \
		echo "Get your User ID from the Settings page after signing in."; \
		exit 1; \
	fi
	@cd backend && API_URL=http://localhost:$(BACKEND_PORT) USER_ID=$(USER_ID) AUTH_TOKEN=$(AUTH_TOKEN) go run scripts/seed-data.go

dev-logs:
	@echo "📋 Following development logs..."
	@echo "Backend logs on port 8111, Frontend logs on port 1234"
	@echo "Press Ctrl+C to stop"

# ===================
# Docker Helpers (Optional)
# ===================

docker-build:
	@echo "🐳 Building Docker images..."
	@cd backend && docker build -t pfinance-backend .

docker-run:
	@echo "🐳 Running backend in Docker..."
	@docker run -p $(BACKEND_PORT):$(BACKEND_PORT) -e PORT=$(BACKEND_PORT) -e GOOGLE_CLOUD_PROJECT=pfinance-app-1748773335 pfinance-backend

# ===================
# Firebase/Cloud Deployment Helpers
# ===================

deploy-backend:
	@echo "🚀 Deploying backend to Cloud Run..."
	@cd backend && ./scripts/deploy.sh

deploy-frontend:
	@echo "🚀 Deploying frontend to Firebase Hosting..."
	@cd web && npm run deploy

deploy: deploy-backend deploy-frontend

# Deploy Firestore indexes
deploy-indexes:
	@echo "🔥 Deploying Firestore indexes..."
	@echo "   This requires Firebase CLI to be installed: npm install -g firebase-tools"
	@echo "   And logged in: firebase login"
	@firebase deploy --only firestore:indexes --project pfinance-app-1748773335
	@echo "✅ Indexes deployed (may take 1-3 minutes to build)"

# ===================
# CI Simulation
# ===================

ci-local: generate
	@echo "🔄 Running CI checks locally..."
	@echo ""
	@echo "Step 1/4: Backend tests..."
	@cd backend && go test -race -timeout=60s ./... || exit 1
	@echo "✅ Backend tests passed"
	@echo ""
	@echo "Step 2/4: Frontend lint & type-check..."
	@cd web && npm run lint && npm run type-check || exit 1
	@echo "✅ Lint & type-check passed"
	@echo ""
	@echo "Step 3/4: Frontend unit tests..."
	@cd web && npm test -- --passWithNoTests --maxWorkers=2 || exit 1
	@echo "✅ Frontend unit tests passed"
	@echo ""
	@echo "Step 4/4: E2E tests (Chromium only)..."
	@cd web && npx playwright test --project=chromium || exit 1
	@echo "✅ E2E tests passed"
	@echo ""
	@echo "🎉 All CI checks passed!"

ci-fast: generate
	@echo "⚡ Running fast CI checks (no E2E)..."
	@make -j2 ci-backend ci-frontend
	@echo "🎉 Fast CI checks passed!"

ci-backend:
	@echo "🧪 Backend CI..."
	@cd backend && go vet ./... && go test -race -timeout=60s ./...

ci-frontend:
	@echo "🧪 Frontend CI..."
	@cd web && npm run lint && npm run type-check && npm test -- --passWithNoTests --maxWorkers=2

# ===================
# Health Checks
# ===================

health:
	@echo "🏥 Health check:"
	@echo "================"
	@echo "Backend (port $(BACKEND_PORT)):"
	@curl -s http://localhost:$(BACKEND_PORT)/health || echo "  Not available"  
	@echo ""
	@echo "Frontend (port $(FRONTEND_PORT)):"
	@curl -s -o /dev/null -w "  Status: %{http_code}\n" http://localhost:$(FRONTEND_PORT) 2>/dev/null || echo "  Not available"