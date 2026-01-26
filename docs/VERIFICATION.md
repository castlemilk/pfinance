# Production Verification Guide

Once the GitHub Action pipeline completes (check Actions tab), follow these steps to verify the deployment:

## 1. Verify Deployment Status
- **Backend**: Check GitHub Action "Deploy Infra" step for "Backend deployed to: https://..."
- **Frontend**: Check Vercel Dashboard for successful "Production" deployment

## 2. Live Verification
Open [https://pfinance.dev](https://pfinance.dev) and check:

### Authentication
- [ ] Sign In with Google
- [ ] Verify user profile loads

### Core Features
- [ ] Create a new expense
- [ ] Check "Salary Calculator" tab
- [ ] Verify "Shared" tab loads group data

### Developer Mode Check
- [ ] Ensure the yellow "Debug" button is **NOT** visible in bottom-right corner

## Troubleshooting

### "Application Error" or 500
Check Vercel text logs. If related to API connection:
1. Verify `NEXT_PUBLIC_API_URL` is set in Vercel project settings
2. Check if Cloud Run service is healthy: `curl https://<backend-url>/health`

### "Auth Error"
- Verify `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` matches the one in console
- Check browser console for CORS errors
