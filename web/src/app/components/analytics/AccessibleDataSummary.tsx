'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type AccessibleDataSummaryProps = {
  caption: string;
  columns: readonly string[];
  rows: readonly (readonly string[])[];
};

function duplicateSafeKeys(values: readonly string[], prefix: string) {
  const occurrences = new Map<string, number>();

  return values.map((value) => {
    const occurrence = occurrences.get(value) ?? 0;
    occurrences.set(value, occurrence + 1);
    return `${prefix}:${value}:${occurrence}`;
  });
}

export function AccessibleDataSummary({
  caption,
  columns,
  rows,
}: AccessibleDataSummaryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const columnKeys = duplicateSafeKeys(columns, 'column');
  const rowKeys = duplicateSafeKeys(
    rows.map((row) => JSON.stringify(row)),
    'row'
  );

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex min-h-10 w-full items-center justify-between gap-3 rounded-md bg-transparent px-4 py-2 text-left text-sm font-semibold text-foreground outline-none transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100"
        >
          <span>{isOpen ? 'Hide data table' : 'Show data table'}</span>
          <ChevronDown
            aria-hidden="true"
            data-testid="data-summary-chevron"
            className={`size-4 shrink-0 transition-transform duration-150 ease-out motion-reduce:transition-none ${
              isOpen ? 'rotate-180' : 'rotate-0'
            }`}
          />
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="border-t border-border">
        <Table className="min-w-max tabular-nums">
          <TableCaption className="sr-only">{caption}</TableCaption>
          {columns.length > 0 ? (
            <TableHeader>
              <TableRow>
                {columns.map((column, index) => (
                  <TableHead key={columnKeys[index]} scope="col">
                    {column}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
          ) : null}
          <TableBody>
            {rows.map((row, rowIndex) => {
              const cellKeys = duplicateSafeKeys(
                row,
                `cell:${rowKeys[rowIndex]}`
              );

              return (
                <TableRow key={rowKeys[rowIndex]}>
                  {row.map((cell, cellIndex) => (
                    <TableCell
                      key={cellKeys[cellIndex]}
                      className="tabular-nums"
                    >
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CollapsibleContent>
    </Collapsible>
  );
}
