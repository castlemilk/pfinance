'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRightLeft, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { financeClient } from '@/lib/financeService';
import { useAuth } from '../../context/AuthWithAdminContext';
import { TAX_YEAR_OPTIONS } from '../../constants/taxSystems';
import { getCategoryLabel } from '../../constants/taxDeductions';
import type { TaxYearComparison as ComparisonProto } from '@/gen/pfinance/v1/types_pb';

export default function TaxYearComparison() {
  const { user } = useAuth();
  const [yearA, setYearA] = useState<string>(TAX_YEAR_OPTIONS[1]?.value || '2023-24');
  const [yearB, setYearB] = useState<string>(TAX_YEAR_OPTIONS[0]?.value || '2024-25');
  const [comparison, setComparison] = useState<ComparisonProto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const compare = useCallback(async () => {
    if (!user?.uid) return;

    setLoading(true);
    setError(null);
    try {
      const response = await financeClient.compareTaxYears({
        yearA,
        yearB,
      });
      if (response.comparison) {
        setComparison(response.comparison);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Comparison failed');
    } finally {
      setLoading(false);
    }
  }, [user?.uid, yearA, yearB]);

  const formatCents = (cents: bigint) => {
    const num = Number(cents);
    const abs = Math.abs(num);
    const prefix = num < 0 ? '-' : '';
    return `${prefix}$${(abs / 100).toLocaleString('en-AU', { minimumFractionDigits: 2 })}`;
  };

  const changeIcon = (changeCents: bigint) => {
    const num = Number(changeCents);
    if (num > 0) return <TrendingUp className="w-4 h-4 text-green-500" />;
    if (num < 0) return <TrendingDown className="w-4 h-4 text-red-500" />;
    return <Minus className="w-4 h-4 text-muted-foreground" />;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ArrowRightLeft className="w-5 h-5" />
          Year-on-Year Comparison
        </CardTitle>
        <CardDescription>
          Compare tax calculations across financial years
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={yearA} onValueChange={setYearA}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TAX_YEAR_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground">vs</span>
          <Select value={yearB} onValueChange={setYearB}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TAX_YEAR_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={compare} disabled={loading || yearA === yearB}>
            {loading ? 'Comparing...' : 'Compare'}
          </Button>
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {loading && (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        )}

        {comparison && !loading && (
          <div className="space-y-4">
            {/* Summary row */}
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">Income Change</p>
                  <p className="text-lg font-bold flex items-center gap-1">
                    {changeIcon(comparison.incomeChangeCents)}
                    {formatCents(comparison.incomeChangeCents)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">Deduction Change</p>
                  <p className="text-lg font-bold flex items-center gap-1">
                    {changeIcon(comparison.deductionChangeCents)}
                    {formatCents(comparison.deductionChangeCents)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">Tax Change</p>
                  <p className="text-lg font-bold flex items-center gap-1">
                    {changeIcon(comparison.taxChangeCents)}
                    {formatCents(comparison.taxChangeCents)}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Category deltas table */}
            {comparison.categoryDeltas.length > 0 && (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">{comparison.yearA}</TableHead>
                      <TableHead className="text-right">{comparison.yearB}</TableHead>
                      <TableHead className="text-right">Change</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comparison.categoryDeltas.map((delta, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {getCategoryLabel(delta.category)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCents(delta.yearACents)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCents(delta.yearBCents)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {changeIcon(delta.changeCents)}
                            <span>{formatCents(delta.changeCents)}</span>
                            {delta.changePercent !== 0 && (
                              <span className="text-xs text-muted-foreground">
                                ({delta.changePercent > 0 ? '+' : ''}{delta.changePercent.toFixed(0)}%)
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
