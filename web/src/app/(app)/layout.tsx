'use client';

import { ReactNode, Suspense } from 'react';
import { AdminProvider } from '../context/AdminContext';
import { AuthWithAdminProvider } from '../context/AuthWithAdminContext';
import { MultiUserFinanceProvider } from '../context/MultiUserFinanceContext';
import { FinanceProvider } from '../context/FinanceContext';
import { BudgetProvider } from '../context/BudgetContext';
import AppLayout from '../components/AppLayout';
import AppSkeleton from '../components/skeletons/AppSkeleton';

interface AppRouteLayoutProps {
  children: ReactNode;
}

export default function AppRouteLayout({ children }: AppRouteLayoutProps) {
  return (
    <AdminProvider>
      <AuthWithAdminProvider>
        <MultiUserFinanceProvider>
          <FinanceProvider>
            <BudgetProvider>
              <Suspense fallback={<AppSkeleton />}>
                <AppLayout>{children}</AppLayout>
              </Suspense>
            </BudgetProvider>
          </FinanceProvider>
        </MultiUserFinanceProvider>
      </AuthWithAdminProvider>
    </AdminProvider>
  );
}
