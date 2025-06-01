#!/bin/bash

set -e

echo "🧪 Running PFinance Backend Tests"
echo "================================="

echo ""
echo "📦 Checking dependencies..."
go mod tidy

echo ""
echo "🏗️  Building server..."
go build ./cmd/server

echo ""
echo "🔧 Generating mocks..."
go generate ./internal/store

echo ""
echo "🧪 Running unit tests..."
go test ./internal/service -v

echo ""
echo "🌐 Running e2e tests..."
go test ./tests -v

echo ""
echo "📊 Running all tests with coverage..."
go test ./... -cover

echo ""
echo "✅ All tests passed!"
echo ""
echo "🚀 Ready to deploy!"