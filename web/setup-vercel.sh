#!/bin/bash

echo "🚀 Setting up Vercel deployment for PFinance Web"
echo "=============================================="
echo ""
echo "Prerequisites:"
echo "1. Install Vercel CLI: npm i -g vercel"
echo "2. Run: vercel login"
echo ""
echo "Steps to complete:"
echo ""
echo "1. Link your project to Vercel:"
echo "   cd web && vercel link"
echo ""
echo "2. Set up environment variables in Vercel:"
echo "   vercel env add NEXT_PUBLIC_FIREBASE_API_KEY"
echo "   vercel env add NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"
echo "   vercel env add NEXT_PUBLIC_FIREBASE_PROJECT_ID"
echo "   vercel env add NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"
echo "   vercel env add NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"
echo "   vercel env add NEXT_PUBLIC_FIREBASE_APP_ID"
echo "   vercel env add NEXT_PUBLIC_BACKEND_URL"
echo ""
echo "3. Get your Vercel tokens and IDs:"
echo "   - Go to: https://vercel.com/account/tokens"
echo "   - Create a new token"
echo "   - Get your org ID and project ID from .vercel/project.json after linking"
echo ""
echo "4. Add these as GitHub secrets:"
echo "   gh secret set VERCEL_TOKEN --body='your-vercel-token' --repo=castlemilk/pfinance"
echo "   gh secret set VERCEL_ORG_ID --body='your-org-id' --repo=castlemilk/pfinance"
echo "   gh secret set VERCEL_PROJECT_ID --body='your-project-id' --repo=castlemilk/pfinance"
echo ""
echo "5. Set environment variables using the values from .env.local:"
cat << 'EOF'
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyBbSWgNm4JW3wk_QyzVrUgfTdNruWMI2IM
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=pfinance-app-1748773335.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=pfinance-app-1748773335
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=pfinance-app-1748773335.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=859800863588
NEXT_PUBLIC_FIREBASE_APP_ID=1:859800863588:web:37e07faef9c57b0329f071
EOF
echo ""
echo "For NEXT_PUBLIC_BACKEND_URL, wait until backend is deployed to Cloud Run"