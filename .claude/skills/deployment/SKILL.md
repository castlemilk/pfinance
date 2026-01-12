---
name: deployment
description: Deployment and CI/CD guidance for pfinance. Use when setting up pipelines, deploying to preview/production, configuring Vercel or Cloud Run, or troubleshooting deployment issues.
---

# Deployment & CI/CD

This skill covers deployment workflows for the pfinance application.

## Architecture

```
┌─────────────────────┐     ┌─────────────────────┐
│   Frontend (Web)    │────▶│   Backend (API)     │
│   Vercel            │     │   Cloud Run         │
│   - Preview deploys │     │   - us-central1     │
│   - Prod deploys    │     │   - Firebase Auth   │
└─────────────────────┘     └─────────────────────┘
                                      │
                                      ▼
                            ┌─────────────────────┐
                            │   Firestore         │
                            │   (Database)        │
                            └─────────────────────┘
```

## Environments

| Environment | Frontend URL | Backend URL | Branch |
|-------------|--------------|-------------|--------|
| Local | http://localhost:1234 | http://localhost:8111 | - |
| Preview | *.vercel.app | preview-*.run.app | PR branches |
| Production | pfinance.app | api.pfinance.app | main |

## Frontend Deployment (Vercel)

### Configuration

```json
// web/vercel.json
{
  "framework": "nextjs",
  "regions": ["iad1"],
  "buildCommand": "npm run build",
  "installCommand": "npm install --legacy-peer-deps"
}
```

### Environment Variables (Vercel Dashboard)

```bash
# Firebase config
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# API URL (different per environment)
NEXT_PUBLIC_API_URL=https://api.pfinance.app  # Production
NEXT_PUBLIC_API_URL=https://preview-xxx.run.app  # Preview
```

### Manual Deploy

```bash
cd web
npx vercel --prod  # Production
npx vercel         # Preview
```

## Backend Deployment (Cloud Run)

### Configuration

```yaml
# backend/Dockerfile
FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY . .
RUN go build -o server cmd/server/main.go

FROM alpine:latest
COPY --from=builder /app/server /server
EXPOSE 8111
CMD ["/server"]
```

### Deploy Script

```bash
# backend/scripts/deploy.sh
#!/bin/bash
PROJECT_ID=pfinance-app-1748773335
REGION=us-central1
SERVICE_NAME=pfinance-backend

gcloud run deploy $SERVICE_NAME \
  --source . \
  --project $PROJECT_ID \
  --region $REGION \
  --allow-unauthenticated \
  --set-env-vars="GOOGLE_CLOUD_PROJECT=$PROJECT_ID"
```

### Manual Deploy

```bash
make deploy-backend
# or
cd backend && ./scripts/deploy.sh
```

## GitHub Actions CI/CD

### Workflow Overview

```
PR Opened/Updated
    │
    ├── Frontend Tests (web/)
    │   ├── Type Check
    │   ├── Lint
    │   └── Jest Tests
    │
    ├── Backend Tests (backend/)
    │   ├── Go Vet
    │   ├── Go Test
    │   └── Build Check
    │
    └── Preview Deploy (on success)
        ├── Deploy Frontend to Vercel Preview
        └── Deploy Backend to Cloud Run Preview

Merge to main
    │
    └── Production Deploy
        ├── Deploy Frontend to Vercel Production
        └── Deploy Backend to Cloud Run Production
```

### Required Secrets (GitHub)

```
# Vercel
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID

# Google Cloud
GCP_PROJECT_ID
GCP_SA_KEY  # Service account JSON (base64 encoded)

# Firebase (for backend auth)
FIREBASE_PROJECT_ID
```

## Local Development vs Production

### Environment Detection

```typescript
// Frontend
const isProduction = process.env.NODE_ENV === "production";
const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8111";
```

```go
// Backend
useMemoryStore := os.Getenv("USE_MEMORY_STORE") == "true"
if useMemoryStore {
    store = memory.NewMemoryStore()
} else {
    store = firestore.NewFirestoreStore(ctx)
}
```

## Troubleshooting

### Frontend Build Failures

```bash
# Check for TypeScript errors
cd web && npm run type-check

# Check for lint errors
cd web && npm run lint

# Clear cache and rebuild
cd web && rm -rf .next && npm run build
```

### Backend Deployment Failures

```bash
# Test Docker build locally
cd backend && docker build -t pfinance-backend .

# Check Cloud Run logs
gcloud run services logs read pfinance-backend --region=us-central1

# Verify service account permissions
gcloud projects get-iam-policy pfinance-app-1748773335
```

### CORS Issues

```go
// Backend must allow frontend origins
handler := cors.New(cors.Options{
    AllowedOrigins: []string{
        "http://localhost:1234",
        "https://*.vercel.app",
        "https://pfinance.app",
    },
    AllowedMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
    AllowedHeaders: []string{"*"},
})
```

## Health Checks

```bash
# Local
curl http://localhost:8111/health

# Production
curl https://api.pfinance.app/health

# Check all services
make status
```

## Rollback

### Frontend (Vercel)
1. Go to Vercel Dashboard → Deployments
2. Find previous working deployment
3. Click "..." → "Promote to Production"

### Backend (Cloud Run)
```bash
# List revisions
gcloud run revisions list --service=pfinance-backend --region=us-central1

# Rollback to specific revision
gcloud run services update-traffic pfinance-backend \
  --to-revisions=pfinance-backend-00001=100 \
  --region=us-central1
```
