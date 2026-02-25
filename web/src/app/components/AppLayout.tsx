'use client';

import { ReactNode } from 'react';
import SidebarNav from './SidebarNav';
import Breadcrumbs from './Breadcrumbs';
import DebugPanel from './DebugPanel';
import { FirebaseInitBanner } from './FirebaseInitBanner';
import { cn } from '@/lib/utils';
import { Bot } from 'lucide-react';
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
          {/* Mobile Header Spacer - matches h-14 mobile header bar */}
          <div className="h-14 lg:hidden" />

          {/* Page Content */}
          <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
            <Breadcrumbs />
            {children}
          </main>
        </div>

        {/* Floating Chat Button + Sheet */}
        <Sheet>
          <SheetTrigger asChild>
            <button
              className="chat-send-btn fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 !w-12 !h-12 sm:!w-14 sm:!h-14 shadow-lg hover:shadow-xl transition-all"
            >
              <Bot className="h-5 w-5 sm:h-6 sm:w-6" />
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:w-[400px] md:w-[540px] p-0 gap-0">
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
