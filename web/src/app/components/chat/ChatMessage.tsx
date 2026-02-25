'use client';

import type { UIMessage } from 'ai';
import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, User } from 'lucide-react';
import { ExpenseCard } from './ExpenseCard';
import { SummaryCard } from './SummaryCard';
import { ConfirmationCard } from './ConfirmationCard';
import { cn } from '@/lib/utils';

interface ChatMessageProps {
  message: UIMessage;
  onConfirm: (message: string) => void;
  onCancel: (message: string) => void;
  isHistorical?: boolean;
}

export function ChatMessage({ message, onConfirm, onCancel, isHistorical = false }: ChatMessageProps) {
  const isUser = message.role === 'user';

  // Extract text content from parts
  const textContent = message.parts
    ?.filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
    .map(p => p.text)
    .join('') || '';

  // Extract tool parts with results (type starts with 'tool-' and has output)
  const toolParts = (message.parts || [])
    .filter(p => p.type.startsWith('tool-'))
    .map(p => p as unknown as { type: string; state: string; output: Record<string, unknown> })
    .filter(p => p.state === 'output-available' && p.output);

  // Deduplicate and categorize tool results
  const seen = new Set<string>();
  const confirmationCards: ReactNode[] = [];
  const dataCards: ReactNode[] = [];

  for (let i = 0; i < toolParts.length; i++) {
    const result = toolParts[i].output;
    const key = JSON.stringify(result);
    if (seen.has(key)) continue;
    seen.add(key);

    // Handle confirmation requests
    if (result.status === 'pending_confirmation') {
      // P1-3 fix: handle singular `expense` field for single delete, plus `expenses` for batch
      const expensesList = (result.expenses as Array<{ description: string; amount: number; date: string; category: string }> | undefined)
        || (result.expense ? [result.expense as { description: string; amount: number; date: string; category: string }] : undefined);

      confirmationCards.push(
        <ConfirmationCard
          key={`confirm-${i}`}
          action={result.action as string}
          message={result.message as string}
          details={result.details as Record<string, unknown> | undefined}
          expenses={expensesList}
          changes={result.changes as Record<string, { from: unknown; to: unknown }> | undefined}
          duplicates={result.duplicates as Array<{ description: string; amount: number; date: string; matchScore: number; matchReason: string }> | undefined}
          duplicateWarning={result.duplicateWarning as string | undefined}
          // P1-1 fix: pass disabled prop for historical conversations
          disabled={isHistorical}
          onConfirm={() => onConfirm('Yes, proceed with the operation.')}
          onCancel={() => onCancel('Cancel, do not proceed.')}
        />
      );
      continue;
    }

    // Handle success messages — let the model summarize in text
    if (result.status === 'success') continue;

    // Handle expense list results
    if (result.expenses && Array.isArray(result.expenses)) {
      dataCards.push(
        <ExpenseCard
          key={`data-${i}`}
          expenses={result.expenses as Array<{ id: string; description: string; amount: number; category: string; date: string; tags?: string[] }>}
          count={(result.count as number) || (result.expenses as unknown[]).length}
          hasMore={result.hasMore as boolean | undefined}
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
      dataCards.push(
        <ExpenseCard
          key={`data-${i}`}
          expenses={expenseLike}
          count={(result.count as number) || (result.results as unknown[]).length}
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
      dataCards.push(
        <ExpenseCard
          key={`data-${i}`}
          expenses={incomeLike}
          count={(result.count as number) || (result.incomes as unknown[]).length}
          itemType="income"
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

  const hasToolCards = confirmationCards.length > 0 || dataCards.length > 0;

  return (
    <div className={cn('flex gap-2.5', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {/* Avatar */}
      <div className={cn(
        'chat-avatar flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
        isUser
          ? 'bg-primary/20 text-primary'
          : 'bg-muted text-muted-foreground'
      )}>
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>

      {/* Content */}
      <div className={cn(
        'flex flex-col gap-2',
        hasToolCards
          ? 'max-w-[98%] sm:max-w-[95%] lg:max-w-[90%]'
          : 'max-w-[92%] sm:max-w-[85%] lg:max-w-[75%]',
        isUser ? 'items-end' : 'items-start'
      )}>
        {/* Text content — P1-7 fix: render markdown for assistant messages */}
        {textContent && (
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
        )}

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
      </div>
    </div>
  );
}
