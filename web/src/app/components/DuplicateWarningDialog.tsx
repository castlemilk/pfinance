'use client';

import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AlertTriangle, Ban, CheckCircle2, Import } from 'lucide-react';
import type { DuplicateCandidate, ExtractedTransaction } from '@/gen/pfinance/v1/types_pb';

interface DuplicateWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  duplicates: Map<string, DuplicateCandidate[]>;
  transactions: ExtractedTransaction[];
  onSkipDuplicates: (skipTxIds: string[]) => void;
  onImportAll: () => void;
  onCancel: () => void;
}

function centsToAmount(cents: bigint, fallbackAmount: number): number {
  if (cents !== BigInt(0)) {
    return Number(cents) / 100;
  }
  return fallbackAmount;
}

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function getScoreColor(score: number): string {
  if (score > 0.8) return 'text-red-400';
  if (score > 0.6) return 'text-yellow-400';
  return 'text-green-400';
}

function getScoreBadgeVariant(score: number): 'destructive' | 'default' | 'secondary' {
  if (score > 0.8) return 'destructive';
  if (score > 0.6) return 'default';
  return 'secondary';
}

export default function DuplicateWarningDialog({
  open,
  onOpenChange,
  duplicates,
  transactions,
  onSkipDuplicates,
  onImportAll,
  onCancel,
}: DuplicateWarningDialogProps) {
  const [selectedTxIds, setSelectedTxIds] = useState<Set<string>>(new Set());

  // Build a lookup map for transactions by ID
  const txMap = useMemo(() => {
    const map = new Map<string, ExtractedTransaction>();
    for (const tx of transactions) {
      map.set(tx.id, tx);
    }
    return map;
  }, [transactions]);

  // Flatten duplicates into rows for display
  const duplicateRows = useMemo(() => {
    const rows: Array<{
      txId: string;
      transaction: ExtractedTransaction;
      candidate: DuplicateCandidate;
    }> = [];
    for (const [txId, candidates] of duplicates) {
      const tx = txMap.get(txId);
      if (!tx) continue;
      for (const candidate of candidates) {
        rows.push({ txId, transaction: tx, candidate });
      }
    }
    // Sort by match score descending (highest risk first)
    rows.sort((a, b) => b.candidate.matchScore - a.candidate.matchScore);
    return rows;
  }, [duplicates, txMap]);

  // Get unique transaction IDs that have duplicates
  const duplicateTxIds = useMemo(() => {
    return Array.from(duplicates.keys());
  }, [duplicates]);

  const handleToggle = (txId: string) => {
    setSelectedTxIds((prev) => {
      const next = new Set(prev);
      if (next.has(txId)) {
        next.delete(txId);
      } else {
        next.add(txId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedTxIds.size === duplicateTxIds.length) {
      setSelectedTxIds(new Set());
    } else {
      setSelectedTxIds(new Set(duplicateTxIds));
    }
  };

  const handleSkipSelected = () => {
    onSkipDuplicates(Array.from(selectedTxIds));
    setSelectedTxIds(new Set());
  };

  const allSelected = duplicateTxIds.length > 0 && selectedTxIds.size === duplicateTxIds.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-400" />
            Potential Duplicate Transactions
          </DialogTitle>
          <DialogDescription>
            {duplicateTxIds.length} transaction{duplicateTxIds.length !== 1 ? 's' : ''} may
            already exist in your records. Review the matches below and choose which to skip.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[400px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={handleSelectAll}
                    aria-label="Select all duplicates"
                  />
                </TableHead>
                <TableHead>New Transaction</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Matched Expense</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {duplicateRows.map(({ txId, transaction, candidate }, idx) => {
                const txAmount = centsToAmount(transaction.amountCents, transaction.amount);
                const candidateAmount = centsToAmount(candidate.amountCents, candidate.amount);
                const scorePercent = Math.round(candidate.matchScore * 100);

                return (
                  <TableRow key={`${txId}-${candidate.existingExpenseId}-${idx}`}>
                    <TableCell>
                      <Checkbox
                        checked={selectedTxIds.has(txId)}
                        onCheckedChange={() => handleToggle(txId)}
                        aria-label={`Skip ${transaction.description}`}
                      />
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate font-medium" title={transaction.description}>
                      {transaction.normalizedMerchant || transaction.description}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {formatCurrency(txAmount)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {transaction.date}
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate text-sm text-muted-foreground" title={candidate.description}>
                      {candidate.description}
                      <span className="ml-1 text-xs opacity-60">
                        ({formatCurrency(candidateAmount)}, {candidate.date})
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={getScoreBadgeVariant(candidate.matchScore)}>
                        <span className={getScoreColor(candidate.matchScore)}>
                          {scorePercent}%
                        </span>
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[140px] truncate text-xs text-muted-foreground" title={candidate.matchReason}>
                      {candidate.matchReason}
                    </TableCell>
                  </TableRow>
                );
              })}
              {duplicateRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                    No potential duplicates found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>

        {selectedTxIds.size > 0 && (
          <p className="text-sm text-muted-foreground">
            {selectedTxIds.size} transaction{selectedTxIds.size !== 1 ? 's' : ''} selected to
            skip.
          </p>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onCancel}>
            <Ban className="mr-1 h-4 w-4" />
            Cancel
          </Button>
          <Button
            variant="secondary"
            onClick={onImportAll}
          >
            <Import className="mr-1 h-4 w-4" />
            Import All Anyway
          </Button>
          <Button
            variant="default"
            onClick={handleSkipSelected}
            disabled={selectedTxIds.size === 0}
          >
            <CheckCircle2 className="mr-1 h-4 w-4" />
            Skip Selected Duplicates
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
