#!/bin/bash

echo "Verifying Vercel Environment Variables"
echo "======================================"
echo ""

# Check if environment variables are set in Vercel
echo "Run these commands to verify your Vercel environment variables:"
echo ""
echo "cd web"
echo "vercel env ls"
echo ""
echo "If any are missing, add them with:"
echo ""
echo 'vercel env add NEXT_PUBLIC_FIREBASE_API_KEY production'
echo 'vercel env add NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN production'
echo 'vercel env add NEXT_PUBLIC_FIREBASE_PROJECT_ID production'
echo 'vercel env add NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET production'
echo 'vercel env add NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID production'
echo 'vercel env add NEXT_PUBLIC_FIREBASE_APP_ID production'
echo 'vercel env add NEXT_PUBLIC_BACKEND_URL production'
echo ""
echo "Values to use:"
echo "NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyBbSWgNm4JW3wk_QyzVrUgfTdNruWMI2IM"
echo "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=pfinance-app-1748773335.firebaseapp.com"
echo "NEXT_PUBLIC_FIREBASE_PROJECT_ID=pfinance-app-1748773335"
echo "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=pfinance-app-1748773335.firebasestorage.app"
echo "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=859800863588"
echo "NEXT_PUBLIC_FIREBASE_APP_ID=1:859800863588:web:37e07faef9c57b0329f071"
echo "NEXT_PUBLIC_BACKEND_URL=https://pfinance-backend-tvj6nmevta-uc.a.run.app"
echo ""
echo "After updating, trigger a new deployment:"
echo "vercel --prod"