'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  MessageSquare,
  Trash2,
  MoreVertical,
  Pencil,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useChatHistory } from '@/lib/chat/ChatHistoryContext';

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

  // Sort conversations by most recent first
  const sortedConversations = [...conversations].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header + New Chat */}
      <div className="px-3 py-3 space-y-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={handleNewChat}
        >
          <Plus className="w-4 h-4" />
          New Chat
        </Button>
      </div>

      <Separator />

      {/* Conversation list */}
      <ScrollArea className="flex-1">
        <div className="px-2 py-2 space-y-0.5">
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

              return (
                <div
                  key={conversation.id}
                  className={cn(
                    'group relative flex items-center gap-2 rounded-md px-2 py-2 cursor-pointer transition-colors',
                    isActive
                      ? 'bg-muted'
                      : 'hover:bg-muted/50',
                  )}
                  onClick={() => {
                    if (!isRenaming) {
                      handleSelect(conversation.id);
                    }
                  }}
                >
                  {/* Conversation icon */}
                  <MessageSquare className="w-4 h-4 shrink-0 text-muted-foreground" />

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
                          <span className="text-[10px] text-muted-foreground/70">
                            {formatRelativeTime(new Date(conversation.updatedAt))}
                          </span>
                          <span className="text-[10px] text-muted-foreground/50">
                            &middot;
                          </span>
                          <span className="text-[10px] text-muted-foreground/70">
                            {conversation.messageCount}{' '}
                            {conversation.messageCount === 1 ? 'msg' : 'msgs'}
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Actions dropdown — visible on hover or when active */}
                  {!isRenaming && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            'h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity',
                            isActive && 'opacity-100',
                          )}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-36">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            startRename(conversation.id, conversation.title);
                          }}
                        >
                          <Pencil className="w-3.5 h-3.5 mr-2" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteConversation(conversation.id);
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Clear All — only show when there are conversations */}
      {sortedConversations.length > 0 && (
        <>
          <Separator />
          <div className="px-3 py-3">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear All Conversations
                </Button>
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
          </div>
        </>
      )}
    </div>
  );
}
