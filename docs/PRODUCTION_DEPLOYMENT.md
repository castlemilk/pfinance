# Production Deployment Guide for pfinance.dev

## Prerequisites

Before deploying, ensure you have:
- [ ] Domain `pfinance.dev` purchased and configured
- [ ] Vercel account connected to GitHub repo
- [ ] Google Cloud project `pfinance-app-1748773335` with Cloud Run enabled
- [ ] GitHub secrets configured

## Required GitHub Secrets

Set these in **Settings → Secrets and variables → Actions**:

| Secret | Description |
|--------|-------------|
| `VERCEL_TOKEN` | Vercel API token |
| `VERCEL_ORG_ID` | Vercel organization ID |
| `VERCEL_PROJECT_ID` | Vercel project ID |

## Vercel Project Setup

### 1. Link Repository
```bash
cd web
vercel link
```

### 2. Add Environment Variables in Vercel Dashboard
Go to **Project → Settings → Environment Variables** and add:

| Variable | Production Value |
|----------|------------------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Your Firebase API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `pfinance-app-1748773335.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `pfinance-app-1748773335` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `pfinance-app-1748773335.firebasestorage.app` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `859800863588` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `1:859800863588:web:37e07faef9c57b0329f071` |
| `NEXT_PUBLIC_API_URL` | Cloud Run URL (after backend deploy) |
| `NEXT_PUBLIC_DEV_MODE` | `false` |

### 3. Configure Custom Domain
In Vercel Dashboard → **Project → Settings → Domains**:
1. Add `pfinance.dev`
2. Add `www.pfinance.dev` (optional redirect)
3. Follow DNS configuration instructions

## DNS Configuration for pfinance.dev

Add these DNS records at your domain registrar:

| Type | Name | Value |
|------|------|-------|
| A | @ | `76.76.21.21` |
| CNAME | www | `cname.vercel-dns.com` |

## Deployment Commands

### Automated Deploy (Preferred)

The entire deployment is handled automatically by GitHub Actions:

1. Push to `main` branch
2. **Build Backend**: Docker image built and pushed to Container Registry
3. **Deploy Infra**: Terraform provisions Cloud Run and outputs API URL
4. **Deploy Frontend**: Vercel deploys frontend with injected API_URL
5. **Firebase**: Firestore indexes updated

### Manual Terraform Deploy (Infrastructure Only)
```bash
cd terraform
terraform init
terraform apply \
  -var="project_id=pfinance-app-1748773335" \
  -var="image_name=gcr.io/pfinance-app-1748773335/pfinance-backend:latest"
```

### Manual Vercel Deploy (Frontend Only)
```bash
cd web
vercel --prod
```

## Post-Deployment Checklist

- [ ] Verify https://pfinance.dev loads correctly
- [ ] Test Firebase authentication (sign in/sign up)
- [ ] Verify backend health: `curl https://api.pfinance.dev/health`
- [ ] Test expense creation and retrieval
- [ ] Check shared expenses functionality
- [ ] Verify Debug Panel is hidden (NEXT_PUBLIC_DEV_MODE=false)

## Rollback

### Frontend (Vercel)
```bash
vercel rollback
```

### Backend (Cloud Run)
```bash
gcloud run services update-traffic pfinance-backend \
  --to-revisions=<previous-revision>=100 \
  --region us-central1
```
