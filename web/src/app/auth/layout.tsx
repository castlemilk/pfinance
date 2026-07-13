'use client';

import { ReactNode } from 'react';
import { AdminProvider } from '../context/AdminContext';
import { AuthWithAdminProvider } from '../context/AuthWithAdminContext';

interface AuthLayoutProps {
  children: ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <AdminProvider>
      <AuthWithAdminProvider>
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
      </AuthWithAdminProvider>
    </AdminProvider>
  );
}
