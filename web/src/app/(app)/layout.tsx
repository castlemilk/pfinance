'use client';

import { ReactNode, Suspense } from 'react';
import { AdminProvider } from '../context/AdminContext';
import { AuthWithAdminProvider } from '../context/AuthWithAdminContext';
import { MultiUserFinanceProvider } from '../context/MultiUserFinanceContext';
import { FinanceProvider } from '../context/FinanceContext';
import { BudgetProvider } from '../context/BudgetContext';
import { RecurringProvider } from '../context/RecurringContext';
import { GoalProvider } from '../context/GoalContext';
import { TaxProvider } from '../context/TaxContext';
import { NotificationProvider } from '../context/NotificationContext';
import dynamic from 'next/dynamic';
import AppLayout from '../components/AppLayout';
import AppSkeleton from '../components/skeletons/AppSkeleton';
import InstallPrompt from '../components/InstallPrompt';
import { useHydrated } from '../hooks/useHydrated';

const SearchCommandPalette = dynamic(() => import('../components/SearchCommandPalette'), {
  ssr: false,
  loading: () => null,
});

interface AppRouteLayoutProps {
  children: ReactNode;
}

export default function AppRouteLayout({ children }: AppRouteLayoutProps) {
  // The app area is private (robots-disallowed) and every provider below restores
  // auth, demo data and preferences in mount effects. React hydrates each Suspense
  // boundary only after its parents commit, so server HTML inside a boundary was
  // checked against post-effect state and failed with React #418. The server and
  // the first client frame render the skeleton; the app mounts once hydrated.
  const hydrated = useHydrated();
  if (!hydrated) return <AppSkeleton />;

  return (
    <AdminProvider>
      <AuthWithAdminProvider>
        <NotificationProvider>
          <MultiUserFinanceProvider>
            <FinanceProvider>
              <TaxProvider>
                <BudgetProvider>
                  <RecurringProvider>
                    <GoalProvider>
                      <Suspense fallback={<AppSkeleton />}>
                        <AppLayout>{children}</AppLayout>
                        <SearchCommandPalette />
                        <InstallPrompt />
                      </Suspense>
                    </GoalProvider>
                  </RecurringProvider>
                </BudgetProvider>
              </TaxProvider>
            </FinanceProvider>
          </MultiUserFinanceProvider>
        </NotificationProvider>
      </AuthWithAdminProvider>
    </AdminProvider>
  );
}
