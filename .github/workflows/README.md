# GitHub Actions Workflows

This directory contains CI/CD workflows for the pfinance project.

## Workflow Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Pull Request                            │
├─────────────────────────────────────────────────────────────────┤
│  ci.yml                    │  preview-deploy.yml                │
│  ├── Frontend              │  ├── Frontend → Vercel Preview    │
│  │   ├── Lint              │  └── Backend → Cloud Run Preview  │
│  │   ├── Type Check        │                                    │
│  │   ├── Tests             │  (Auto-cleanup on PR close)        │
│  │   └── Build             │                                    │
│  └── Backend               │                                    │
│      ├── Lint              │                                    │
│      ├── Tests             │                                    │
│      └── Build             │                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ Merge to main
┌─────────────────────────────────────────────────────────────────┐
│                       production-deploy.yml                      │
├─────────────────────────────────────────────────────────────────┤
│  ├── Frontend → Vercel Production                               │
│  └── Backend → Cloud Run Production                             │
│                                                                  │
│  (Auto-tag release on success)                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Workflows

### `ci.yml` - Continuous Integration

**Triggers:** Push to main, Pull requests to main

**Jobs:**
- **Frontend**
  - `frontend-lint`: TypeScript type checking + ESLint
  - `frontend-test`: Jest tests with coverage
  - `frontend-build`: Next.js production build
- **Backend**
  - `backend-lint`: Go vet + format check
  - `backend-test`: Go tests with race detection and coverage
  - `backend-build`: Binary compilation
- **Proto**
  - `proto-lint`: Buf lint + breaking change detection

### `preview-deploy.yml` - Preview Deployments

**Triggers:** Pull requests to main (opened, synchronize, reopened)

**Features:**
- Deploys frontend to Vercel preview URL
- Deploys backend to Cloud Run with PR-specific service name
- Comments preview URLs on PR
- Automatically cleans up preview environments when PR is closed

### `production-deploy.yml` - Production Deployments

**Triggers:** Push to main, Manual workflow dispatch

**Features:**
- Deploys frontend to Vercel production (pfinance.app)
- Deploys backend to Cloud Run production (api.pfinance.app)
- Creates release tags on successful deployment
- Health check verification after deployment

### `backend-deploy.yml` (Legacy)

Original backend deployment workflow. Kept for reference but superseded by `production-deploy.yml`.

### `frontend-test.yml` (Legacy)

Original frontend test workflow. Kept for reference but superseded by `ci.yml`.

## Required Secrets

Configure these in GitHub repository settings:

### Vercel

| Secret | Description |
|--------|-------------|
| `VERCEL_TOKEN` | Vercel API token |
| `VERCEL_ORG_ID` | Vercel organization ID |
| `VERCEL_PROJECT_ID` | Vercel project ID |

### Google Cloud

Workload Identity Federation is configured for keyless authentication.

| Environment Variable | Value |
|---------------------|-------|
| `PROJECT_ID` | `pfinance-app-1748773335` |
| `WORKLOAD_IDENTITY_PROVIDER` | `projects/859800863588/locations/global/workloadIdentityPools/github-pool/providers/github-provider` |
| `SERVICE_ACCOUNT` | `github-actions@pfinance-app-1748773335.iam.gserviceaccount.com` |

## Manual Deployment

### Frontend

```bash
# Preview
cd web && vercel

# Production
cd web && vercel --prod
```

### Backend

```bash
# Using Makefile
make deploy-backend

# Or script
cd backend && ./scripts/deploy.sh
```

## Troubleshooting

### Vercel Deployment Fails

1. Check `VERCEL_TOKEN` is valid and not expired
2. Verify Vercel project is linked: `cd web && vercel link`
3. Ensure build passes locally: `cd web && npm run build`

### Cloud Run Deployment Fails

1. Verify workload identity is configured correctly
2. Check service account has required permissions
3. Test Docker build locally: `cd backend && docker build -t test .`
4. Review Cloud Run logs: `gcloud run services logs read pfinance-backend --region=us-central1`

### Preview Cleanup Not Working

Preview services should auto-delete when PR is closed. If orphaned:

```bash
gcloud run services delete pfinance-backend-preview-pr-<number> \
  --region=us-central1 --quiet
```
