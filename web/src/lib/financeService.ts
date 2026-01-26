import { createPromiseClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { FinanceService } from "@/gen/pfinance/v1/finance_service_connect";
import { onAuthStateChanged } from 'firebase/auth';

// Helper to get auth token, waiting for auth state to be ready if needed
async function getAuthToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  
  try {
    const { auth } = await import('./firebase');
    if (!auth) {
      console.log('[financeService] getAuthToken: Firebase auth not initialized');
      return null;
    }
    
    // If currentUser is already available, get token immediately
    if (auth.currentUser) {
      console.log('[financeService] getAuthToken: Getting token for current user:', auth.currentUser.uid);
      return auth.currentUser.getIdToken();
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
          const token = await user.getIdToken();
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

// Create transport with the backend URL
// NOTE: Default port is 8111 (not 8080) to avoid conflicts
const transport = createConnectTransport({
  baseUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8111",
  // Add auth token if available
  interceptors: [
    (next) => async (req) => {
      const token = await getAuthToken();
      if (token) {
        req.header.set('Authorization', `Bearer ${token}`);
      }
      
      // Add impersonation header in dev mode
      if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_DEV_MODE === 'true') {
        const impersonatedUser = localStorage.getItem('debug_impersonated_user');
        if (impersonatedUser) {
          req.header.set('X-Debug-Impersonate-User', impersonatedUser);
          console.log('[financeService] Using impersonated user:', impersonatedUser);
        }
      }
      
      return next(req);
    },
  ],
});

// Create the client
export const financeClient = createPromiseClient(FinanceService, transport);

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