'use client';

import type { UIMessage } from 'ai';
import { Bot, User } from 'lucide-react';
import { ExpenseCard } from './ExpenseCard';
import { SummaryCard } from './SummaryCard';
import { ConfirmationCard } from './ConfirmationCard';
import { cn } from '@/lib/utils';

interface ChatMessageProps {
  message: UIMessage;
  onConfirm: (message: string) => void;
  onCancel: (message: string) => void;
}

export function ChatMessage({ message, onConfirm, onCancel }: ChatMessageProps) {
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

  return (
    <div className={cn('flex gap-2', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {/* Avatar */}
      <div className={cn(
        'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center',
        isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
      )}>
        {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
      </div>

      {/* Content */}
      <div className={cn('flex flex-col gap-2 max-w-[85%]', isUser ? 'items-end' : 'items-start')}>
        {/* Text content */}
        {textContent && (
          <div className={cn(
            'rounded-lg px-3 py-2 text-sm',
            isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
          )}>
            <div className="whitespace-pre-wrap">{textContent}</div>
          </div>
        )}

        {/* Tool results */}
        {toolParts.map((part, idx) => {
          const result = part.output;

          // Handle confirmation requests
          if (result.status === 'pending_confirmation') {
            return (
              <ConfirmationCard
                key={idx}
                action={result.action as string}
                message={result.message as string}
                details={result.details as Record<string, unknown> | undefined}
                expenses={result.expenses as Array<{ description: string; amount: number; date: string; category: string }> | undefined}
                changes={result.changes as Record<string, { from: unknown; to: unknown }> | undefined}
                onConfirm={() => onConfirm('Yes, proceed with the operation.')}
                onCancel={() => onCancel('Cancel, do not proceed.')}
              />
            );
          }

          // Handle success messages — let the model summarize in text
          if (result.status === 'success') {
            return null;
          }

          // Handle expense list results
          if (result.expenses && Array.isArray(result.expenses)) {
            return (
              <ExpenseCard
                key={idx}
                expenses={result.expenses as Array<{ id: string; description: string; amount: number; category: string; date: string; tags?: string[] }>}
                count={(result.count as number) || (result.expenses as unknown[]).length}
                hasMore={result.hasMore as boolean | undefined}
              />
            );
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
            return (
              <ExpenseCard
                key={idx}
                expenses={expenseLike}
                count={(result.count as number) || (result.results as unknown[]).length}
              />
            );
          }

          // Handle budget progress
          if (result.budgets && Array.isArray(result.budgets)) {
            return <SummaryCard key={idx} type="budgets" budgets={result.budgets as Array<{ name: string; limit: number; spent: number; percentage: number; isActive: boolean }>} />;
          }

          // Handle spending insights
          if (result.insights && Array.isArray(result.insights)) {
            return <SummaryCard key={idx} type="insights" insights={result.insights as Array<{ title: string; description: string; amount: number; percentageChange?: number; category?: string }>} />;
          }

          // Handle goals
          if (result.goals && Array.isArray(result.goals)) {
            return <SummaryCard key={idx} type="goals" goals={result.goals as Array<{ name: string; target: number; current: number; percentage: number; onTrack: boolean }>} />;
          }

          // Handle income list
          if (result.incomes && Array.isArray(result.incomes)) {
            const incomeLike = (result.incomes as Array<Record<string, unknown>>).map(i => ({
              id: i.id as string,
              description: i.source as string,
              amount: i.amount as number,
              category: i.frequency as string,
              date: i.date as string,
              tags: [] as string[],
            }));
            return (
              <ExpenseCard
                key={idx}
                expenses={incomeLike}
                count={(result.count as number) || (result.incomes as unknown[]).length}
              />
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}
