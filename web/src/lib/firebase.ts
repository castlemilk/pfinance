import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import getConfig from 'next/config';

// Get runtime configuration
const { publicRuntimeConfig } = getConfig() || {};

// Use runtime config if available, fallback to environment variables
const firebaseConfig = {
  apiKey: publicRuntimeConfig?.firebaseApiKey || process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: publicRuntimeConfig?.firebaseAuthDomain || process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: publicRuntimeConfig?.firebaseProjectId || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: publicRuntimeConfig?.firebaseStorageBucket || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: publicRuntimeConfig?.firebaseMessagingSenderId || process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: publicRuntimeConfig?.firebaseAppId || process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase only if it hasn't been initialized yet
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);

// Initialize Cloud Firestore and get a reference to the service
export const db = getFirestore(app);

export default app;