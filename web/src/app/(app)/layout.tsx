'use client';

import { ReactNode } from 'react';
import AppLayout from '../components/AppLayout';

interface AppRouteLayoutProps {
  children: ReactNode;
}

export default function AppRouteLayout({ children }: AppRouteLayoutProps) {
  return <AppLayout>{children}</AppLayout>;
}
