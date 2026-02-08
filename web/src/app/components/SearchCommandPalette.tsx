'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthWithAdminContext';
import { financeClient } from '@/lib/financeService';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { Receipt, TrendingUp, Loader2 } from 'lucide-react';
import { SearchResult, TransactionType } from '@/gen/pfinance/v1/types_pb';
import { timestampDate } from '@bufbuild/protobuf/wkt';

export default function SearchCommandPalette() {
  const { user } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Listen for Cmd+K / Ctrl+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  const search = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim() || !user) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const response = await financeClient.searchTransactions({
        userId: user.uid,
        query: searchQuery,
        pageSize: 20,
      });
      setResults(response.results);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      search(query);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, search]);

  const handleSelect = (result: SearchResult) => {
    setOpen(false);
    setQuery('');
    if (result.type === TransactionType.EXPENSE) {
      router.push(`/personal/expenses/${result.id}/`);
    } else {
      router.push(`/personal/income/${result.id}/`);
    }
  };

  const formatAmount = (result: SearchResult) => {
    const cents = result.amountCents;
    if (cents !== BigInt(0)) {
      return `$${(Number(cents) / 100).toFixed(2)}`;
    }
    return `$${result.amount.toFixed(2)}`;
  };

  const formatDate = (result: SearchResult) => {
    if (!result.date) return '';
    const d = timestampDate(result.date);
    return d.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' });
  };

  const expenses = results.filter(r => r.type === TransactionType.EXPENSE);
  const incomes = results.filter(r => r.type === TransactionType.INCOME);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search transactions..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {loading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && query && results.length === 0 && (
          <CommandEmpty>No transactions found.</CommandEmpty>
        )}

        {!loading && !query && (
          <CommandEmpty>Type to search expenses and income...</CommandEmpty>
        )}

        {expenses.length > 0 && (
          <CommandGroup heading="Expenses">
            {expenses.map((result) => (
              <CommandItem
                key={result.id}
                value={`${result.id}-${result.description}`}
                onSelect={() => handleSelect(result)}
              >
                <Receipt className="mr-2 h-4 w-4 text-red-500" />
                <span className="flex-1 truncate">{result.description}</span>
                <span className="text-sm font-medium text-red-500">
                  -{formatAmount(result)}
                </span>
                <Badge variant="outline" className="ml-2 text-xs">
                  {formatDate(result)}
                </Badge>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {expenses.length > 0 && incomes.length > 0 && <CommandSeparator />}

        {incomes.length > 0 && (
          <CommandGroup heading="Income">
            {incomes.map((result) => (
              <CommandItem
                key={result.id}
                value={`${result.id}-${result.description}`}
                onSelect={() => handleSelect(result)}
              >
                <TrendingUp className="mr-2 h-4 w-4 text-green-500" />
                <span className="flex-1 truncate">{result.description}</span>
                <span className="text-sm font-medium text-green-500">
                  +{formatAmount(result)}
                </span>
                <Badge variant="outline" className="ml-2 text-xs">
                  {formatDate(result)}
                </Badge>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
