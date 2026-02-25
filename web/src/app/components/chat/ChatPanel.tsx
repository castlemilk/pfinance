'use client';

import { useRef, useEffect, useCallback, useState, useLayoutEffect } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, RotateCcw, Loader2, History, Plus, Bot, AlertCircle, Square as StopIcon, RefreshCw } from 'lucide-react';
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
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = useState('');
  const [showConversations, setShowConversations] = useState(showHistory);
  const conversationIdRef = useRef<string | null>(null);
  const skipNextLoadRef = useRef(false);
  // UX-01: track whether user has manually scrolled up
  const userScrolledUpRef = useRef(false);
  // BUG-03: track which conversation's messages are loaded from history
  const [isHistoricalLoad, setIsHistoricalLoad] = useState(false);

  const {
    activeConversationId,
    createConversation,
    saveMessages,
    loadMessages,
  } = useChatHistory();

  // Keep ref in sync with context state
  useEffect(() => {
    conversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

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
    stop,
    regenerate,
  } = useChat({
    id: 'main', // Stable ID — we manage conversation switching via setMessages, not useChat sessions
    transport: new DefaultChatTransport({
      api: '/api/chat',
      headers: getHeaders,
    }),
    onError: (err: Error) => {
      console.error('[ChatPanel] Error:', err);
    },
  });

  const isLoading = status === 'submitted' || status === 'streaming';

  // Load messages when conversation changes
  useEffect(() => {
    if (skipNextLoadRef.current) {
      skipNextLoadRef.current = false;
      return;
    }
    if (activeConversationId) {
      const loaded = loadMessages(activeConversationId);
      setMessages(loaded);
      // BUG-03: mark loaded messages as historical so confirmation buttons are disabled
      setIsHistoricalLoad(loaded.length > 0);
    } else {
      setMessages([]);
      setIsHistoricalLoad(false);
    }
  }, [activeConversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear historical flag when user sends a new message
  useEffect(() => {
    if (isLoading) {
      setIsHistoricalLoad(false);
    }
  }, [isLoading]);

  // Auto-save messages when streaming completes
  useEffect(() => {
    const convId = conversationIdRef.current;
    if (convId && messages.length > 0 && !isLoading) {
      saveMessages(convId, messages);
    }
  }, [messages, isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // UX-01: smart auto-scroll — only scroll down if user hasn't scrolled up
  useEffect(() => {
    if (!userScrolledUpRef.current) {
      scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  // UX-01: detect when user scrolls up in the message area
  useEffect(() => {
    const scrollContainer = scrollAreaRef.current;
    if (!scrollContainer) return;

    // Find the actual scrollable viewport inside ScrollArea (radix puts it in a child)
    const viewport = scrollContainer.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
    if (!viewport) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = viewport;
      // Consider "at bottom" if within 100px of the bottom
      const atBottom = scrollHeight - scrollTop - clientHeight < 100;
      userScrolledUpRef.current = !atBottom;
    };

    viewport.addEventListener('scroll', handleScroll, { passive: true });
    return () => viewport.removeEventListener('scroll', handleScroll);
  }, [showConversations]); // re-attach when toggling views

  // Auto-grow textarea
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
  }, [input]);

  const handleConfirm = useCallback((text: string) => {
    sendMessage({ text });
  }, [sendMessage]);

  const handleCancel = useCallback((text: string) => {
    sendMessage({ text });
  }, [sendMessage]);

  const ensureConversation = useCallback(() => {
    if (!conversationIdRef.current) {
      skipNextLoadRef.current = true;
      const newId = createConversation();
      conversationIdRef.current = newId;
      return newId;
    }
    return conversationIdRef.current;
  }, [createConversation]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      ensureConversation();
      sendMessage({ text: input });
      setInput('');
      setShowConversations(false);
      userScrolledUpRef.current = false; // reset scroll lock on new message
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
        userScrolledUpRef.current = false;
      }
    }
  };

  const handleSuggestedPrompt = (prompt: string) => {
    ensureConversation();
    sendMessage({ text: prompt });
    setShowConversations(false);
    userScrolledUpRef.current = false;
  };

  // BUG-01 fix: add skipNextLoadRef guard so the new conversation effect doesn't wipe messages
  const handleNewChat = () => {
    setMessages([]);
    skipNextLoadRef.current = true;
    createConversation();
    setShowConversations(false);
    setIsHistoricalLoad(false);
  };

  // MISS-01: retry last failed message
  const handleRetry = () => {
    userScrolledUpRef.current = false;
    regenerate();
  };

  // MISS-02: stop generating
  const handleStop = () => {
    stop();
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

  // UX-05: extract a meaningful error message
  const errorMessage = error
    ? (error.message || 'Something went wrong. Please try again.')
    : null;

  return (
    <div className={cn('flex flex-col', compact ? 'h-full' : 'h-[calc(100vh-8rem)]')}>
      {/* Header */}
      <div className="skeu-card skeu-scanlines flex items-center justify-between px-4 py-3 rounded-none border-x-0 border-t-0">
        <div className="flex items-center gap-2">
          <span className="chat-led text-green-500" />
          <div>
            <h3 className="font-semibold text-sm">Finance Assistant</h3>
            <p className="text-xs text-muted-foreground">Ask about your expenses, budgets, and more</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowConversations(!showConversations)}
            className="chat-action-pill h-7 px-2"
            title="Chat history"
          >
            <History className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleNewChat}
            className="chat-action-pill h-7 px-2"
            title="New chat"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          {messages.length > 0 && (
            <button
              onClick={() => {
                setMessages([]);
                const convId = conversationIdRef.current;
                if (convId) {
                  saveMessages(convId, []);
                }
              }}
              className="chat-action-pill h-7 px-2"
              title="Clear current chat"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
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
          <ScrollArea className="flex-1" ref={scrollAreaRef}>
            <div className="p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="space-y-4 pt-8">
                  <div className="text-center">
                    <div className="inline-flex items-center gap-2 mb-3">
                      <Bot className="w-5 h-5 text-primary" />
                      <span className="text-sm font-medium text-primary">Try asking:</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {SUGGESTED_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        className="chat-action-pill justify-start text-left h-auto py-2.5 px-3.5 text-xs"
                        onClick={() => handleSuggestedPrompt(prompt)}
                      >
                        {prompt}
                      </button>
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
                    isHistorical={isHistoricalLoad}
                  />
                ))
              )}

              {/* Loading indicator with stop button */}
              {isLoading && (
                <div className="flex gap-2.5">
                  <div className="chat-avatar w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 text-muted-foreground">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className="chat-bubble-assistant rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
                      <span className="flex gap-1.5">
                        <span className="chat-typing-dot" />
                        <span className="chat-typing-dot" />
                        <span className="chat-typing-dot" />
                      </span>
                    </div>
                    {/* MISS-02: stop button */}
                    <button
                      onClick={handleStop}
                      className="chat-action-pill h-6 px-2.5 text-xs gap-1 self-start"
                    >
                      <StopIcon className="w-3 h-3" />
                      Stop
                    </button>
                  </div>
                </div>
              )}

              {/* UX-05: error display with retry */}
              {error && (
                <div className="space-y-2">
                  <div className="skeu-card border-destructive/30 bg-destructive/5 rounded-lg px-3 py-2 text-sm flex items-start gap-2 text-destructive">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{errorMessage}</span>
                  </div>
                  {/* MISS-01: retry button */}
                  <button
                    onClick={handleRetry}
                    className="chat-action-pill h-7 px-3 text-xs gap-1.5"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Retry
                  </button>
                </div>
              )}

              {/* Scroll sentinel */}
              <div ref={scrollEndRef} />
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="chat-input-well">
            <form onSubmit={handleSubmit} className="flex gap-2 items-end">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your finances..."
                rows={1}
                className="flex-1 resize-none overflow-hidden max-h-[120px] rounded-lg bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50 border border-primary/10"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="chat-send-btn"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
