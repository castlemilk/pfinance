import { createPromiseClient } from "@bufbuild/connect";
import { createConnectTransport } from "@bufbuild/connect-web";
import { FinanceService } from "@/gen/pfinance/v1/finance_service_connect";

// Create transport with the backend URL
// NOTE: Default port is 8111 (not 8080) to avoid conflicts
const transport = createConnectTransport({
  baseUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8111",
  // Add auth token if available
  interceptors: [
    (next) => async (req) => {
      // Add Firebase auth token if user is logged in
      if (typeof window !== 'undefined') {
        try {
          const { auth } = await import('./firebase');
          if (auth?.currentUser) {
            const token = await auth.currentUser.getIdToken();
            req.header.set('Authorization', `Bearer ${token}`);
          }
        } catch (error) {
          // If Firebase is not initialized or there's an error, continue without auth
          console.debug('Firebase auth not available, continuing without authentication');
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