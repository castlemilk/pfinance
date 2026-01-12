# PFinance Makefile
# ==================

.PHONY: help dev dev-backend dev-backend-seed dev-frontend stop restart status test test-unit test-e2e test-watch test-all proto generate build lint format type-check logs clean setup install health ports check-ports check-port-backend check-port-frontend kill-port-backend kill-port-frontend seed-data seed-data-auth

# Default target
help:
	@echo "PFinance Development Commands"
	@echo "============================="
	@echo ""
	@echo "⚠️  Ports: Backend=$(BACKEND_PORT), Frontend=$(FRONTEND_PORT)"
	@echo ""
	@echo "Development Environment:"
	@echo "  make dev              - Start full development environment"
	@echo "  make dev-backend      - Start only backend services"
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
	@echo "  make test             - Run all tests"
	@echo "  make test-unit        - Run only unit tests"
	@echo "  make test-e2e         - Run e2e tests"
	@echo "  make test-watch       - Run tests in watch mode"
	@echo "  make test-all         - Run comprehensive test suite with linting and coverage"
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
	@echo "  make seed-data        - Seed test data (local dev user)"
	@echo "  make seed-data USER_ID=<id> - Seed data for specific user"
	@echo "  make seed-data-auth AUTH_TOKEN=<token> - Seed with Firebase auth"

# ===================
# Port Configuration (DO NOT CHANGE without updating all references)
# ===================
BACKEND_PORT := 8111
FRONTEND_PORT := 1234

# ===================
# Development Environment  
# ===================

dev: check-ports generate
	@echo "🚀 Starting full development environment..."
	@echo "   Backend:  http://localhost:$(BACKEND_PORT)"
	@echo "   Frontend: http://localhost:$(FRONTEND_PORT)"
	@make -j2 dev-backend dev-frontend

dev-backend: check-port-backend
	@echo "🔧 Starting backend service on port $(BACKEND_PORT)..."
	@cd backend && \
	export GOOGLE_CLOUD_PROJECT=pfinance-app-1748773335 && \
	export PORT=$(BACKEND_PORT) && \
	export USE_MEMORY_STORE=true && \
	go run cmd/server/main.go

dev-frontend: check-port-frontend
	@echo "🌐 Starting frontend service on port $(FRONTEND_PORT)..."
	@cd web && npm run dev -- -p $(FRONTEND_PORT)

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

kill-port-backend:
	@echo "🔪 Killing process on port $(BACKEND_PORT)..."
	@lsof -ti:$(BACKEND_PORT) | xargs kill -9 2>/dev/null || echo "   No process found"

kill-port-frontend:
	@echo "🔪 Killing process on port $(FRONTEND_PORT)..."
	@lsof -ti:$(FRONTEND_PORT) | xargs kill -9 2>/dev/null || echo "   No process found"

stop:
	@echo "🛑 Stopping all services..."
	@pkill -f "go run cmd/server/main.go" 2>/dev/null || true
	@pkill -f "next dev" 2>/dev/null || true
	@lsof -ti:$(BACKEND_PORT) | xargs kill -9 2>/dev/null || true
	@lsof -ti:$(FRONTEND_PORT) | xargs kill -9 2>/dev/null || true
	@echo "✅ All services stopped"

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

test: test-backend test-frontend

test-unit: test-backend-unit test-frontend-unit

test-backend:
	@echo "🧪 Running backend tests..."
	@cd backend && ./scripts/test.sh

test-backend-unit:
	@echo "🧪 Running backend unit tests..."
	@cd backend && go test ./internal/service -v

test-e2e:
	@echo "🌐 Running e2e tests..."
	@cd backend && go test ./tests -v

test-frontend:
	@echo "🧪 Running frontend tests..."
	@cd web && npm run test:ci

test-frontend-unit:
	@echo "🧪 Running frontend unit tests..."
	@cd web && npm run test

test-watch:
	@echo "👀 Running tests in watch mode..."
	@cd web && npm run test:watch

test-all: generate lint test
	@echo "✅ Comprehensive test suite completed!"

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
	@cd web && npm run lint

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

# Start backend without auth for seeding
dev-backend-seed: check-port-backend
	@echo "🔧 Starting backend in SEED mode (no auth) on port $(BACKEND_PORT)..."
	@cd backend && \
	export GOOGLE_CLOUD_PROJECT=pfinance-app-1748773335 && \
	export PORT=$(BACKEND_PORT) && \
	export USE_MEMORY_STORE=true && \
	export SKIP_AUTH=true && \
	go run cmd/server/main.go

seed-data:
	@echo "🌱 Seeding test data..."
	@echo "   API URL: http://localhost:$(BACKEND_PORT)"
	@echo "   User ID: $(or $(USER_ID),local-dev-user)"
	@echo ""
	@echo "ℹ️  Note: Backend must be running with SKIP_AUTH=true"
	@echo "   Run 'make dev-backend-seed' in another terminal first"
	@echo ""
	@cd backend && API_URL=http://localhost:$(BACKEND_PORT) USER_ID=$(or $(USER_ID),local-dev-user) go run scripts/seed-data.go

seed-data-auth:
	@echo "🌱 Seeding test data with authentication..."
	@if [ -z "$(AUTH_TOKEN)" ]; then \
		echo "❌ AUTH_TOKEN is required."; \
		echo ""; \
		echo "To get your auth token:"; \
		echo "1. Open your browser's DevTools (F12)"; \
		echo "2. Go to Application > Local Storage > your site"; \
		echo "3. Look for Firebase auth token or run in console:"; \
		echo "   firebase.auth().currentUser.getIdToken().then(t => console.log(t))"; \
		echo ""; \
		echo "Then run: make seed-data-auth AUTH_TOKEN=<your-token> USER_ID=<your-uid>"; \
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