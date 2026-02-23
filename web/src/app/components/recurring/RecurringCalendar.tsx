'use client';

import { useMemo, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  X,
} from 'lucide-react';
import { useRecurring } from '../../context/RecurringContext';
import RecurringBadge from './RecurringBadge';
import type { RecurringTransaction, ExpenseFrequency } from '../../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const CATEGORY_COLORS: Record<string, string> = {
  Food: 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30',
  Housing: 'bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30',
  Transportation: 'bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/30',
  Entertainment: 'bg-pink-500/20 text-pink-700 dark:text-pink-300 border-pink-500/30',
  Healthcare: 'bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30',
  Utilities: 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border-cyan-500/30',
  Shopping: 'bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/30',
  Education: 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border-indigo-500/30',
  Travel: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  Other: 'bg-gray-500/20 text-gray-700 dark:text-gray-300 border-gray-500/30',
};

/** Date key for hashing: YYYY-MM-DD */
function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Occurrence calculation
// ---------------------------------------------------------------------------

interface CalendarOccurrence {
  transaction: RecurringTransaction;
  date: Date;
}

/**
 * Add one frequency-period to a date, returning a new Date.
 */
function addFrequency(date: Date, frequency: ExpenseFrequency): Date {
  const d = new Date(date);
  switch (frequency) {
    case 'daily':
      d.setDate(d.getDate() + 1);
      break;
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'fortnightly':
      d.setDate(d.getDate() + 14);
      break;
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      break;
    case 'quarterly':
      d.setMonth(d.getMonth() + 3);
      break;
    case 'annually':
      d.setFullYear(d.getFullYear() + 1);
      break;
    default:
      // "once" -- no recurrence
      break;
  }
  return d;
}

/**
 * Subtract one frequency-period from a date, returning a new Date.
 * Used to walk backwards from `nextOccurrence` to find the earliest
 * occurrence visible in the calendar range.
 */
function subtractFrequency(date: Date, frequency: ExpenseFrequency): Date {
  const d = new Date(date);
  switch (frequency) {
    case 'daily':
      d.setDate(d.getDate() - 1);
      break;
    case 'weekly':
      d.setDate(d.getDate() - 7);
      break;
    case 'fortnightly':
      d.setDate(d.getDate() - 14);
      break;
    case 'monthly':
      d.setMonth(d.getMonth() - 1);
      break;
    case 'quarterly':
      d.setMonth(d.getMonth() - 3);
      break;
    case 'annually':
      d.setFullYear(d.getFullYear() - 1);
      break;
    default:
      break;
  }
  return d;
}

/**
 * Generate all occurrences of a recurring transaction within
 * [rangeStart, rangeEnd].
 */
function getOccurrencesInRange(
  transaction: RecurringTransaction,
  rangeStart: Date,
  rangeEnd: Date,
): CalendarOccurrence[] {
  if (transaction.status !== 'active') return [];
  if (transaction.frequency === 'once') {
    if (transaction.nextOccurrence >= rangeStart && transaction.nextOccurrence <= rangeEnd) {
      return [{ transaction, date: new Date(transaction.nextOccurrence) }];
    }
    return [];
  }

  const occurrences: CalendarOccurrence[] = [];

  // Walk backward from nextOccurrence to find the earliest anchor
  // that is at or before rangeStart (but not before startDate).
  let anchor = new Date(transaction.nextOccurrence);
  const earliest = transaction.startDate > rangeStart ? transaction.startDate : rangeStart;

  let safety = 0;
  while (anchor > earliest && safety < 500) {
    const prev = subtractFrequency(anchor, transaction.frequency);
    if (prev >= anchor) break;
    anchor = prev;
    safety++;
  }

  // Ensure anchor is not before startDate
  if (anchor < transaction.startDate) {
    anchor = new Date(transaction.startDate);
  }

  // Walk forward and collect occurrences within [rangeStart, rangeEnd]
  let cursor = anchor;
  safety = 0;
  while (cursor <= rangeEnd && safety < 500) {
    if (cursor >= rangeStart) {
      if (transaction.endDate && cursor > transaction.endDate) break;
      occurrences.push({ transaction, date: new Date(cursor) });
    }
    const next = addFrequency(cursor, transaction.frequency);
    if (next <= cursor) break;
    cursor = next;
    safety++;
  }

  return occurrences;
}

// ---------------------------------------------------------------------------
// Calendar grid helpers
// ---------------------------------------------------------------------------

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  key: string;
}

function buildCalendarGrid(year: number, month: number): CalendarDay[] {
  const today = new Date();
  const todayKey = dateKey(today);
  const firstOfMonth = new Date(year, month, 1);
  const startDay = firstOfMonth.getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const days: CalendarDay[] = [];

  // Leading days from previous month
  if (startDay > 0) {
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = startDay - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthDays - i);
      const k = dateKey(d);
      days.push({ date: d, isCurrentMonth: false, isToday: k === todayKey, key: k });
    }
  }

  // Current month days
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(year, month, i);
    const k = dateKey(d);
    days.push({ date: d, isCurrentMonth: true, isToday: k === todayKey, key: k });
  }

  // Trailing days to fill 6 rows = 42 cells
  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(year, month + 1, i);
    const k = dateKey(d);
    days.push({ date: d, isCurrentMonth: false, isToday: k === todayKey, key: k });
  }

  return days;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RecurringCalendar() {
  const { recurringTransactions, loading } = useRecurring();

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Navigation
  const goToPrev = useCallback(() => {
    setViewMonth((m) => {
      if (m === 0) {
        setViewYear((y) => y - 1);
        return 11;
      }
      return m - 1;
    });
    setSelectedDay(null);
  }, []);

  const goToNext = useCallback(() => {
    setViewMonth((m) => {
      if (m === 11) {
        setViewYear((y) => y + 1);
        return 0;
      }
      return m + 1;
    });
    setSelectedDay(null);
  }, []);

  const goToToday = useCallback(() => {
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    setSelectedDay(null);
  }, []);

  // Calendar grid
  const calendarDays = useMemo(
    () => buildCalendarGrid(viewYear, viewMonth),
    [viewYear, viewMonth],
  );

  // Build occurrence map: dateKey -> CalendarOccurrence[]
  // rangeStart/rangeEnd are computed inside the memo to avoid Date object
  // reference instability breaking memoization.
  const occurrenceMap = useMemo(() => {
    if (calendarDays.length === 0) return new Map<string, CalendarOccurrence[]>();
    const rangeStart = calendarDays[0].date;
    const rangeEnd = calendarDays[calendarDays.length - 1].date;
    const map = new Map<string, CalendarOccurrence[]>();
    for (const tx of recurringTransactions) {
      const occs = getOccurrencesInRange(tx, rangeStart, rangeEnd);
      for (const occ of occs) {
        const k = dateKey(occ.date);
        const existing = map.get(k);
        if (existing) {
          existing.push(occ);
        } else {
          map.set(k, [occ]);
        }
      }
    }
    return map;
  }, [recurringTransactions, calendarDays]);

  // Weekly totals
  const weeklyTotals = useMemo(() => {
    const totals: number[] = [];
    for (let w = 0; w < 6; w++) {
      let total = 0;
      for (let d = 0; d < 7; d++) {
        const day = calendarDays[w * 7 + d];
        const occs = occurrenceMap.get(day.key) || [];
        for (const occ of occs) {
          if (occ.transaction.isExpense) {
            total += occ.transaction.amount;
          }
        }
      }
      totals.push(total);
    }
    return totals;
  }, [calendarDays, occurrenceMap]);

  // Monthly total
  const monthlyTotal = useMemo(() => {
    let total = 0;
    for (const day of calendarDays) {
      if (!day.isCurrentMonth) continue;
      const occs = occurrenceMap.get(day.key) || [];
      for (const occ of occs) {
        if (occ.transaction.isExpense) {
          total += occ.transaction.amount;
        }
      }
    }
    return total;
  }, [calendarDays, occurrenceMap]);

  // Selected day details
  const selectedOccurrences = useMemo(() => {
    if (!selectedDay) return [];
    return occurrenceMap.get(selectedDay) || [];
  }, [selectedDay, occurrenceMap]);

  const selectedDate = useMemo(() => {
    if (!selectedDay) return null;
    const parts = selectedDay.split('-');
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  }, [selectedDay]);

  if (loading && recurringTransactions.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </CardContent>
      </Card>
    );
  }

  if (recurringTransactions.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Recurring Transactions</h3>
          <p className="text-muted-foreground">
            Add a recurring expense or income to see them on the calendar.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Calendar Card */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              <span>{MONTH_NAMES[viewMonth]} {viewYear}</span>
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={goToToday} className="text-xs mr-1">
                Today
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goToPrev}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goToNext}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {/* Monthly expense total */}
          <div className="text-sm text-muted-foreground mt-1">
            Total expenses this month:{' '}
            <span className="text-red-600 dark:text-red-400 font-semibold">
              {formatCurrency(monthlyTotal)}
            </span>
          </div>
        </CardHeader>
        <CardContent className="px-2 sm:px-6">
          {/* Day headers */}
          <div className="grid grid-cols-[repeat(7,1fr)_auto] gap-px mb-1">
            {DAY_HEADERS.map((d) => (
              <div
                key={d}
                className="text-center text-xs font-medium text-muted-foreground py-2"
              >
                {d}
              </div>
            ))}
            <div className="text-center text-xs font-medium text-muted-foreground py-2 w-16 hidden md:block">
              Wk Total
            </div>
          </div>

          {/* Calendar grid */}
          <div className="border border-border/60 rounded-lg overflow-hidden">
            {Array.from({ length: 6 }, (_, weekIdx) => (
              <div
                key={weekIdx}
                className="grid grid-cols-[repeat(7,1fr)_auto] gap-px bg-border/40"
              >
                {Array.from({ length: 7 }, (_, dayIdx) => {
                  const dayData = calendarDays[weekIdx * 7 + dayIdx];
                  const occs = occurrenceMap.get(dayData.key) || [];
                  const dayTotal = occs.reduce(
                    (sum, o) => sum + (o.transaction.isExpense ? o.transaction.amount : 0),
                    0,
                  );
                  const isSelected = selectedDay === dayData.key;
                  const hasOccurrences = occs.length > 0;

                  return (
                    <button
                      key={dayData.key}
                      onClick={() => setSelectedDay(isSelected ? null : dayData.key)}
                      className={[
                        'relative bg-card min-h-[72px] sm:min-h-[88px] p-1 sm:p-1.5 text-left transition-all',
                        'hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        !dayData.isCurrentMonth && 'opacity-40',
                        dayData.isToday && 'ring-1 ring-inset ring-primary/50',
                        isSelected && 'ring-2 ring-inset ring-primary bg-primary/5',
                        hasOccurrences && 'glow-hover',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {/* Day number */}
                      <div className="flex items-center justify-between mb-0.5">
                        <span
                          className={[
                            'text-xs font-medium leading-none',
                            dayData.isToday &&
                              'bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        >
                          {dayData.date.getDate()}
                        </span>
                        {dayTotal > 0 && (
                          <span className="text-[10px] font-semibold text-red-600 dark:text-red-400 hidden sm:inline">
                            {formatCurrency(dayTotal)}
                          </span>
                        )}
                      </div>

                      {/* Transaction pills -- show max 2 on desktop, 1 on mobile */}
                      <div className="space-y-0.5">
                        {occs.slice(0, 2).map((occ, i) => (
                          <div
                            key={`${occ.transaction.id}-${i}`}
                            className={[
                              'text-[10px] leading-tight truncate rounded px-1 py-px border',
                              CATEGORY_COLORS[occ.transaction.category] || CATEGORY_COLORS.Other,
                              i >= 1 && 'hidden sm:block',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            title={`${occ.transaction.description} - ${formatCurrency(occ.transaction.amount)}`}
                          >
                            {occ.transaction.description}
                          </div>
                        ))}
                        {occs.length > 2 && (
                          <div className="text-[10px] text-muted-foreground font-medium hidden sm:block">
                            +{occs.length - 2} more
                          </div>
                        )}
                        {occs.length > 1 && (
                          <div className="text-[10px] text-muted-foreground font-medium sm:hidden">
                            +{occs.length - 1} more
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}

                {/* Weekly total column */}
                <div className="bg-card flex items-center justify-center w-16 hidden md:flex">
                  {weeklyTotals[weekIdx] > 0 && (
                    <span className="text-[10px] font-semibold text-red-600 dark:text-red-400">
                      {formatCurrency(weeklyTotals[weekIdx])}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border/40">
            {Object.entries(CATEGORY_COLORS)
              .filter(([cat]) => {
                return recurringTransactions.some(
                  (t) => t.category === cat && t.status === 'active',
                );
              })
              .map(([cat, colorClass]) => (
                <div
                  key={cat}
                  className={`text-[10px] sm:text-xs px-1.5 py-0.5 rounded border ${colorClass}`}
                >
                  {cat}
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      {/* Day Detail Panel */}
      {selectedDay && selectedDate && (
        <Card className="border-primary/30">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {selectedDate.toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </CardTitle>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setSelectedDay(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {selectedOccurrences.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No transactions due on this day.
              </p>
            ) : (
              <div className="space-y-2">
                {selectedOccurrences.map((occ, i) => (
                  <div
                    key={`${occ.transaction.id}-detail-${i}`}
                    className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">
                          {occ.transaction.description}
                        </span>
                        <RecurringBadge frequency={occ.transaction.frequency} />
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge
                          variant="outline"
                          className={`text-xs ${CATEGORY_COLORS[occ.transaction.category] || ''}`}
                        >
                          {occ.transaction.category}
                        </Badge>
                        {occ.transaction.tags && occ.transaction.tags.length > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {occ.transaction.tags.join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="pl-3">
                      <span
                        className={`font-semibold whitespace-nowrap ${
                          occ.transaction.isExpense
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-green-600 dark:text-green-400'
                        }`}
                      >
                        {occ.transaction.isExpense ? '-' : '+'}
                        {formatCurrency(occ.transaction.amount)}
                      </span>
                    </div>
                  </div>
                ))}

                {/* Day summary */}
                <div className="flex items-center justify-between pt-2 border-t border-border/40">
                  <span className="text-sm text-muted-foreground">
                    {selectedOccurrences.length} transaction{selectedOccurrences.length !== 1 ? 's' : ''}
                  </span>
                  <div className="flex gap-4">
                    {(() => {
                      const expenses = selectedOccurrences
                        .filter((o) => o.transaction.isExpense)
                        .reduce((s, o) => s + o.transaction.amount, 0);
                      const income = selectedOccurrences
                        .filter((o) => !o.transaction.isExpense)
                        .reduce((s, o) => s + o.transaction.amount, 0);
                      return (
                        <>
                          {expenses > 0 && (
                            <span className="text-sm font-semibold text-red-600 dark:text-red-400">
                              -{formatCurrency(expenses)}
                            </span>
                          )}
                          {income > 0 && (
                            <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                              +{formatCurrency(income)}
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
