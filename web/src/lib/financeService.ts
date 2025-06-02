import { createPromiseClient } from "@bufbuild/connect";
import { createConnectTransport } from "@bufbuild/connect-web";
import { FinanceService } from "@/gen/pfinance/v1/finance_service_connect";

// Create transport with the backend URL
const transport = createConnectTransport({
  baseUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080",
  // Add auth token if available
  interceptors: [
    (next) => async (req) => {
      // Add Firebase auth token if user is logged in
      if (typeof window !== 'undefined') {
        const { auth } = await import('./firebase');
        const user = auth.currentUser;
        if (user) {
          const token = await user.getIdToken();
          req.header.set('Authorization', `Bearer ${token}`);
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