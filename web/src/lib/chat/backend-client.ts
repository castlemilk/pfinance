import { createClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';
import { FinanceService } from '@/gen/pfinance/v1/finance_service_pb';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8111';
const isLocalDev = API_URL.includes('localhost') || API_URL.includes('127.0.0.1');

export function createBackendClient(authToken: string | null, userId: string, userEmail?: string, displayName?: string) {
  const transport = createConnectTransport({
    baseUrl: API_URL,
    interceptors: [
      (next) => async (req) => {
        if (authToken) {
          req.header.set('Authorization', `Bearer ${authToken}`);
        }
        if (isLocalDev) {
          if (userId) req.header.set('X-Debug-User-ID', userId);
          if (userEmail) req.header.set('X-Debug-User-Email', userEmail);
          if (displayName) req.header.set('X-Debug-User-Name', displayName);
        }
        return next(req);
      },
    ],
  });

  return createClient(FinanceService, transport);
}

export type BackendClient = ReturnType<typeof createBackendClient>;
