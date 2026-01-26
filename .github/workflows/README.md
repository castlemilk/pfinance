# CI/CD Workflows

## Overview

```
PR opened/updated          Push to main
       │                        │
       ▼                        ▼
   ┌───────┐               ┌─────────┐
   │  CI   │               │   CI    │
   │ lint  │               │  lint   │
   │ test  │               │  test   │
   │ build │               │  build  │
   │ audit │               │  audit  │
   └───┬───┘               └────┬────┘
       │                        │
       ▼                        ▼
┌─────────────┐         ┌─────────────┐
│   Preview   │         │ Production  │
│   Deploy    │         │   Deploy    │
├─────────────┤         ├─────────────┤
│ Vercel      │         │ Vercel      │
│ Cloud Run   │         │ Cloud Run   │
│ (per PR)    │         │ Firebase    │
└─────────────┘         └─────────────┘
```

## Workflows

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| `ci.yml` | PR, push to main | Lint, test, build, security audit |
| `preview-deploy.yml` | PR | Deploy previews, cleanup on close |
| `production-deploy.yml` | Push to main | Deploy to production |

## Security Scanning

- **Frontend**: `npm audit` for dependency vulnerabilities
- **Backend**: `govulncheck` for Go vulnerabilities  
- **Container**: Trivy scan before production deploy

## Manual Deploys

```bash
# Trigger via GitHub UI: Actions → Deploy Production → Run workflow

# Or locally:
make deploy-backend    # Cloud Run
cd web && vercel --prod  # Vercel
make deploy-indexes    # Firebase
```

## Required Secrets

| Secret | Purpose |
|--------|---------|
| `VERCEL_TOKEN` | Vercel deployments |
| `NEXT_PUBLIC_API_URL` | API URL for frontend build |

Google Cloud uses Workload Identity Federation (no secrets needed).

## Concurrency

- **CI**: Cancels in-progress runs on same branch
- **Preview**: Cancels in-progress runs on same PR
- **Production**: Queues deploys (no cancellation)
