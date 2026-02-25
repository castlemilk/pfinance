'use client';

import { useRouter } from 'next/navigation';
import { useState, useRef, useEffect, useCallback } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { getCategoryColor, getInstrumentBadgeStyle } from '../../constants/theme';
import type { ExpenseCategory } from '../../types';

export interface ExpenseItem {
  id: string;
  description: string;
  amount: number;
  category: string;
  date: string;
  tags?: string[];
}

// Strip proto enum prefixes for display (e.g. "EXPENSE_CATEGORY_FOOD" → "FOOD")
function cleanCategory(cat: string): string {
  return cat.replace(/^EXPENSE_CATEGORY_/, '').replace(/^EXPENSE_FREQUENCY_/, '');
}

interface ExpenseCardProps {
  expenses: ExpenseItem[];
  count: number;
  hasMore?: boolean;
  itemType?: 'expense' | 'income';
  nextPageToken?: string;
  onLoadMore?: (pageToken: string) => Promise<{ items: ExpenseItem[]; nextPageToken?: string }>;
}

export function ExpenseCard({
  expenses: initialExpenses,
  count: initialCount,
  hasMore: initialHasMore,
  itemType = 'expense',
  nextPageToken: initialToken,
  onLoadMore,
}: ExpenseCardProps) {
  const router = useRouter();
  const [items, setItems] = useState<ExpenseItem[]>(initialExpenses);
  const [pageToken, setPageToken] = useState<string | undefined>(initialToken);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const isLoadingRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Sync with new initial data (different message renders)
  useEffect(() => {
    setItems(initialExpenses);
    setPageToken(initialToken);
  }, [initialExpenses, initialToken]);

  const loadMore = useCallback(async () => {
    if (!onLoadMore || !pageToken || isLoadingRef.current) return;
    isLoadingRef.current = true;
    setIsLoading(true);
    setLoadError(false);
    try {
      const result = await onLoadMore(pageToken);
      setItems(prev => [...prev, ...result.items]);
      setPageToken(result.nextPageToken);
    } catch (err) {
      console.error('[ExpenseCard] Failed to load more:', err);
      setLoadError(true);
    } finally {
      isLoadingRef.current = false;
      setIsLoading(false);
    }
  }, [onLoadMore, pageToken]);

  // IntersectionObserver triggers loadMore when sentinel scrolls into view
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const scrollContainer = scrollRef.current;
    if (!sentinel || !scrollContainer || !pageToken || !onLoadMore) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isLoadingRef.current) {
          loadMore();
        }
      },
      { root: scrollContainer, threshold: 0.1 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [pageToken, onLoadMore, loadMore]);

  if (items.length === 0) {
    return (
      <div className="skeu-inset rounded-lg p-3 text-sm text-muted-foreground">
        No {itemType === 'income' ? 'incomes' : 'expenses'} found.
      </div>
    );
  }

  const total = items.reduce((sum, e) => sum + e.amount, 0);
  const label = itemType === 'income' ? 'income' : 'expense';

  return (
    <div className="overflow-hidden rounded-lg">
      <div className="px-3 py-2 border-b border-primary/10 bg-muted/20 flex items-center justify-between">
        <span className="font-mono text-xs text-primary">
          {items.length} {label}{items.length !== 1 ? 's' : ''}
        </span>
        <span className="font-mono text-xs font-semibold text-primary">${total.toFixed(2)}</span>
      </div>
      <div ref={scrollRef} className="divide-y divide-primary/5 max-h-[300px] overflow-y-auto">
        {items.map((e) => (
          <div
            key={e.id}
            className="group px-3 py-2 flex items-center justify-between gap-2 text-sm cursor-pointer hover:bg-primary/5 transition-colors"
            onClick={() => {
              const route = itemType === 'income'
                ? `/personal/income/${e.id}/`
                : `/personal/expenses/${e.id}/`;
              router.push(route);
            }}
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate group-hover:underline">{e.description}</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className="text-[10px] px-1.5 py-0 rounded-full font-medium"
                  style={getInstrumentBadgeStyle(getCategoryColor(cleanCategory(e.category) as ExpenseCategory))}
                >
                  {cleanCategory(e.category)}
                </span>
                <span className="text-xs text-muted-foreground font-mono">{e.date}</span>
                {e.tags && e.tags.length > 0 && e.tags.map(t => (
                  <span key={t} className="text-[10px] px-1.5 py-0 rounded-full bg-secondary/50 text-secondary-foreground">{t}</span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono font-semibold text-primary whitespace-nowrap">${e.amount.toFixed(2)}</span>
              <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        ))}

        {/* Infinite scroll sentinel */}
        {pageToken && onLoadMore && (
          <div ref={sentinelRef} className="px-3 py-2 flex items-center justify-center">
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            ) : loadError ? (
              <button onClick={loadMore} className="text-xs text-destructive font-mono hover:underline">
                Failed to load. Tap to retry.
              </button>
            ) : (
              <span className="text-xs text-muted-foreground font-mono">Scroll for more...</span>
            )}
          </div>
        )}
      </div>

      {/* Fallback when no onLoadMore callback is provided */}
      {!onLoadMore && initialHasMore && (
        <div className="px-3 py-1.5 border-t border-primary/10 text-xs text-muted-foreground text-center font-mono">
          More results available...
        </div>
      )}
    </div>
  );
}
