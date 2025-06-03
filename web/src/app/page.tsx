'use client';

import Dashboard from './components/Dashboard';
import { FinanceProvider } from './context/FinanceContext';
import { AuthProvider } from './context/AuthContext';
import { MultiUserFinanceProvider } from './context/MultiUserFinanceContext';

export default function Home() {
  return (
    <AuthProvider>
      <MultiUserFinanceProvider>
        <FinanceProvider>
          <Dashboard />
        </FinanceProvider>
      </MultiUserFinanceProvider>
    </AuthProvider>
  );
}
