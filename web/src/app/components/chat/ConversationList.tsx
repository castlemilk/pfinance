'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Plus,
  MessageSquare,
  Trash2,
  Pencil,
  CheckSquare,
  Square,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useChatHistory } from '@/lib/chat/ChatHistoryContext';
import { SkeuButton } from '@/components/ui/skeu-button';

// ---------------------------------------------------------------------------
// Relative time formatter
// ---------------------------------------------------------------------------

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConversationListProps {
  onConversationSelect?: () => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// ConversationList
// ---------------------------------------------------------------------------

export function ConversationList({
  onConversationSelect,
  className,
}: ConversationListProps) {
  const {
    activeConversationId,
    conversations,
    createConversation,
    selectConversation,
    deleteConversation,
    clearAllConversations,
    renameConversation,
  } = useChatHistory();

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // UX-06: single-delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Focus the rename input when it appears
  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  const handleNewChat = useCallback(() => {
    createConversation();
    onConversationSelect?.();
  }, [createConversation, onConversationSelect]);

  const handleSelect = useCallback(
    (id: string) => {
      selectConversation(id);
      onConversationSelect?.();
    },
    [selectConversation, onConversationSelect],
  );

  const startRename = useCallback(
    (id: string, currentTitle: string) => {
      setRenamingId(id);
      setRenameValue(currentTitle);
    },
    [],
  );

  const commitRename = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      renameConversation(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue('');
  }, [renamingId, renameValue, renameConversation]);

  const cancelRename = useCallback(() => {
    setRenamingId(null);
    setRenameValue('');
  }, []);

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitRename();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelRename();
      }
    },
    [commitRename, cancelRename],
  );

  // --- Selection mode ---

  const toggleSelectMode = useCallback(() => {
    setSelectMode(prev => {
      if (prev) setSelectedIds(new Set()); // Clear on exit
      return !prev;
    });
  }, []);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds(prev => {
      if (prev.size === conversations.length) return new Set();
      return new Set(conversations.map(c => c.id));
    });
  }, [conversations]);

  const deleteSelected = useCallback(() => {
    for (const id of selectedIds) {
      deleteConversation(id);
    }
    setSelectedIds(new Set());
    setSelectMode(false);
  }, [selectedIds, deleteConversation]);

  // Sort conversations by most recent first
  const sortedConversations = [...conversations].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  const allSelected = sortedConversations.length > 0 && selectedIds.size === sortedConversations.length;

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="px-3 py-3 space-y-2">
        {selectMode ? (
          <div className="flex items-center gap-2">
            <button
              className="chat-action-pill flex-1 justify-center gap-2 py-2"
              onClick={toggleSelectAll}
            >
              {allSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
              {allSelected ? 'Deselect All' : 'Select All'}
            </button>
            <button
              className="chat-action-pill py-2 px-3"
              onClick={toggleSelectMode}
              title="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              className="chat-action-pill flex-1 justify-center gap-2 py-2"
              onClick={handleNewChat}
            >
              <Plus className="w-4 h-4" />
              New Chat
            </button>
            {sortedConversations.length > 0 && (
              <button
                className="chat-action-pill py-2 px-3"
                onClick={toggleSelectMode}
                title="Select conversations"
              >
                <CheckSquare className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      <Separator />

      {/* Conversation list */}
      <ScrollArea className="flex-1">
        <div className="px-2 py-2 space-y-1">
          {sortedConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <MessageSquare className="w-8 h-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">
                No conversations yet
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Start a new chat to ask about your finances
              </p>
            </div>
          ) : (
            sortedConversations.map((conversation) => {
              const isActive = conversation.id === activeConversationId;
              const isRenaming = conversation.id === renamingId;
              const isSelected = selectedIds.has(conversation.id);

              return (
                <div
                  key={conversation.id}
                  className={cn(
                    'group relative flex items-center gap-2 rounded-lg px-2.5 py-2 cursor-pointer transition-all',
                    selectMode && isSelected
                      ? 'bg-primary/10'
                      : isActive && !selectMode
                        ? 'skeu-inset'
                        : 'hover:bg-primary/5',
                  )}
                  onClick={() => {
                    if (selectMode) {
                      toggleSelection(conversation.id);
                    } else if (!isRenaming) {
                      handleSelect(conversation.id);
                    }
                  }}
                >
                  {/* Left icon: checkbox in select mode, message icon otherwise */}
                  {selectMode ? (
                    <div className="w-4 h-4 shrink-0 text-primary">
                      {isSelected
                        ? <CheckSquare className="w-4 h-4" />
                        : <Square className="w-4 h-4 text-muted-foreground" />
                      }
                    </div>
                  ) : (
                    <MessageSquare className={cn(
                      'w-4 h-4 shrink-0',
                      isActive ? 'text-primary' : 'text-muted-foreground'
                    )} />
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {isRenaming ? (
                      <Input
                        ref={renameInputRef}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={handleRenameKeyDown}
                        onBlur={commitRename}
                        onClick={(e) => e.stopPropagation()}
                        className="h-6 text-xs px-1.5 py-0"
                      />
                    ) : (
                      <>
                        <p className="text-sm font-medium truncate leading-tight">
                          {conversation.title}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-xs text-muted-foreground truncate">
                            {conversation.lastMessagePreview || 'Empty conversation'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono text-[10px] text-muted-foreground/70">
                            {formatRelativeTime(new Date(conversation.updatedAt))}
                          </span>
                          <span className="text-[10px] text-muted-foreground/50">
                            &middot;
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground/70">
                            {conversation.messageCount}{' '}
                            {conversation.messageCount === 1 ? 'msg' : 'msgs'}
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Quick action buttons — visible on hover (normal mode only) */}
                  {!selectMode && !isRenaming && (
                    <div className={cn(
                      'flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity',
                      isActive && 'opacity-100',
                    )}>
                      <button
                        className="h-6 w-6 rounded flex items-center justify-center hover:bg-primary/10 text-muted-foreground hover:text-foreground transition-colors"
                        title="Rename"
                        onClick={(e) => {
                          e.stopPropagation();
                          startRename(conversation.id, conversation.title);
                        }}
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        className="h-6 w-6 rounded flex items-center justify-center hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        title="Delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingId(conversation.id);
                        }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* UX-06: single-delete confirmation dialog */}
      <AlertDialog open={!!deletingId} onOpenChange={(open) => { if (!open) setDeletingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this conversation. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingId) deleteConversation(deletingId);
                setDeletingId(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Footer: bulk delete in select mode, clear all in normal mode */}
      {sortedConversations.length > 0 && (
        <>
          <Separator />
          <div className="px-3 py-3">
            {selectMode ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <SkeuButton
                    variant="destructive"
                    size="sm"
                    className="w-full gap-2"
                    icon={<Trash2 className="w-3.5 h-3.5" />}
                    disabled={selectedIds.size === 0}
                  >
                    Delete {selectedIds.size > 0 ? `${selectedIds.size} Selected` : 'Selected'}
                  </SkeuButton>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {selectedIds.size} conversation{selectedIds.size === 1 ? '' : 's'}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete the selected conversation{selectedIds.size === 1 ? '' : 's'}.
                      This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={deleteSelected}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <SkeuButton
                    variant="destructive"
                    size="sm"
                    className="w-full gap-2"
                    icon={<Trash2 className="w-3.5 h-3.5" />}
                  >
                    Clear All Conversations
                  </SkeuButton>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear all conversations?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete all {sortedConversations.length}{' '}
                      conversation{sortedConversations.length === 1 ? '' : 's'}.
                      This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={clearAllConversations}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete All
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </>
      )}
    </div>
  );
}
