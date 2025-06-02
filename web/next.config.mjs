/** @type {import('next').NextConfig} */
const nextConfig = {
  // Remove 'output: export' to enable server-side rendering
  trailingSlash: true,
  images: {
    // Enable optimized images for server deployment
    domains: ['firebasestorage.googleapis.com'],
  },
  experimental: {
    forceSwcTransforms: true,
  },
  eslint: {
    ignoreDuringBuilds: true, // Ignore ESLint errors during build
  },
  // Environment variables that will be available on the server only
  serverRuntimeConfig: {
    // Server-side only configuration
  },
  // Environment variables that will be available on both server and client
  publicRuntimeConfig: {
    firebaseApiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    firebaseAuthDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    firebaseProjectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    firebaseStorageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    firebaseMessagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    firebaseAppId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    firebaseBackendUrl: process.env.NEXT_PUBLIC_BACKEND_URL || 'https://pfinance-backend-ogllvvupaa-uc.a.run.app',
  },
};

export default nextConfig; 