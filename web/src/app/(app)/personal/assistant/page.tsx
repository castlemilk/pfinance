'use client';

import { ChatPanel } from '../../../components/chat/ChatPanel';
import { ConversationList } from '../../../components/chat/ConversationList';

export default function AssistantPage() {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex gap-4">
        {/* Conversation sidebar - visible on lg+ */}
        <div className="hidden lg:block w-64 shrink-0">
          <div className="skeu-card skeu-scanlines overflow-hidden h-[calc(100vh-12rem)]">
            <ConversationList />
          </div>
        </div>
        {/* Chat panel — on mobile, showHistory button is available in the header */}
        <div className="flex-1 min-w-0">
          <div className="crt-card overflow-hidden">
            <ChatPanel />
          </div>
        </div>
      </div>
    </div>
  );
}
