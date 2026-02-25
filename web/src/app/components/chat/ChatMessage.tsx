'use client';

import { useCallback, useState } from 'react';
import type { UIMessage } from 'ai';
import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, User, Copy, Check, AlertCircle, Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '../../context/AuthWithAdminContext';
import { GenerativeAvatar } from '../GenerativeAvatar';
import { ExpenseCard } from './ExpenseCard';
import type { ExpenseItem } from './ExpenseCard';
import { SummaryCard } from './SummaryCard';
import { ConfirmationCard } from './ConfirmationCard';
import { cn } from '@/lib/utils';
import { financeClient } from '@/lib/financeService';
import { timestampFromDate, timestampDate } from '@bufbuild/protobuf/wkt';
import { ExpenseCategory, ExpenseFrequency } from '@/gen/pfinance/v1/types_pb';

// Format a proto Expense into an ExpenseItem for the card
function formatProtoExpense(e: {
  id: string;
  description: string;
  amount: number;
  amountCents: bigint;
  category: number;
  date?: { seconds: bigint; nanos: number };
  tags: string[];
}): ExpenseItem {
  const amount = Number(e.amountCents) !== 0 ? Number(e.amountCents) / 100 : e.amount;
  return {
    id: e.id,
    description: e.description,
    amount,
    category: ExpenseCategory[e.category] || 'UNKNOWN',
    date: e.date ? timestampDate(e.date as Parameters<typeof timestampDate>[0]).toISOString().split('T')[0] : 'no date',
    tags: [...e.tags],
  };
}

// Format a proto Income into an ExpenseItem for the card
function formatProtoIncome(inc: {
  id: string;
  source: string;
  amount: number;
  amountCents: bigint;
  frequency: number;
  date?: { seconds: bigint; nanos: number };
}): ExpenseItem {
  const amount = Number(inc.amountCents) !== 0 ? Number(inc.amountCents) / 100 : inc.amount;
  return {
    id: inc.id,
    description: inc.source,
    amount,
    category: ExpenseFrequency[inc.frequency] || 'UNKNOWN',
    date: inc.date ? timestampDate(inc.date as Parameters<typeof timestampDate>[0]).toISOString().split('T')[0] : 'no date',
  };
}

// Format a proto SearchResult into an ExpenseItem
function formatProtoSearchResult(r: {
  id: string;
  description: string;
  category: string;
  amount: number;
  amountCents: bigint;
  date?: { seconds: bigint; nanos: number };
}): ExpenseItem {
  const amount = Number(r.amountCents) !== 0 ? Number(r.amountCents) / 100 : r.amount;
  return {
    id: r.id,
    description: r.description,
    amount,
    category: r.category,
    date: r.date ? timestampDate(r.date as Parameters<typeof timestampDate>[0]).toISOString().split('T')[0] : 'no date',
  };
}

interface ChatMessageProps {
  message: UIMessage;
  onConfirm: (message: string) => void;
  onCancel: (message: string) => void;
  isHistorical?: boolean;
}

export function ChatMessage({ message, onConfirm, onCancel, isHistorical = false }: ChatMessageProps) {
  const { user } = useAuth();
  const isUser = message.role === 'user';
  // MISS-04: copy button state
  const [copied, setCopied] = useState(false);

  // Extract text content from parts
  const textContent = message.parts
    ?.filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
    .map(p => p.text)
    .join('') || '';

  // Extract all tool parts
  const allToolParts = (message.parts || [])
    .filter(p => p.type.startsWith('tool-'))
    .map(p => p as unknown as { type: string; state: string; output: Record<string, unknown>; toolName?: string });

  // Tools with results ready
  const toolParts = allToolParts.filter(p => p.state === 'output-available' && p.output);

  // Count pending tool calls (invoked but no output yet) for skeleton placeholders
  const pendingToolCount = allToolParts.filter(p => p.state !== 'output-available').length;

  // MISS-04: copy assistant text to clipboard
  const handleCopy = useCallback(async () => {
    if (!textContent) return;
    try {
      await navigator.clipboard.writeText(textContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may not be available
    }
  }, [textContent]);

  // Create stable load-more callbacks for each pagination type
  const createExpensePaginator = useCallback((params: { startDate?: string; endDate?: string; pageSize?: number }) => {
    return async (pageToken: string): Promise<{ items: ExpenseItem[]; nextPageToken?: string }> => {
      const res = await financeClient.listExpenses({
        userId: '',
        startDate: params.startDate ? timestampFromDate(new Date(params.startDate)) : undefined,
        endDate: params.endDate ? timestampFromDate(new Date(params.endDate)) : undefined,
        pageSize: params.pageSize || 20,
        pageToken,
      });
      return {
        items: res.expenses.map(e => formatProtoExpense(e as Parameters<typeof formatProtoExpense>[0])),
        nextPageToken: res.nextPageToken || undefined,
      };
    };
  }, []);

  const createSearchPaginator = useCallback((params: { query?: string; category?: string; amountMin?: number; amountMax?: number }) => {
    return async (pageToken: string): Promise<{ items: ExpenseItem[]; nextPageToken?: string }> => {
      const res = await financeClient.searchTransactions({
        userId: '',
        query: params.query || '',
        category: params.category || '',
        amountMin: params.amountMin || 0,
        amountMax: params.amountMax || 0,
        pageSize: 20,
        pageToken,
      });
      return {
        items: res.results.map(r => formatProtoSearchResult(r as Parameters<typeof formatProtoSearchResult>[0])),
        nextPageToken: res.nextPageToken || undefined,
      };
    };
  }, []);

  const createIncomePaginator = useCallback((params: { startDate?: string; endDate?: string }) => {
    return async (pageToken: string): Promise<{ items: ExpenseItem[]; nextPageToken?: string }> => {
      const res = await financeClient.listIncomes({
        userId: '',
        startDate: params.startDate ? timestampFromDate(new Date(params.startDate)) : undefined,
        endDate: params.endDate ? timestampFromDate(new Date(params.endDate)) : undefined,
        pageSize: 20,
        pageToken,
      });
      return {
        items: res.incomes.map(inc => formatProtoIncome(inc as Parameters<typeof formatProtoIncome>[0])),
        nextPageToken: res.nextPageToken || undefined,
      };
    };
  }, []);

  // Deduplicate and categorize tool results
  const seen = new Set<string>();
  const confirmationCards: ReactNode[] = [];
  const dataCards: ReactNode[] = [];
  const errorCards: ReactNode[] = [];

  for (let i = 0; i < toolParts.length; i++) {
    const result = toolParts[i].output;
    const key = JSON.stringify(result);
    if (seen.has(key)) continue;
    seen.add(key);

    // BUG-04: handle tool error results explicitly
    if (result.status === 'error' || result.error) {
      const errorMsg = (result.error as string) || (result.message as string) || 'An error occurred while processing this request.';
      errorCards.push(
        <div key={`err-${i}`} className="skeu-card border-destructive/30 bg-destructive/5 rounded-lg px-3 py-2 text-sm flex items-start gap-2 text-destructive">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      );
      continue;
    }

    // Handle confirmation requests
    if (result.status === 'pending_confirmation') {
      const expensesList = (result.expenses as Array<{ description: string; amount: number; date: string; category: string }> | undefined)
        || (result.expense ? [result.expense as { description: string; amount: number; date: string; category: string }] : undefined);

      // BUG-05: normalize changes — handle both Record<string, {from,to}> and string[] formats
      let normalizedChanges: Record<string, { from: unknown; to: unknown }> | undefined;
      if (result.changes) {
        if (Array.isArray(result.changes)) {
          // Convert string[] to Record format (e.g. ["isTaxDeductible: false → true"])
          normalizedChanges = {};
          for (const change of result.changes as string[]) {
            const match = String(change).match(/^(.+?):\s*(.+?)\s*(?:→|->)\s*(.+)$/);
            if (match) {
              normalizedChanges[match[1].trim()] = { from: match[2].trim(), to: match[3].trim() };
            } else {
              normalizedChanges[String(change)] = { from: '—', to: 'updated' };
            }
          }
        } else {
          normalizedChanges = result.changes as Record<string, { from: unknown; to: unknown }>;
        }
      }

      confirmationCards.push(
        <ConfirmationCard
          key={`confirm-${i}`}
          action={result.action as string}
          message={result.message as string}
          details={result.details as Record<string, unknown> | undefined}
          expenses={expensesList}
          changes={normalizedChanges}
          duplicates={result.duplicates as Array<{ description: string; amount: number; date: string; matchScore: number; matchReason: string }> | undefined}
          duplicateWarning={result.duplicateWarning as string | undefined}
          disabled={isHistorical}
          onConfirm={() => onConfirm('Yes, proceed with the operation.')}
          onCancel={() => onCancel('Cancel, do not proceed.')}
        />
      );
      continue;
    }

    // Handle success messages — let the model summarize in text
    if (result.status === 'success') continue;

    // Extract pagination metadata (added by tools when more pages exist)
    const nextPageToken = result.nextPageToken as string | undefined;
    const loadMoreParams = result._loadMoreParams as Record<string, unknown> | undefined;

    // Handle expense list results
    if (result.expenses && Array.isArray(result.expenses)) {
      const onLoadMore = nextPageToken && loadMoreParams
        ? createExpensePaginator(loadMoreParams as { startDate?: string; endDate?: string; pageSize?: number })
        : undefined;
      dataCards.push(
        <ExpenseCard
          key={`data-${i}`}
          expenses={result.expenses as Array<{ id: string; description: string; amount: number; category: string; date: string; tags?: string[] }>}
          count={(result.count as number) || (result.expenses as unknown[]).length}
          hasMore={result.hasMore as boolean | undefined}
          nextPageToken={nextPageToken}
          onLoadMore={onLoadMore}
        />
      );
      continue;
    }

    // Handle search results
    if (result.results && Array.isArray(result.results)) {
      const expenseLike = (result.results as Array<Record<string, unknown>>).map(r => ({
        id: r.id as string,
        description: r.description as string,
        amount: r.amount as number,
        category: r.category as string,
        date: r.date as string,
        tags: [] as string[],
      }));
      const onLoadMore = nextPageToken && loadMoreParams
        ? createSearchPaginator(loadMoreParams as { query?: string; category?: string; amountMin?: number; amountMax?: number })
        : undefined;
      dataCards.push(
        <ExpenseCard
          key={`data-${i}`}
          expenses={expenseLike}
          count={(result.count as number) || (result.results as unknown[]).length}
          hasMore={result.hasMore as boolean | undefined}
          nextPageToken={nextPageToken}
          onLoadMore={onLoadMore}
        />
      );
      continue;
    }

    // Handle budget progress
    if (result.budgets && Array.isArray(result.budgets)) {
      dataCards.push(
        <SummaryCard key={`data-${i}`} type="budgets" budgets={result.budgets as Array<{ name: string; limit: number; spent: number; percentage: number; isActive: boolean }>} />
      );
      continue;
    }

    // Handle spending insights
    if (result.insights && Array.isArray(result.insights)) {
      dataCards.push(
        <SummaryCard key={`data-${i}`} type="insights" insights={result.insights as Array<{ title: string; description: string; amount: number; percentageChange?: number; category?: string }>} />
      );
      continue;
    }

    // Handle goals
    if (result.goals && Array.isArray(result.goals)) {
      dataCards.push(
        <SummaryCard key={`data-${i}`} type="goals" goals={result.goals as Array<{ name: string; target: number; current: number; percentage: number; onTrack: boolean }>} />
      );
      continue;
    }

    // Handle income list
    if (result.incomes && Array.isArray(result.incomes)) {
      const incomeLike = (result.incomes as Array<Record<string, unknown>>).map(inc => ({
        id: inc.id as string,
        description: inc.source as string,
        amount: inc.amount as number,
        category: inc.frequency as string,
        date: inc.date as string,
        tags: [] as string[],
      }));
      const onLoadMore = nextPageToken && loadMoreParams
        ? createIncomePaginator(loadMoreParams as { startDate?: string; endDate?: string })
        : undefined;
      dataCards.push(
        <ExpenseCard
          key={`data-${i}`}
          expenses={incomeLike}
          count={(result.count as number) || (result.incomes as unknown[]).length}
          hasMore={result.hasMore as boolean | undefined}
          itemType="income"
          nextPageToken={nextPageToken}
          onLoadMore={onLoadMore}
        />
      );
      continue;
    }

    // Handle anomalies (Pro tool)
    if (result.anomalies && Array.isArray(result.anomalies)) {
      const anomalyInsights = (result.anomalies as Array<Record<string, unknown>>).map(a => ({
        title: (a.type as string) || 'Anomaly',
        description: a.description as string,
        amount: a.amount as number,
        percentageChange: undefined,
        category: undefined,
      }));
      dataCards.push(
        <SummaryCard key={`data-${i}`} type="insights" insights={anomalyInsights} />
      );
      continue;
    }

    // Handle category comparison (Pro tool)
    if (result.comparisons && Array.isArray(result.comparisons)) {
      const comparisonInsights = (result.comparisons as Array<Record<string, unknown>>).map(c => ({
        title: c.category as string,
        description: `Current: $${(c.currentAmount as number).toFixed(2)} | Previous: $${(c.previousAmount as number).toFixed(2)}`,
        amount: c.currentAmount as number,
        percentageChange: c.changePercent as number,
        category: c.category as string,
      }));
      dataCards.push(
        <SummaryCard key={`data-${i}`} type="insights" insights={comparisonInsights} />
      );
      continue;
    }
  }

  const hasToolCards = confirmationCards.length > 0 || dataCards.length > 0 || errorCards.length > 0 || pendingToolCount > 0;

  return (
    <div className={cn('group flex gap-2.5', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {/* Avatar */}
      {isUser ? (
        <Avatar className="chat-avatar flex-shrink-0 w-8 h-8">
          {user?.photoURL && <AvatarImage src={user.photoURL} alt={user.displayName || 'You'} />}
          <AvatarFallback className="p-0 bg-transparent">
            <GenerativeAvatar name={user?.displayName || user?.email || 'User'} size={32} />
          </AvatarFallback>
        </Avatar>
      ) : (
        <div className="chat-avatar flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-muted text-muted-foreground">
          <Bot className="w-4 h-4" />
        </div>
      )}

      {/* Content */}
      <div className={cn(
        'flex flex-col gap-2',
        hasToolCards
          ? 'max-w-[98%] sm:max-w-[95%] lg:max-w-[90%]'
          : 'max-w-[92%] sm:max-w-[85%] lg:max-w-[75%]',
        isUser ? 'items-end' : 'items-start'
      )}>
        {/* Text content */}
        {textContent && (
          <div className="relative">
            <div className={cn(
              'px-3.5 py-2.5 text-sm',
              isUser
                ? 'chat-bubble-user rounded-2xl rounded-br-sm'
                : 'chat-bubble-assistant rounded-2xl rounded-bl-sm'
            )}>
              {isUser ? (
                <div className="whitespace-pre-wrap">{textContent}</div>
              ) : (
                <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_code]:bg-muted/50 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono [&_pre]:bg-muted/30 [&_pre]:p-3 [&_pre]:rounded-md [&_pre]:overflow-x-auto">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {textContent}
                  </ReactMarkdown>
                </div>
              )}
            </div>

            {/* MISS-04: copy button for assistant messages */}
            {!isUser && textContent && (
              <button
                onClick={handleCopy}
                className="absolute -bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5 rounded flex items-center justify-center bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground"
                title="Copy message"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              </button>
            )}
          </div>
        )}

        {/* BUG-04: error cards */}
        {errorCards.map((card, i) => (
          <div key={`ew-${i}`} className="w-full">{card}</div>
        ))}

        {/* Confirmation cards — full width */}
        {confirmationCards.map((card, i) => (
          <div key={`cw-${i}`} className="chat-tool-card w-full">{card}</div>
        ))}

        {/* Data cards — responsive side-by-side grid */}
        {dataCards.length > 0 && (
          <div
            className="w-full grid gap-2"
            style={{
              gridTemplateColumns: dataCards.length > 1
                ? 'repeat(auto-fit, minmax(260px, 1fr))'
                : '1fr',
            }}
          >
            {dataCards.map((card, i) => (
              <div key={`dw-${i}`} className="chat-tool-card min-w-0">{card}</div>
            ))}
          </div>
        )}

        {/* Skeleton placeholders for pending tool calls */}
        {pendingToolCount > 0 && (
          <div className="w-full space-y-2">
            {Array.from({ length: pendingToolCount }).map((_, i) => (
              <div key={`skel-${i}`} className="chat-tool-card overflow-hidden rounded-lg">
                {/* Header skeleton */}
                <div className="px-3 py-2 border-b border-primary/10 bg-muted/20 flex items-center justify-between">
                  <Skeleton className="h-3.5 w-20" />
                  <Skeleton className="h-3.5 w-16" />
                </div>
                {/* Row skeletons */}
                <div className="divide-y divide-primary/5">
                  {[1, 2, 3].map((row) => (
                    <div key={row} className="px-3 py-2 flex items-center justify-between gap-2">
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-3.5 w-3/4" />
                        <div className="flex items-center gap-1.5">
                          <Skeleton className="h-3 w-12 rounded-full" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                      </div>
                      <Skeleton className="h-4 w-14" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
