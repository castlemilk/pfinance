'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthWithAdminContext';
import { financeClient } from '@/lib/financeService';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Receipt,
  TrendingUp,
  Loader2,
  SlidersHorizontal,
  X,
  Calendar,
  DollarSign,
  Tag,
  ArrowUpDown,
  Search,
  Sparkles,
} from 'lucide-react';
import { SearchResult, TransactionType } from '@/gen/pfinance/v1/types_pb';
import { timestampDate, timestampFromDate } from '@bufbuild/protobuf/wkt';

// Category options matching the proto ExpenseCategory enum
const CATEGORIES = [
  'Food',
  'Housing',
  'Transportation',
  'Entertainment',
  'Healthcare',
  'Utilities',
  'Shopping',
  'Education',
  'Travel',
  'Other',
] as const;

// Date range preset options
type DatePreset = 'any' | 'today' | 'week' | 'month' | '3months' | '6months' | 'year' | 'custom';

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'any', label: 'Any time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Past 7 days' },
  { value: 'month', label: 'Past 30 days' },
  { value: '3months', label: 'Past 3 months' },
  { value: '6months', label: 'Past 6 months' },
  { value: 'year', label: 'Past year' },
  { value: 'custom', label: 'Custom range' },
];

interface SearchFilters {
  category: string;
  type: TransactionType;
  datePreset: DatePreset;
  customStartDate: string;
  customEndDate: string;
  amountMin: string;
  amountMax: string;
}

const DEFAULT_FILTERS: SearchFilters = {
  category: '',
  type: TransactionType.UNSPECIFIED,
  datePreset: 'any',
  customStartDate: '',
  customEndDate: '',
  amountMin: '',
  amountMax: '',
};

function getDateRangeFromPreset(preset: DatePreset, customStart: string, customEnd: string): { start?: Date; end?: Date } {
  const now = new Date();
  switch (preset) {
    case 'today': {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { start, end: now };
    }
    case 'week': {
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      return { start, end: now };
    }
    case 'month': {
      const start = new Date(now);
      start.setDate(start.getDate() - 30);
      return { start, end: now };
    }
    case '3months': {
      const start = new Date(now);
      start.setMonth(start.getMonth() - 3);
      return { start, end: now };
    }
    case '6months': {
      const start = new Date(now);
      start.setMonth(start.getMonth() - 6);
      return { start, end: now };
    }
    case 'year': {
      const start = new Date(now);
      start.setFullYear(start.getFullYear() - 1);
      return { start, end: now };
    }
    case 'custom': {
      return {
        start: customStart ? new Date(customStart) : undefined,
        end: customEnd ? new Date(customEnd) : undefined,
      };
    }
    default:
      return {};
  }
}

export default function SearchCommandPalette() {
  const { user } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.category) count++;
    if (filters.type !== TransactionType.UNSPECIFIED) count++;
    if (filters.datePreset !== 'any') count++;
    if (filters.amountMin) count++;
    if (filters.amountMax) count++;
    return count;
  }, [filters]);

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

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      // Small delay to let the close animation finish
      const timer = setTimeout(() => {
        setQuery('');
        setResults([]);
        setTotalCount(0);
        setShowFilters(false);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const search = useCallback(async (searchQuery: string, searchFilters: SearchFilters) => {
    if (!user) {
      setResults([]);
      setTotalCount(0);
      return;
    }

    // Allow search if there's a query OR active filters
    const hasActiveFilters = searchFilters.category ||
      searchFilters.type !== TransactionType.UNSPECIFIED ||
      searchFilters.datePreset !== 'any' ||
      searchFilters.amountMin ||
      searchFilters.amountMax;

    if (!searchQuery.trim() && !hasActiveFilters) {
      setResults([]);
      setTotalCount(0);
      return;
    }

    setLoading(true);
    try {
      const dateRange = getDateRangeFromPreset(
        searchFilters.datePreset,
        searchFilters.customStartDate,
        searchFilters.customEndDate
      );

      const amountMin = searchFilters.amountMin ? parseFloat(searchFilters.amountMin) : 0;
      const amountMax = searchFilters.amountMax ? parseFloat(searchFilters.amountMax) : 0;

      const response = await financeClient.searchTransactions({
        userId: user.uid,
        query: searchQuery,
        category: searchFilters.category,
        type: searchFilters.type,
        startDate: dateRange.start ? timestampFromDate(dateRange.start) : undefined,
        endDate: dateRange.end ? timestampFromDate(dateRange.end) : undefined,
        amountMin,
        amountMax,
        pageSize: 30,
      });
      setResults(response.results);
      setTotalCount(response.totalCount);
    } catch {
      setResults([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Debounced search - triggers on query or filter changes
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      search(query, filters);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, filters, search]);

  const handleSelect = (result: SearchResult) => {
    setOpen(false);
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
    return d.toLocaleDateString('en-AU', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const updateFilter = <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS);
  };

  const removeFilter = (key: keyof SearchFilters) => {
    setFilters(prev => ({ ...prev, [key]: DEFAULT_FILTERS[key] }));
  };

  const expenses = results.filter(r => r.type === TransactionType.EXPENSE);
  const incomes = results.filter(r => r.type === TransactionType.INCOME);

  // Summary calculations
  const totalExpenseAmount = expenses.reduce((sum, r) => {
    const cents = r.amountCents;
    if (cents !== BigInt(0)) return sum + Number(cents) / 100;
    return sum + r.amount;
  }, 0);

  const totalIncomeAmount = incomes.reduce((sum, r) => {
    const cents = r.amountCents;
    if (cents !== BigInt(0)) return sum + Number(cents) / 100;
    return sum + r.amount;
  }, 0);

  const hasQuery = query.trim().length > 0;
  const hasActiveFilters = activeFilterCount > 0;
  const hasSearchCriteria = hasQuery || hasActiveFilters;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 shadow-lg border-primary/20 sm:max-w-2xl max-w-[calc(100%-2rem)]">
        <DialogTitle className="sr-only">Search Transactions</DialogTitle>
        <Command
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5"
          shouldFilter={false}
        >
          {/* Search Input with filter toggle */}
          <div className="flex items-center border-b px-3" cmdk-input-wrapper="">
            <Search className="mr-2 h-4 w-4 shrink-0 text-primary" />
            <input
              ref={inputRef}
              className="flex h-12 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Search transactions, merchants, categories..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="flex items-center gap-1 shrink-0">
              {activeFilterCount > 0 && (
                <Badge
                  variant="default"
                  className="text-[10px] px-1.5 py-0 h-5 bg-primary/90 cursor-pointer hover:bg-primary"
                  onClick={clearFilters}
                >
                  {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
                  <X className="h-3 w-3 ml-0.5" />
                </Badge>
              )}
              <Button
                variant={showFilters ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 w-7 p-0 shrink-0"
                onClick={() => setShowFilters(!showFilters)}
                title="Toggle filters"
              >
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Filter Panel */}
          {showFilters && (
            <div className="border-b bg-muted/30 px-4 py-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3" />
                  Filters
                </span>
                {activeFilterCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs text-muted-foreground hover:text-foreground"
                    onClick={clearFilters}
                  >
                    Clear all
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {/* Transaction Type */}
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <ArrowUpDown className="h-3 w-3" />
                    Type
                  </label>
                  <Select
                    value={String(filters.type)}
                    onValueChange={(v) => updateFilter('type', Number(v) as TransactionType)}
                  >
                    <SelectTrigger className="h-8 text-xs w-full">
                      <SelectValue placeholder="All types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={String(TransactionType.UNSPECIFIED)}>All types</SelectItem>
                      <SelectItem value={String(TransactionType.EXPENSE)}>Expenses</SelectItem>
                      <SelectItem value={String(TransactionType.INCOME)}>Income</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Category */}
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <Tag className="h-3 w-3" />
                    Category
                  </label>
                  <Select
                    value={filters.category || '__all__'}
                    onValueChange={(v) => updateFilter('category', v === '__all__' ? '' : v)}
                  >
                    <SelectTrigger className="h-8 text-xs w-full">
                      <SelectValue placeholder="All categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All categories</SelectItem>
                      {CATEGORIES.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Date Range */}
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Date
                  </label>
                  <Select
                    value={filters.datePreset}
                    onValueChange={(v) => updateFilter('datePreset', v as DatePreset)}
                  >
                    <SelectTrigger className="h-8 text-xs w-full">
                      <SelectValue placeholder="Any time" />
                    </SelectTrigger>
                    <SelectContent>
                      {DATE_PRESETS.map(preset => (
                        <SelectItem key={preset.value} value={preset.value}>{preset.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Amount Range */}
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    Amount
                  </label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 text-xs w-full justify-start font-normal">
                        {filters.amountMin || filters.amountMax
                          ? `$${filters.amountMin || '0'} - $${filters.amountMax || '\u221E'}`
                          : 'Any amount'
                        }
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-3" align="end">
                      <div className="space-y-2">
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground">Min amount</label>
                          <Input
                            type="number"
                            placeholder="0"
                            value={filters.amountMin}
                            onChange={(e) => updateFilter('amountMin', e.target.value)}
                            className="h-8 text-xs"
                            min="0"
                            step="0.01"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground">Max amount</label>
                          <Input
                            type="number"
                            placeholder="No limit"
                            value={filters.amountMax}
                            onChange={(e) => updateFilter('amountMax', e.target.value)}
                            className="h-8 text-xs"
                            min="0"
                            step="0.01"
                          />
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Custom date range inputs */}
              {filters.datePreset === 'custom' && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">Start date</label>
                    <Input
                      type="date"
                      value={filters.customStartDate}
                      onChange={(e) => updateFilter('customStartDate', e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground">End date</label>
                    <Input
                      type="date"
                      value={filters.customEndDate}
                      onChange={(e) => updateFilter('customEndDate', e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              )}

              {/* Active filter badges */}
              {activeFilterCount > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {filters.type !== TransactionType.UNSPECIFIED && (
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-2 py-0.5 gap-1 cursor-pointer hover:bg-destructive/20"
                      onClick={() => removeFilter('type')}
                    >
                      {filters.type === TransactionType.EXPENSE ? 'Expenses only' : 'Income only'}
                      <X className="h-2.5 w-2.5" />
                    </Badge>
                  )}
                  {filters.category && (
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-2 py-0.5 gap-1 cursor-pointer hover:bg-destructive/20"
                      onClick={() => removeFilter('category')}
                    >
                      {filters.category}
                      <X className="h-2.5 w-2.5" />
                    </Badge>
                  )}
                  {filters.datePreset !== 'any' && (
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-2 py-0.5 gap-1 cursor-pointer hover:bg-destructive/20"
                      onClick={() => {
                        removeFilter('datePreset');
                        removeFilter('customStartDate');
                        removeFilter('customEndDate');
                      }}
                    >
                      {DATE_PRESETS.find(p => p.value === filters.datePreset)?.label}
                      <X className="h-2.5 w-2.5" />
                    </Badge>
                  )}
                  {(filters.amountMin || filters.amountMax) && (
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-2 py-0.5 gap-1 cursor-pointer hover:bg-destructive/20"
                      onClick={() => {
                        removeFilter('amountMin');
                        removeFilter('amountMax');
                      }}
                    >
                      ${filters.amountMin || '0'} - ${filters.amountMax || '\u221E'}
                      <X className="h-2.5 w-2.5" />
                    </Badge>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Results */}
          <CommandList className="max-h-[400px]">
            {loading && (
              <div className="flex items-center justify-center py-8 gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Searching...</span>
              </div>
            )}

            {!loading && hasSearchCriteria && results.length === 0 && (
              <CommandEmpty>
                <div className="flex flex-col items-center gap-2 py-4">
                  <Search className="h-8 w-8 text-muted-foreground/50" />
                  <p className="text-muted-foreground">No transactions found</p>
                  {hasActiveFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={clearFilters}
                    >
                      Clear filters and try again
                    </Button>
                  )}
                </div>
              </CommandEmpty>
            )}

            {!loading && !hasSearchCriteria && (
              <div className="py-8 text-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="relative">
                    <Search className="h-10 w-10 text-muted-foreground/30" />
                    <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary/20 animate-pulse" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">
                      Search your transactions
                    </p>
                    <p className="text-xs text-muted-foreground/70">
                      Type to search or use filters to narrow results
                    </p>
                  </div>
                  <div className="flex gap-2 mt-1">
                    <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                      <span className="text-xs">&#8984;</span>K
                    </kbd>
                    <span className="text-[10px] text-muted-foreground/60">to toggle search</span>
                  </div>
                </div>
              </div>
            )}

            {/* Results Summary */}
            {!loading && results.length > 0 && (
              <>
                <div className="px-4 py-2 flex items-center justify-between text-xs text-muted-foreground border-b bg-muted/20">
                  <span>
                    {totalCount > 0 ? `${totalCount} result${totalCount !== 1 ? 's' : ''}` : `${results.length} result${results.length !== 1 ? 's' : ''}`}
                  </span>
                  <div className="flex items-center gap-3">
                    {expenses.length > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                        -${totalExpenseAmount.toFixed(2)}
                      </span>
                    )}
                    {incomes.length > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                        +${totalIncomeAmount.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>

                {expenses.length > 0 && (
                  <CommandGroup heading={`Expenses (${expenses.length})`}>
                    {expenses.map((result) => (
                      <CommandItem
                        key={result.id}
                        value={`${result.id}-${result.description}`}
                        onSelect={() => handleSelect(result)}
                        className="cursor-pointer group"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <Receipt className="h-4 w-4 text-red-500 shrink-0" />
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="truncate text-sm">{result.description}</span>
                            {result.category && (
                              <span className="text-[10px] text-muted-foreground truncate">
                                {result.category}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm font-medium text-red-500 tabular-nums">
                            -{formatAmount(result)}
                          </span>
                          <Badge variant="outline" className="text-[10px] px-1.5 hidden sm:inline-flex">
                            {formatDate(result)}
                          </Badge>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}

                {expenses.length > 0 && incomes.length > 0 && <CommandSeparator />}

                {incomes.length > 0 && (
                  <CommandGroup heading={`Income (${incomes.length})`}>
                    {incomes.map((result) => (
                      <CommandItem
                        key={result.id}
                        value={`${result.id}-${result.description}`}
                        onSelect={() => handleSelect(result)}
                        className="cursor-pointer group"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <TrendingUp className="h-4 w-4 text-green-500 shrink-0" />
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="truncate text-sm">{result.description}</span>
                            {result.category && (
                              <span className="text-[10px] text-muted-foreground truncate">
                                {result.category}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm font-medium text-green-500 tabular-nums">
                            +{formatAmount(result)}
                          </span>
                          <Badge variant="outline" className="text-[10px] px-1.5 hidden sm:inline-flex">
                            {formatDate(result)}
                          </Badge>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </>
            )}
          </CommandList>

          {/* Footer */}
          <div className="flex items-center justify-between border-t px-3 py-2 text-[10px] text-muted-foreground/70">
            <div className="flex items-center gap-2">
              <kbd className="inline-flex h-4 select-none items-center rounded border bg-muted px-1 font-mono text-[9px]">
                &#8593;&#8595;
              </kbd>
              <span>navigate</span>
              <kbd className="inline-flex h-4 select-none items-center rounded border bg-muted px-1 font-mono text-[9px]">
                &#9166;
              </kbd>
              <span>select</span>
              <kbd className="inline-flex h-4 select-none items-center rounded border bg-muted px-1 font-mono text-[9px]">
                esc
              </kbd>
              <span>close</span>
            </div>
            <span className="hidden sm:inline">PFinance Search</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
