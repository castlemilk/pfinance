import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { FinanceService } from "@/gen/pfinance/v1/finance_service_pb";
import { onAuthStateChanged } from 'firebase/auth';

// Helper to get auth token, waiting for auth state to be ready if needed
// forceRefresh: if true, forces a token refresh even if current token hasn't expired
async function getAuthToken(forceRefresh = false): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  try {
    const { auth } = await import('./firebase');
    if (!auth) {
      console.log('[financeService] getAuthToken: Firebase auth not initialized');
      return null;
    }

    // If currentUser is already available, get token immediately
    if (auth.currentUser) {
      console.log('[financeService] getAuthToken: Getting token for current user:', auth.currentUser.uid, 'forceRefresh:', forceRefresh);
      // Pass forceRefresh to getIdToken - if true, it will refresh even if token hasn't expired
      // Firebase automatically refreshes tokens that are within 5 minutes of expiry
      return auth.currentUser.getIdToken(forceRefresh);
    }

    console.log('[financeService] getAuthToken: Waiting for auth state...');
    // Wait for auth state to be determined (with timeout)
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.log('[financeService] getAuthToken: Timeout - no user');
        resolve(null); // Timeout - no user
      }, 2000);

      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        clearTimeout(timeout);
        unsubscribe();
        if (user) {
          console.log('[financeService] getAuthToken: Got user from auth state:', user.uid);
          const token = await user.getIdToken(forceRefresh);
          resolve(token);
        } else {
          console.log('[financeService] getAuthToken: No user from auth state');
          resolve(null);
        }
      });
    });
  } catch (err) {
    console.debug('[financeService] Firebase auth not available:', err);
    return null;
  }
}

// Helper to get current user info for debug headers
async function getCurrentUserInfo(): Promise<{ uid: string; email: string | null; displayName: string | null } | null> {
  if (typeof window === 'undefined') return null;

  try {
    const { auth } = await import('./firebase');
    if (!auth?.currentUser) return null;
    return {
      uid: auth.currentUser.uid,
      email: auth.currentUser.email,
      displayName: auth.currentUser.displayName,
    };
  } catch {
    return null;
  }
}

// Check if we're in local dev mode (talking to local backend)
const isLocalDev = typeof window !== 'undefined' &&
  (process.env.NEXT_PUBLIC_API_URL?.includes('localhost') ||
   process.env.NEXT_PUBLIC_API_URL?.includes('127.0.0.1') ||
   !process.env.NEXT_PUBLIC_API_URL);

// Helper to add auth and debug headers to a request
async function addAuthHeaders(req: { header: { set: (key: string, value: string) => void } }, forceRefresh = false) {
  const token = await getAuthToken(forceRefresh);
  if (token) {
    req.header.set('Authorization', `Bearer ${token}`);
  }

  // In local dev mode, send user info headers for the backend to use
  // This allows the memory store backend to know which user is making requests
  if (isLocalDev) {
    const userInfo = await getCurrentUserInfo();
    if (userInfo) {
      req.header.set('X-Debug-User-ID', userInfo.uid);
      if (userInfo.email) {
        req.header.set('X-Debug-User-Email', userInfo.email);
      }
      if (userInfo.displayName) {
        req.header.set('X-Debug-User-Name', userInfo.displayName);
      }
    }

    // Also check for explicit impersonation override
    const impersonatedUser = localStorage.getItem('debug_impersonated_user');
    if (impersonatedUser) {
      req.header.set('X-Debug-User-ID', impersonatedUser);
      req.header.set('X-Debug-Impersonate-User', impersonatedUser);
      console.log('[financeService] Using impersonated user:', impersonatedUser);
    }
  }
}

// Create transport with the backend URL
// NOTE: Default port is 8111 (not 8080) to avoid conflicts
const transport = createConnectTransport({
  baseUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8111",
  // Add auth token with automatic refresh on auth errors
  interceptors: [
    (next) => async (req) => {
      // Add auth headers with cached token
      await addAuthHeaders(req, false);

      try {
        return await next(req);
      } catch (error) {
        // Check if the error is an authentication error (token expired)
        const isAuthError = error instanceof Error && (
          error.message.includes('unauthenticated') ||
          error.message.includes('Unauthenticated') ||
          error.message.includes('token') ||
          error.message.includes('expired') ||
          // Connect error codes
          (error as { code?: string }).code === 'unauthenticated'
        );

        if (isAuthError) {
          console.log('[financeService] Auth error detected, retrying with refreshed token...');

          // Force refresh the token and retry once
          await addAuthHeaders(req, true);
          return next(req);
        }

        // Re-throw non-auth errors
        throw error;
      }
    },
  ],
});

// Create the client
export const financeClient = createClient(FinanceService, transport);

// Export types for convenience
export type { 
  Expense,
  Income,
  FinanceGroup,
  GroupInvitation,
  User,
  TaxConfig
} from "@/gen/pfinance/v1/types_pb";

// Export enums as values
export {
  ExpenseCategory,
  ExpenseFrequency,
  IncomeFrequency,
  GroupRole,
  InvitationStatus,
  TaxStatus,
  TaxCountry
} from "@/gen/pfinance/v1/types_pb";