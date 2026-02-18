'use client';

import { ChatPanel } from '../../../components/chat/ChatPanel';
import { ConversationList } from '../../../components/chat/ConversationList';

export default function AssistantPage() {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Finance Assistant</h1>
        <p className="text-muted-foreground text-sm">
          Chat with your financial data. Ask questions, search transactions, and manage expenses.
        </p>
      </div>
      <div className="flex gap-4">
        {/* Conversation sidebar - visible on lg+ */}
        <div className="hidden lg:block w-64 shrink-0">
          <div className="border rounded-lg overflow-hidden bg-background h-[calc(100vh-12rem)]">
            <ConversationList />
          </div>
        </div>
        {/* Chat panel — on mobile, showHistory button is available in the header */}
        <div className="flex-1 min-w-0">
          <div className="border rounded-lg overflow-hidden bg-background">
            <ChatPanel />
          </div>
        </div>
      </div>
    </div>
  );
}
