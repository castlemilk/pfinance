'use client';

import { useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ChevronDown, Receipt } from 'lucide-react';
import type { ExtractedLineItem } from '@/gen/pfinance/v1/types_pb';
import { ExpenseCategory } from '@/gen/pfinance/v1/types_pb';
import { cn } from '@/lib/utils';

interface LineItemBreakdownProps {
  lineItems: ExtractedLineItem[];
  className?: string;
}

/**
 * Map proto ExpenseCategory enum to a human-readable label.
 */
const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  [ExpenseCategory.UNSPECIFIED]: 'Uncategorized',
  [ExpenseCategory.FOOD]: 'Food',
  [ExpenseCategory.HOUSING]: 'Housing',
  [ExpenseCategory.TRANSPORTATION]: 'Transportation',
  [ExpenseCategory.ENTERTAINMENT]: 'Entertainment',
  [ExpenseCategory.HEALTHCARE]: 'Healthcare',
  [ExpenseCategory.UTILITIES]: 'Utilities',
  [ExpenseCategory.SHOPPING]: 'Shopping',
  [ExpenseCategory.EDUCATION]: 'Education',
  [ExpenseCategory.TRAVEL]: 'Travel',
  [ExpenseCategory.OTHER]: 'Other',
};

/**
 * Resolve the effective amount for a line item.
 * Prefers amountCents (bigint) when non-zero, otherwise falls back to the float amount.
 */
function resolveAmount(item: ExtractedLineItem): number {
  if (item.amountCents !== BigInt(0)) {
    return Number(item.amountCents) / 100;
  }
  return item.amount;
}

/**
 * Format a number as a dollar amount with exactly 2 decimal places.
 */
function formatAmount(value: number): string {
  return `$${value.toFixed(2)}`;
}

/**
 * Compute the unit price for a line item.
 * If quantity is greater than 1, divides the total by quantity.
 */
function getUnitPrice(item: ExtractedLineItem): number {
  const total = resolveAmount(item);
  const qty = item.quantity > 0 ? item.quantity : 1;
  return total / qty;
}

export function LineItemBreakdown({ lineItems, className }: LineItemBreakdownProps) {
  const [open, setOpen] = useState(false);

  // Don't render anything if there are no line items
  if (!lineItems || lineItems.length === 0) {
    return null;
  }

  const grandTotal = lineItems.reduce((sum, item) => sum + resolveAmount(item), 0);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn('w-full', className)}>
      <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full py-1.5">
        <Receipt className="h-4 w-4 text-[var(--accent)]" />
        <span className="font-medium">
          Line Items ({lineItems.length} {lineItems.length === 1 ? 'item' : 'items'})
        </span>
        <span className="ml-auto text-xs tabular-nums opacity-70">
          {formatAmount(grandTotal)}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 transition-transform duration-200',
            open && 'rotate-180'
          )}
        />
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-2">
        <div className="rounded-md border border-[var(--secondary)]/30 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-[var(--secondary)]/20 hover:bg-transparent">
                <TableHead className="text-xs font-semibold text-[var(--accent)]">
                  Description
                </TableHead>
                <TableHead className="text-xs font-semibold text-[var(--accent)] text-right w-16">
                  Qty
                </TableHead>
                <TableHead className="text-xs font-semibold text-[var(--accent)] text-right w-24">
                  Unit Price
                </TableHead>
                <TableHead className="text-xs font-semibold text-[var(--accent)] text-right w-24">
                  Total
                </TableHead>
                <TableHead className="text-xs font-semibold text-[var(--accent)] w-28">
                  Category
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {lineItems.map((item, index) => {
                const total = resolveAmount(item);
                const qty = item.quantity > 0 ? item.quantity : 1;
                const unitPrice = getUnitPrice(item);
                const categoryLabel = CATEGORY_LABELS[item.category] ?? 'Other';

                return (
                  <TableRow
                    key={index}
                    className="border-b border-[var(--secondary)]/10 hover:bg-[var(--secondary)]/5"
                  >
                    <TableCell className="text-sm text-foreground">
                      {item.description || 'Unknown item'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground text-right tabular-nums">
                      {qty}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground text-right tabular-nums">
                      {formatAmount(unitPrice)}
                    </TableCell>
                    <TableCell className="text-sm text-foreground text-right tabular-nums font-medium">
                      {formatAmount(total)}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--secondary)]/20 text-[var(--accent)]">
                        {categoryLabel}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>

            <TableFooter className="bg-[var(--secondary)]/10 border-t border-[var(--secondary)]/30">
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={3}
                  className="text-sm font-semibold text-foreground"
                >
                  Total
                </TableCell>
                <TableCell className="text-sm font-bold text-[var(--accent)] text-right tabular-nums">
                  {formatAmount(grandTotal)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
