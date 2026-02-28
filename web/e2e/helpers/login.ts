import { type Page } from '@playwright/test';
import https from 'https';

const FIREBASE_API_KEY = 'AIzaSyBbSWgNm4JW3wk_QyzVrUgfTdNruWMI2IM';

interface FirebaseAuthResponse {
  idToken: string;
  email: string;
  refreshToken: string;
  expiresIn: string;
  localId: string;
}

/**
 * Sign in via Firebase REST API (bypasses reCAPTCHA/App Check).
 */
function firebaseRestSignIn(email: string, password: string): Promise<FirebaseAuthResponse> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ email, password, returnSecureToken: true });
    const req = https.request(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': data.length } },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          const parsed = JSON.parse(body);
          if (parsed.error) reject(new Error(`Firebase REST: ${parsed.error.message}`));
          else resolve(parsed);
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/**
 * Authenticates against pfinance.dev using the Firebase REST API,
 * then injects the auth state into the browser's localStorage so
 * the Firebase SDK picks it up on page load.
 *
 * This bypasses reCAPTCHA/App Check that blocks signInWithEmailAndPassword
 * in headless browsers.
 */
export async function loginWithEmail(
  page: Page,
  email = process.env.E2E_EMAIL || 'e2e-test@pfinance.dev',
  password = process.env.E2E_PASSWORD || 'E2eTest!2025'
) {
  // Step 1: Get fresh auth tokens via REST API (includes latest custom claims)
  const authData = await firebaseRestSignIn(email, password);

  // Step 2: Navigate to the app so we have the correct origin
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1000);

  // Step 3: Inject auth state into localStorage
  // Firebase browserLocalPersistence uses key: firebase:authUser:<apiKey>:[DEFAULT]
  const storageKey = `firebase:authUser:${FIREBASE_API_KEY}:[DEFAULT]`;
  const authUser = {
    uid: authData.localId,
    email: authData.email,
    emailVerified: false,
    isAnonymous: false,
    providerData: [
      {
        providerId: 'password',
        uid: authData.email,
        displayName: null,
        email: authData.email,
        phoneNumber: null,
        photoURL: null,
      },
    ],
    apiKey: FIREBASE_API_KEY,
    appName: '[DEFAULT]',
    authDomain: 'pfinance-app-1748773335.firebaseapp.com',
    stsTokenManager: {
      refreshToken: authData.refreshToken,
      accessToken: authData.idToken,
      expirationTime: Date.now() + parseInt(authData.expiresIn) * 1000,
    },
    lastLoginAt: String(Date.now()),
    createdAt: String(Date.now()),
  };

  await page.evaluate(
    ({ key, value }) => {
      localStorage.setItem(key, JSON.stringify(value));
    },
    { key: storageKey, value: authUser }
  );

  // Step 4: Reload to pick up the auth state
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  // Step 5: Verify we're authenticated — check for user email in sidebar
  const bodyText = await page.textContent('body');
  const isAuthenticated = !bodyText?.includes('Sign In') || bodyText?.includes(email.split('@')[0]);
  if (!isAuthenticated) {
    // Try IndexedDB fallback
    await page.evaluate(
      async ({ key, value }) => {
        return new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('firebaseLocalStorageDb', 1);
          request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains('firebaseLocalStorage')) {
              db.createObjectStore('firebaseLocalStorage');
            }
          };
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('firebaseLocalStorage', 'readwrite');
            const store = tx.objectStore('firebaseLocalStorage');
            store.put({ fbase_key: key, value }, key);
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => { db.close(); reject(tx.error); };
          };
          request.onerror = () => reject(request.error);
        });
      },
      { key: storageKey, value: authUser }
    );

    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
  }
}
