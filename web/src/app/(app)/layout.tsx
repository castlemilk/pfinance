'use client';

import { ReactNode, Suspense } from 'react';
import { AdminProvider } from '../context/AdminContext';
import { AuthWithAdminProvider } from '../context/AuthWithAdminContext';
import { MultiUserFinanceProvider } from '../context/MultiUserFinanceContext';
import { FinanceProvider } from '../context/FinanceContext';
import { BudgetProvider } from '../context/BudgetContext';
import { RecurringProvider } from '../context/RecurringContext';
import { GoalProvider } from '../context/GoalContext';
import { NotificationProvider } from '../context/NotificationContext';
import AppLayout from '../components/AppLayout';
import AppSkeleton from '../components/skeletons/AppSkeleton';
import SearchCommandPalette from '../components/SearchCommandPalette';

interface AppRouteLayoutProps {
  children: ReactNode;
}

export default function AppRouteLayout({ children }: AppRouteLayoutProps) {
  return (
    <AdminProvider>
      <AuthWithAdminProvider>
        <NotificationProvider>
          <MultiUserFinanceProvider>
            <FinanceProvider>
              <BudgetProvider>
                <RecurringProvider>
                  <GoalProvider>
                    <Suspense fallback={<AppSkeleton />}>
                      <AppLayout>{children}</AppLayout>
                      <SearchCommandPalette />
                    </Suspense>
                  </GoalProvider>
                </RecurringProvider>
              </BudgetProvider>
            </FinanceProvider>
          </MultiUserFinanceProvider>
        </NotificationProvider>
      </AuthWithAdminProvider>
    </AdminProvider>
  );
}
