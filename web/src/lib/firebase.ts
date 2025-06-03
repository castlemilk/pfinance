import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Firebase configuration - use environment variables directly
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
};

// Debug logging in development
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  console.log('Firebase config:', {
    ...firebaseConfig,
    apiKey: firebaseConfig.apiKey ? 'SET' : 'NOT SET',
  });
}

// Only initialize Firebase on the client side
let app: any;
let auth: any;
let db: any;

if (typeof window !== 'undefined') {
  // Client-side initialization
  // Check if we have valid configuration
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey === '') {
    console.error('Firebase configuration is missing. Please check environment variables.');
    // Create mock objects to prevent crashes
    app = null;
    auth = null;
    db = null;
  } else {
    try {
      app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
      auth = getAuth(app);
      db = getFirestore(app);
    } catch (error) {
      console.error('Firebase initialization error:', error);
      app = null;
      auth = null;
      db = null;
    }
  }
} else {
  // Server-side: create placeholder objects
  app = null;
  auth = null;
  db = null;
}

export { auth, db };
export default app;