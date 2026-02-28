'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Check, X, DollarSign, Sparkles } from 'lucide-react';
import { financeClient } from '@/lib/financeService';
import { useAuth } from '../../context/AuthWithAdminContext';
import type { PotentialDeduction } from '@/gen/pfinance/v1/types_pb';
import { getCategoryLabel } from '../../constants/taxDeductions';

interface DeductionFinderProps {
  financialYear?: string;
  occupation?: string;
}

export default function DeductionFinder({ financialYear, occupation }: DeductionFinderProps) {
  const { user } = useAuth();
  const [suggestions, setSuggestions] = useState<PotentialDeduction[]>([]);
  const [loading, setLoading] = useState(false);
  const [scannedCount, setScannedCount] = useState(0);
  const [totalSavings, setTotalSavings] = useState(0);
  const [hasScanned, setHasScanned] = useState(false);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [rejected, setRejected] = useState<Set<string>>(new Set());

  const scan = useCallback(async () => {
    if (!user?.uid) return;

    setLoading(true);
    try {
      const response = await financeClient.findPotentialDeductions({
        userId: user.uid,
        financialYear: financialYear || '',
        occupation: occupation || '',
      });
      setSuggestions(response.suggestions);
      setScannedCount(response.scannedCount);
      setTotalSavings(response.totalPotentialSavings);
      setHasScanned(true);
    } catch (err) {
      console.error('Failed to scan for deductions:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.uid, financialYear, occupation]);

  const acceptSuggestion = useCallback(async (suggestion: PotentialDeduction) => {
    if (!user?.uid) return;

    try {
      await financeClient.batchUpdateExpenseTaxStatus({
        userId: user.uid,
        updates: [{
          expenseId: suggestion.expenseId,
          isTaxDeductible: true,
          taxDeductionCategory: suggestion.suggestedDeductionCategory,
          taxDeductiblePercent: suggestion.deductiblePercent,
          taxDeductionNote: '',
        }],
      });
      setAccepted(prev => new Set(prev).add(suggestion.expenseId));
    } catch (err) {
      console.error('Failed to accept suggestion:', err);
    }
  }, [user?.uid]);

  const rejectSuggestion = useCallback((expenseId: string) => {
    setRejected(prev => new Set(prev).add(expenseId));
  }, []);

  const pendingSuggestions = suggestions.filter(
    s => !accepted.has(s.expenseId) && !rejected.has(s.expenseId)
  );

  const confidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-500';
    if (confidence >= 0.6) return 'text-yellow-500';
    return 'text-orange-500';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="w-5 h-5" />
          Deduction Finder
        </CardTitle>
        <CardDescription>
          Scan your unclassified expenses to find potential tax deductions
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Button onClick={scan} disabled={loading} className="gap-2">
            <Search className="w-4 h-4" />
            {loading ? 'Scanning...' : hasScanned ? 'Rescan' : 'Scan for Deductions'}
          </Button>
          {hasScanned && (
            <span className="text-sm text-muted-foreground">
              Scanned {scannedCount} expenses
            </span>
          )}
        </div>

        {loading && (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        )}

        {hasScanned && !loading && suggestions.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No potential deductions found. All expenses are already classified.
          </p>
        )}

        {hasScanned && !loading && suggestions.length > 0 && (
          <>
            <div className="flex items-center gap-2 p-3 bg-green-500/10 rounded-lg border border-green-500/20">
              <DollarSign className="w-5 h-5 text-green-500" />
              <span className="text-sm font-medium">
                Potential savings: <strong>${totalSavings.toFixed(2)}</strong>
              </span>
              <span className="text-xs text-muted-foreground ml-auto">
                {pendingSuggestions.length} pending review
              </span>
            </div>

            <div className="rounded-md border overflow-auto max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Savings</TableHead>
                    <TableHead className="w-[100px]">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suggestions.map(s => {
                    const isAccepted = accepted.has(s.expenseId);
                    const isRejected = rejected.has(s.expenseId);

                    return (
                      <TableRow key={s.expenseId} className={isAccepted || isRejected ? 'opacity-50' : ''}>
                        <TableCell>
                          <div>
                            <span className="font-medium text-sm">{s.description}</span>
                            {s.reasoning && (
                              <p className="text-xs text-muted-foreground mt-0.5">{s.reasoning}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>${s.amount.toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {getCategoryLabel(s.suggestedDeductionCategory)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className={`text-sm font-medium ${confidenceColor(s.confidence)}`}>
                            {(s.confidence * 100).toFixed(0)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-green-500 font-medium">
                          ${s.potentialSavings.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          {isAccepted ? (
                            <Badge className="bg-green-500/20 text-green-500 text-xs">Accepted</Badge>
                          ) : isRejected ? (
                            <Badge variant="secondary" className="text-xs">Rejected</Badge>
                          ) : (
                            <div className="flex gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-green-500 hover:text-green-600"
                                onClick={() => acceptSuggestion(s)}
                              >
                                <Check className="w-4 h-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-red-500 hover:text-red-600"
                                onClick={() => rejectSuggestion(s.expenseId)}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
