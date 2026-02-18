'use client';

import { ReactNode } from 'react';
import SidebarNav from './SidebarNav';
import Breadcrumbs from './Breadcrumbs';
import DebugPanel from './DebugPanel';
import { FirebaseInitBanner } from './FirebaseInitBanner';
import { cn } from '@/lib/utils';
import { Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { ChatPanel } from './chat/ChatPanel';
import { ChatHistoryProvider } from '@/lib/chat/ChatHistoryContext';

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <ChatHistoryProvider>
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

        {/* Floating Chat Button + Sheet */}
        <Sheet>
          <SheetTrigger asChild>
            <Button
              size="icon"
              className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-shadow"
            >
              <Bot className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[400px] sm:w-[540px] p-0">
            <SheetTitle className="sr-only">Finance Assistant</SheetTitle>
            <SheetDescription className="sr-only">Chat with your financial data</SheetDescription>
            <ChatPanel compact />
          </SheetContent>
        </Sheet>

        {/* Debug Panel - only shows when NEXT_PUBLIC_DEV_MODE=true */}
        <DebugPanel />
      </div>
    </ChatHistoryProvider>
  );
}
