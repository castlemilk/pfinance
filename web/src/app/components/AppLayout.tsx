'use client';

import { ReactNode } from 'react';
import SidebarNav from './SidebarNav';
import Breadcrumbs from './Breadcrumbs';
import DebugPanel from './DebugPanel';
import { FirebaseInitBanner } from './FirebaseInitBanner';
import { cn } from '@/lib/utils';

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <FirebaseInitBanner />
      <SidebarNav />
      
      {/* Main Content Area */}
      <div className={cn(
        "lg:pl-64", // Account for sidebar width on desktop
        "min-h-screen"
      )}>
        {/* Mobile Header Spacer */}
        <div className="h-16 lg:hidden" />
        
        {/* Page Content */}
        <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Breadcrumbs />
          {children}
        </main>
      </div>

      {/* Debug Panel - only shows when NEXT_PUBLIC_DEV_MODE=true */}
      <DebugPanel />
    </div>
  );
}