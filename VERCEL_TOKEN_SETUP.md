# Vercel Token Setup

## ✅ Completed Setup

1. **Project Linked**: Successfully linked to Vercel project
   - Organization ID: `team_xE5DMN3hIo8aPqyHNkBybg8r`
   - Project ID: `prj_qbRwgnyDuTtTGczw0SoP2hos8GjI`

2. **Environment Variables**: All Firebase configuration added to Vercel

3. **GitHub Secrets**: Already configured
   - `VERCEL_ORG_ID` ✅
   - `VERCEL_PROJECT_ID` ✅

## 🔑 Manual Step Required

You need to create a Vercel token manually:

1. Go to: https://vercel.com/account/tokens
2. Click "Create Token"
3. Name it: "GitHub Actions Deploy"
4. Copy the token
5. Run this command:
   ```bash
   gh secret set VERCEL_TOKEN --body="YOUR_TOKEN_HERE" --repo=castlemilk/pfinance
   ```

## 📝 After Token Setup

Once you've added the `VERCEL_TOKEN` secret:

1. Push your changes to trigger deployment
2. The GitHub Action will automatically deploy to Vercel
3. You'll get preview deployments for PRs
4. Main branch pushes will deploy to production

## 🚀 Your Vercel Project

- Dashboard: https://vercel.com/document-analyser/web
- Production URL will be: https://web-[team-name].vercel.app