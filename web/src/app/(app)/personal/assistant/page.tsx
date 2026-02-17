'use client';

import { ChatPanel } from '../../../components/chat/ChatPanel';

export default function AssistantPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Finance Assistant</h1>
        <p className="text-muted-foreground text-sm">
          Chat with your financial data. Ask questions, search transactions, and manage expenses.
        </p>
      </div>
      <div className="border rounded-lg overflow-hidden bg-background">
        <ChatPanel />
      </div>
    </div>
  );
}
