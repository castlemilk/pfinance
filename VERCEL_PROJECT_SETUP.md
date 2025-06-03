# Set Up Correct Vercel Project for PFinance

## Steps to create a new project:

1. **Go to Vercel Dashboard**: https://vercel.com/dashboard

2. **Create New Project**:
   - Click "Add New" → "Project"
   - Import from Git Repository
   - Select `castlemilk/pfinance`
   - Configure project:
     - **Framework Preset**: Next.js
     - **Root Directory**: `web`
     - **Build Command**: `cd .. && npm install -g @bufbuild/buf && cd proto && buf generate && cd ../web && npm run build`
     - **Install Command**: `npm install --legacy-peer-deps`

3. **Set Environment Variables** (copy from existing project or use these):
   ```
   NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyBbSWgNm4JW3wk_QyzVrUgfTdNruWMI2IM
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=pfinance-app-1748773335.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=pfinance-app-1748773335
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=pfinance-app-1748773335.firebasestorage.app
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=859800863588
   NEXT_PUBLIC_FIREBASE_APP_ID=1:859800863588:web:37e07faef9c57b0329f071
   NEXT_PUBLIC_BACKEND_URL=https://pfinance-backend-tvj6nmevta-uc.a.run.app
   ```

4. **After creating the project**:
   - Note the new project ID from the URL
   - Delete the old `.vercel` folder: `rm -rf web/.vercel`
   - Link to the new project: `cd web && vercel link`
   - Select the new "pfinance" project

5. **Update GitHub Secrets**:
   ```bash
   # Get the new project ID from .vercel/project.json after linking
   gh secret set VERCEL_PROJECT_ID --body="NEW_PROJECT_ID" --repo=castlemilk/pfinance
   ```

## Alternative: Using Vercel CLI

```bash
# Remove old link
cd web
rm -rf .vercel

# Create new project (will prompt for settings)
vercel --no-link

# When prompted:
- Set up and deploy: Y
- Which scope: Select your account
- Link to existing project: N
- Project name: pfinance
- In which directory: ./
- Want to override settings: Y
- Build Command: cd .. && npm install -g @bufbuild/buf && cd proto && buf generate && cd ../web && npm run build
- Output Directory: .next
- Install Command: npm install --legacy-peer-deps
```