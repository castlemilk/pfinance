import type { UIMessage } from 'ai';

// --- Types ---

export interface ChatConversation {
  id: string;
  title: string;
  createdAt: number; // epoch ms
  updatedAt: number; // epoch ms
  messages: UIMessage[];
}

export interface ChatConversationMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  lastMessagePreview: string; // first 100 chars of last assistant text
}

export interface ChatStorage {
  listConversations(userId: string): ChatConversationMeta[];
  getConversation(userId: string, conversationId: string): ChatConversation | null;
  saveConversation(userId: string, conversation: ChatConversation): void;
  deleteConversation(userId: string, conversationId: string): void;
  clearAllConversations(userId: string): void;
}

// --- Constants ---

const MAX_CONVERSATIONS = 50;
const MAX_MESSAGES_PER_CONVERSATION = 200;
const TITLE_MAX_LENGTH = 50;
const PREVIEW_MAX_LENGTH = 100;
const DEFAULT_TITLE = 'New conversation';

// --- Helpers ---

function storageKey(userId: string): string {
  return `pfinance-chat-${userId}`;
}

function loadConversations(userId: string): ChatConversation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as ChatConversation[];
  } catch {
    return [];
  }
}

function persistConversations(userId: string, conversations: ChatConversation[]): boolean {
  if (typeof window === 'undefined') return false;
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(conversations));
    return true;
  } catch (err) {
    // RES-01: surface quota errors so callers can handle them
    console.warn('[ChatStorage] Failed to persist conversations:', err);
    // Attempt recovery: remove oldest conversations and retry
    if (conversations.length > 1) {
      const reduced = conversations.slice(0, Math.ceil(conversations.length / 2));
      try {
        localStorage.setItem(storageKey(userId), JSON.stringify(reduced));
        console.warn(`[ChatStorage] Recovered by pruning to ${reduced.length} conversations`);
        return true;
      } catch {
        // Still can't save — give up
      }
    }
    return false;
  }
}

function extractLastAssistantPreview(messages: UIMessage[]): string {
  // Walk backwards to find the last assistant message
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'assistant') continue;

    // Extract text from parts
    const textParts = (msg.parts || [])
      .filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
      .map(p => p.text);
    const text = textParts.join(' ').trim();
    if (text.length > 0) {
      return text.length > PREVIEW_MAX_LENGTH
        ? text.slice(0, PREVIEW_MAX_LENGTH)
        : text;
    }
  }
  return '';
}

function toMeta(conversation: ChatConversation): ChatConversationMeta {
  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messageCount: conversation.messages.length,
    lastMessagePreview: extractLastAssistantPreview(conversation.messages),
  };
}

/**
 * Generate a conversation title from the first user message.
 * Truncates to ~50 characters at a word boundary.
 */
export function generateTitle(messages: UIMessage[]): string {
  for (const msg of messages) {
    if (msg.role !== 'user') continue;

    // Extract text from parts
    const textParts = (msg.parts || [])
      .filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
      .map(p => p.text);
    const text = textParts.join(' ').trim();
    if (text.length > 0) {
      if (text.length <= TITLE_MAX_LENGTH) return text;
      // HIST-01: truncate at word boundary instead of mid-word
      const truncated = text.slice(0, TITLE_MAX_LENGTH);
      const lastSpace = truncated.lastIndexOf(' ');
      return (lastSpace > TITLE_MAX_LENGTH * 0.4 ? truncated.slice(0, lastSpace) : truncated) + '...';
    }
  }
  return DEFAULT_TITLE;
}

// --- Implementation ---

class LocalChatStorage implements ChatStorage {
  listConversations(userId: string): ChatConversationMeta[] {
    const conversations = loadConversations(userId);
    // Sort by updatedAt descending (most recent first)
    conversations.sort((a, b) => b.updatedAt - a.updatedAt);
    return conversations.map(toMeta);
  }

  getConversation(userId: string, conversationId: string): ChatConversation | null {
    const conversations = loadConversations(userId);
    return conversations.find(c => c.id === conversationId) || null;
  }

  saveConversation(userId: string, conversation: ChatConversation): void {
    const conversations = loadConversations(userId);

    // Enforce message limit on the conversation being saved
    const trimmedConversation: ChatConversation = {
      ...conversation,
      messages: conversation.messages.length > MAX_MESSAGES_PER_CONVERSATION
        ? conversation.messages.slice(-MAX_MESSAGES_PER_CONVERSATION)
        : conversation.messages,
    };

    // Find existing or insert
    const existingIndex = conversations.findIndex(c => c.id === trimmedConversation.id);
    if (existingIndex >= 0) {
      conversations[existingIndex] = trimmedConversation;
    } else {
      conversations.push(trimmedConversation);
    }

    // Sort by updatedAt descending so we prune the oldest
    conversations.sort((a, b) => b.updatedAt - a.updatedAt);

    // Enforce max conversations limit: prune oldest
    const pruned = conversations.length > MAX_CONVERSATIONS
      ? conversations.slice(0, MAX_CONVERSATIONS)
      : conversations;

    persistConversations(userId, pruned);
  }

  deleteConversation(userId: string, conversationId: string): void {
    const conversations = loadConversations(userId);
    const filtered = conversations.filter(c => c.id !== conversationId);
    persistConversations(userId, filtered);
  }

  clearAllConversations(userId: string): void {
    persistConversations(userId, []);
  }
}

// --- Singleton export ---

export const chatStorage = new LocalChatStorage();
