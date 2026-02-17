'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, RotateCcw, Loader2, History, Plus } from 'lucide-react';
import { ChatMessage } from './ChatMessage';
import { ConversationList } from './ConversationList';
import { useAuth } from '../../context/AuthWithAdminContext';
import { useSubscription } from '../../hooks/useSubscription';
import { useChatHistory } from '@/lib/chat/ChatHistoryContext';
import { cn } from '@/lib/utils';

interface ChatPanelProps {
  compact?: boolean;
  showHistory?: boolean;
}

const SUGGESTED_PROMPTS = [
  'What did I spend this month?',
  'Show my budget progress',
  'Top expenses by category',
  'List my incomes',
];

export function ChatPanel({ compact = false, showHistory = false }: ChatPanelProps) {
  const { user, loading } = useAuth();
  const { isPro } = useSubscription();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');
  const [showConversations, setShowConversations] = useState(showHistory);

  const {
    activeConversationId,
    createConversation,
    saveMessages,
    loadMessages,
    selectConversation,
  } = useChatHistory();

  const getHeaders = useCallback(async (): Promise<Record<string, string>> => {
    if (!user) return {};
    const token = await user.getIdToken();
    return {
      'X-Firebase-Token': token || '',
      'X-User-ID': user.uid || '',
      'X-User-DisplayName': user.displayName || '',
      'X-User-Email': user.email || '',
      'X-User-IsPro': isPro ? 'true' : 'false',
    };
  }, [user, isPro]);

  const {
    messages,
    sendMessage,
    status,
    setMessages,
    error,
  } = useChat({
    id: activeConversationId || undefined,
    transport: new DefaultChatTransport({
      api: '/api/chat',
      headers: getHeaders,
    }),
    onError: (err: Error) => {
      console.error('[ChatPanel] Error:', err);
    },
  });

  const isLoading = status === 'submitted' || status === 'streaming';

  // Load messages when active conversation changes
  useEffect(() => {
    if (activeConversationId) {
      const loaded = loadMessages(activeConversationId);
      if (loaded.length > 0) {
        setMessages(loaded);
      }
    }
  }, [activeConversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save messages when they change (debounced by streaming status)
  useEffect(() => {
    if (activeConversationId && messages.length > 0 && !isLoading) {
      saveMessages(activeConversationId, messages);
    }
  }, [messages, isLoading, activeConversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleConfirm = useCallback((text: string) => {
    sendMessage({ text });
  }, [sendMessage]);

  const handleCancel = useCallback((text: string) => {
    sendMessage({ text });
  }, [sendMessage]);

  const ensureConversation = useCallback(() => {
    if (!activeConversationId) {
      return createConversation();
    }
    return activeConversationId;
  }, [activeConversationId, createConversation]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      ensureConversation();
      sendMessage({ text: input });
      setInput('');
      setShowConversations(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !isLoading) {
        ensureConversation();
        sendMessage({ text: input });
        setInput('');
        setShowConversations(false);
      }
    }
  };

  const handleSuggestedPrompt = (prompt: string) => {
    ensureConversation();
    sendMessage({ text: prompt });
    setShowConversations(false);
  };

  const handleNewChat = () => {
    createConversation();
    setMessages([]);
    setShowConversations(false);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading assistant...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <p className="text-sm text-muted-foreground">Sign in to use the assistant.</p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col', compact ? 'h-full' : 'h-[calc(100vh-8rem)]')}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div>
          <h3 className="font-semibold text-sm">Finance Assistant</h3>
          <p className="text-xs text-muted-foreground">Ask about your expenses, budgets, and more</p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowConversations(!showConversations)}
            className="h-8 w-8"
            title="Chat history"
          >
            <History className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleNewChat}
            className="h-8 w-8"
            title="New chat"
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setMessages([]);
                if (activeConversationId) {
                  saveMessages(activeConversationId, []);
                }
              }}
              className="h-8 w-8"
              title="Clear current chat"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Conversation List Overlay */}
      {showConversations ? (
        <ConversationList
          onConversationSelect={() => setShowConversations(false)}
          className="flex-1"
        />
      ) : (
        <>
          {/* Messages */}
          <ScrollArea className="flex-1" ref={scrollRef}>
            <div className="p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="space-y-4 pt-8">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground mb-4">
                      Try asking about your finances:
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {SUGGESTED_PROMPTS.map((prompt) => (
                      <Button
                        key={prompt}
                        variant="outline"
                        size="sm"
                        className="justify-start text-left h-auto py-2 px-3 text-xs"
                        onClick={() => handleSuggestedPrompt(prompt)}
                      >
                        {prompt}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((msg) => (
                  <ChatMessage
                    key={msg.id}
                    message={msg}
                    onConfirm={handleConfirm}
                    onCancel={handleCancel}
                  />
                ))
              )}

              {isLoading && (
                <div className="flex gap-2">
                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  </div>
                  <div className="bg-muted rounded-lg px-3 py-2 text-sm text-muted-foreground">
                    Thinking...
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm">
                  Something went wrong. Please try again.
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="border-t p-3">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your finances..."
                rows={1}
                className="flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                disabled={isLoading}
              />
              <Button
                type="submit"
                size="icon"
                disabled={!input.trim() || isLoading}
                className="h-9 w-9 shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
              </Button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
