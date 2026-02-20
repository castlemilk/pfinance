'use client';

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import type { UIMessage } from 'ai';
import { useAuth } from '@/app/context/AuthWithAdminContext';
import {
  chatStorage,
  generateTitle,
  type ChatConversation,
  type ChatConversationMeta,
} from './storage';

// --- Context type ---

interface ChatHistoryContextType {
  // Current conversation
  activeConversationId: string | null;

  // Conversation list
  conversations: ChatConversationMeta[];

  // Actions
  createConversation: () => string;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  clearAllConversations: () => void;
  renameConversation: (id: string, title: string) => void;

  // Message persistence
  loadMessages: (conversationId: string) => UIMessage[];
  saveMessages: (conversationId: string, messages: UIMessage[]) => void;
}

const ChatHistoryContext = createContext<ChatHistoryContextType | undefined>(undefined);

// --- Provider ---

interface ChatHistoryProviderProps {
  children: ReactNode;
}

const DEFAULT_TITLE = 'New conversation';

export function ChatHistoryProvider({ children }: ChatHistoryProviderProps) {
  const { user, loading } = useAuth();
  const userId = user?.uid ?? null;

  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ChatConversationMeta[]>([]);
  // Refresh the conversation list from storage
  const refreshConversations = useCallback(() => {
    if (!userId) {
      // Only clear conversations if auth has finished loading (user is truly absent)
      if (!loading) {
        setConversations([]);
      }
      return;
    }
    setConversations(chatStorage.listConversations(userId));
  }, [userId, loading]);

  // Load conversations on mount and when userId changes
  useEffect(() => {
    // Don't reset while auth is still loading
    if (loading) return;
    refreshConversations();
    // Reset active conversation when user actually changes
    setActiveConversationId(null);
  }, [refreshConversations, loading]);

  const createConversation = useCallback((): string => {
    if (!userId) return '';

    const now = Date.now();
    const id = crypto.randomUUID();
    const conversation: ChatConversation = {
      id,
      title: DEFAULT_TITLE,
      createdAt: now,
      updatedAt: now,
      messages: [],
    };

    chatStorage.saveConversation(userId, conversation);
    setActiveConversationId(id);
    refreshConversations();
    return id;
  }, [userId, refreshConversations]);

  const selectConversation = useCallback((id: string) => {
    setActiveConversationId(id);
  }, []);

  const deleteConversation = useCallback((id: string) => {
    if (!userId) return;

    chatStorage.deleteConversation(userId, id);

    // If we deleted the active conversation, clear the selection
    setActiveConversationId(prev => (prev === id ? null : prev));
    refreshConversations();
  }, [userId, refreshConversations]);

  const clearAllConversations = useCallback(() => {
    if (!userId) return;

    chatStorage.clearAllConversations(userId);
    setActiveConversationId(null);
    refreshConversations();
  }, [userId, refreshConversations]);

  const renameConversation = useCallback((id: string, title: string) => {
    if (!userId) return;

    const conversation = chatStorage.getConversation(userId, id);
    if (!conversation) return;

    conversation.title = title;
    conversation.updatedAt = Date.now();
    chatStorage.saveConversation(userId, conversation);
    refreshConversations();
  }, [userId, refreshConversations]);

  const loadMessages = useCallback((conversationId: string): UIMessage[] => {
    if (!userId) return [];

    const conversation = chatStorage.getConversation(userId, conversationId);
    return conversation?.messages ?? [];
  }, [userId]);

  const saveMessages = useCallback((conversationId: string, messages: UIMessage[]) => {
    if (!userId) return;

    const existing = chatStorage.getConversation(userId, conversationId);
    const now = Date.now();

    const conversation: ChatConversation = {
      id: conversationId,
      title: existing?.title ?? DEFAULT_TITLE,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      messages,
    };

    // Auto-generate title from first user message if still using default
    if (conversation.title === DEFAULT_TITLE && messages.length > 0) {
      conversation.title = generateTitle(messages);
    }

    chatStorage.saveConversation(userId, conversation);
    refreshConversations();
  }, [userId, refreshConversations]);

  const value: ChatHistoryContextType = {
    activeConversationId,
    conversations,
    createConversation,
    selectConversation,
    deleteConversation,
    clearAllConversations,
    renameConversation,
    loadMessages,
    saveMessages,
  };

  return (
    <ChatHistoryContext.Provider value={value}>
      {children}
    </ChatHistoryContext.Provider>
  );
}

// --- Hook ---

export const useChatHistory = () => {
  const context = useContext(ChatHistoryContext);
  if (context === undefined) {
    throw new Error('useChatHistory must be used within a ChatHistoryProvider');
  }
  return context;
};
