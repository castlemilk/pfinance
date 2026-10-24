'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { timestampDate } from '@bufbuild/protobuf/wkt';
import { Group } from '@visx/group';
import { ParentSize } from '@visx/responsive';
import { Pie } from '@visx/shape';
import { Plus, Scale, Trash2 } from 'lucide-react';
import { useAuth } from '../../../context/AuthWithAdminContext';
import { financeClient } from '@/lib/financeService';
import {
  AssetCategory,
  LiabilityCategory,
  type Asset,
  type Liability,
  type NetWorthSummary,
} from '@/gen/pfinance/v1/types_pb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { CountUp } from '@/components/gamma/CountUp';
import { SegmentedMeter } from '@/components/gamma/SegmentedMeter';

const cents = (n: bigint | number) => Number(n) / 100;
const money = (n: number) =>
  n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });

const ASSET_LABELS: Record<number, string> = {
  [AssetCategory.CASH]: 'Cash & savings',
  [AssetCategory.SUPER]: 'Super',
  [AssetCategory.PROPERTY]: 'Property',
  [AssetCategory.VEHICLE]: 'Vehicle',
  [AssetCategory.SHARES]: 'Shares & ETFs',
  [AssetCategory.CRYPTO]: 'Crypto',
  [AssetCategory.OTHER]: 'Other',
};

const LIABILITY_LABELS: Record<number, string> = {
  [LiabilityCategory.MORTGAGE]: 'Mortgage',
  [LiabilityCategory.HELP_DEBT]: 'HECS-HELP',
  [LiabilityCategory.CAR_LOAN]: 'Car loan',
  [LiabilityCategory.PERSONAL_LOAN]: 'Personal loan',
  [LiabilityCategory.CREDIT_CARD]: 'Credit card',
  [LiabilityCategory.BNPL]: 'Buy now pay later',
  [LiabilityCategory.OTHER]: 'Other',
};

const DONUT_COLORS = ['#8a5a44', '#c2703f', '#5d7a66', '#b08d57', '#6b4f3f', '#a4572e', '#94806b'];

function categoryLabel(enumName: string, labels: Record<number, string>): string {
  const m = enumName.match(/_(CASH|SUPER|PROPERTY|VEHICLE|SHARES|CRYPTO|MORTGAGE|HELP_DEBT|CAR_LOAN|PERSONAL_LOAN|CREDIT_CARD|BNPL|OTHER)$/);
  if (!m) return 'Other';
  const key = {
    CASH: AssetCategory.CASH,
    SUPER: AssetCategory.SUPER,
    PROPERTY: AssetCategory.PROPERTY,
    VEHICLE: AssetCategory.VEHICLE,
    SHARES: AssetCategory.SHARES,
    CRYPTO: AssetCategory.CRYPTO,
    MORTGAGE: LiabilityCategory.MORTGAGE,
    HELP_DEBT: LiabilityCategory.HELP_DEBT,
    CAR_LOAN: LiabilityCategory.CAR_LOAN,
    PERSONAL_LOAN: LiabilityCategory.PERSONAL_LOAN,
    CREDIT_CARD: LiabilityCategory.CREDIT_CARD,
    BNPL: LiabilityCategory.BNPL,
    OTHER: 0,
  }[m[1]];
  return labels[key ?? -1] ?? 'Other';
}

export default function NetWorthPage() {
  const { user } = useAuth();
  const userId = user?.uid ?? '';

  const [assets, setAssets] = useState<Asset[]>([]);
  const [liabilities, setLiabilities] = useState<Liability[]>([]);
  const [summary, setSummary] = useState<NetWorthSummary | null>(null);
  const [monthlySpend, setMonthlySpend] = useState(0);
  const [monthlyIncome, setMonthlyIncome] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [assetOpen, setAssetOpen] = useState(false);
  const [liabilityOpen, setLiabilityOpen] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const since = new Date();
      since.setDate(since.getDate() - 90);
      const [a, l, s, expenses, incomes] = await Promise.all([
        financeClient.listAssets({ userId, pageSize: 200 }),
        financeClient.listLiabilities({ userId, pageSize: 200 }),
        financeClient.getNetWorthSummary({ userId }),
        financeClient.listExpenses({ userId, pageSize: 1000 }),
        financeClient.listIncomes({ userId, pageSize: 500 }),
      ]);
      setAssets(a.assets);
      setLiabilities(l.liabilities);
      setSummary(s.summary ?? null);

      const spend = expenses.expenses
        .filter((e) => (e.date ? timestampDate(e.date) >= since : false))
        .reduce((acc, e) => acc + cents(e.amountCents || 0), 0);
      setMonthlySpend(spend / 3);

      const earned = incomes.incomes
        .filter((i) => (i.date ? timestampDate(i.date) >= since : true))
        .reduce((acc, i) => acc + cents(i.amountCents || 0), 0);
      setMonthlyIncome(earned / 3);
    } catch (e) {
      console.error('Failed to load net worth:', e);
      setError('Could not load your net worth data.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const health = useMemo(() => {
    if (!summary) return null;
    const liquid = cents(summary.liquidAssetsCents);
    const totalDebt = cents(summary.totalLiabilitiesCents);
    const netWorth = cents(summary.netWorthCents);

    const savingsRate =
      monthlyIncome > 0 ? Math.max(0, (monthlyIncome - monthlySpend) / monthlyIncome) : null;
    const emergencyMonths = monthlySpend > 0 ? liquid / monthlySpend : null;
    const highInterestDebt = liabilities
      .filter((l) => l.interestRate >= 8)
      .reduce((acc, l) => acc + cents(l.balanceCents), 0);
    const debtShare = totalDebt > 0 ? highInterestDebt / totalDebt : 0;

    let score = 0;
    if (netWorth > 0) score += 20;
    if (savingsRate !== null) score += Math.min(savingsRate / 0.2, 1) * 35;
    if (emergencyMonths !== null) score += Math.min(emergencyMonths / 3, 1) * 25;
    score += (1 - Math.min(debtShare / 0.5, 1)) * 20;

    return {
      score: Math.round(score),
      savingsRate,
      emergencyMonths,
      highInterestDebt,
      netWorth,
    };
  }, [summary, monthlyIncome, monthlySpend, liabilities]);

  if (!userId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Net Worth</h1>
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Sign in to track your net worth.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Net Worth</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            What you own minus what you owe — the fact-find every plan starts from.
          </p>
        </div>
        <div className="flex gap-2">
          <EntryDialog
            kind="asset"
            open={assetOpen}
            onOpenChange={setAssetOpen}
            onSaved={load}
            userId={userId}
          />
          <EntryDialog
            kind="liability"
            open={liabilityOpen}
            onOpenChange={setLiabilityOpen}
            onSaved={load}
            userId={userId}
          />
        </div>
      </div>

      {error && (
        <p role="status" className="text-sm font-medium text-destructive">{error}</p>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : summary ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-primary/40 bg-primary/5 sm:col-span-2">
              <CardContent className="pt-6">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Net worth
                </p>
                <p className="mt-1 text-3xl font-bold tracking-tight" data-testid="net-worth-total">
                  <CountUp to={cents(summary.netWorthCents)} prefix="$" separator="," duration={1.2} trigger="view" />
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {assets.length} assets · {liabilities.length} liabilities
                </p>
              </CardContent>
            </Card>
            <SummaryStat label="Total assets" value={cents(summary.totalAssetsCents)} testId="total-assets" />
            <SummaryStat label="Total liabilities" value={cents(summary.totalLiabilitiesCents)} testId="total-liabilities" />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-base">Asset breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                {summary.assetsByCategory.length ? (
                  <>
                    <div className="h-44">
                      <ParentSize>
                        {({ width, height }) => {
                          const r = Math.min(width, height) / 2;
                          const cx = width / 2;
                          const cy = height / 2;
                          return (
                            <svg width={width} height={height} role="img" aria-label="Asset allocation chart">
                              <Group top={cy} left={cx}>
                                <Pie
                                  data={summary.assetsByCategory}
                                  pieValue={(d) => cents(d.totalCents)}
                                  outerRadius={r}
                                  innerRadius={r * 0.55}
                                  padAngle={0.02}
                                >
                                  {(pie) =>
                                    pie.arcs.map((arc, i) => (
                                      <path
                                        key={arc.data.category}
                                        d={pie.path(arc) ?? ''}
                                        fill={DONUT_COLORS[i % DONUT_COLORS.length]}
                                      />
                                    ))
                                  }
                                </Pie>
                                <text textAnchor="middle" dy="0.3em" fontSize={14} fontWeight={700} fill="var(--foreground)">
                                  {money(cents(summary.totalAssetsCents))}
                                </text>
                              </Group>
                            </svg>
                          );
                        }}
                      </ParentSize>
                    </div>
                    <ul className="mt-3 space-y-1.5 text-xs">
                      {summary.assetsByCategory.map((b, i) => (
                        <li key={b.category} className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-sm"
                              style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }}
                            />
                            {categoryLabel(b.category, ASSET_LABELS)}
                          </span>
                          <span className="tabular-nums font-medium">{money(cents(b.totalCents))}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Add an asset to see the breakdown.
                  </p>
                )}
              </CardContent>
            </Card>

            <div className="lg:col-span-2 space-y-4">
              <EntryList
                kind="asset"
                entries={assets}
                labels={ASSET_LABELS}
                onChanged={load}
                emptyText="No assets yet — cash, super, property, shares."
              />
              <EntryList
                kind="liability"
                entries={liabilities}
                labels={LIABILITY_LABELS}
                onChanged={load}
                emptyText="No liabilities yet — mortgage, HELP, cards, loans."
              />
            </div>
          </div>

          {health && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Scale className="h-4 w-4" /> Financial health score
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <SegmentedMeter
                  label={`Health score: ${health.score}/100`}
                  value={health.score}
                  min={0}
                  max={100}
                  low={40}
                  high={70}
                  optimum={100}
                  segments={20}
                  formatValue={(v) => `${Math.round(v)}/100`}
                />
                <div className="grid gap-3 sm:grid-cols-4 text-sm">
                  <ScoreHint
                    label="Savings rate"
                    value={health.savingsRate === null ? '—' : `${Math.round(health.savingsRate * 100)}%`}
                    hint="Target ≥20% of income"
                  />
                  <ScoreHint
                    label="Emergency coverage"
                    value={health.emergencyMonths === null ? '—' : `${health.emergencyMonths.toFixed(1)} months`}
                    hint="Liquid assets ÷ monthly spend; target ≥3"
                  />
                  <ScoreHint
                    label="High-interest debt"
                    value={health.highInterestDebt > 0 ? money(health.highInterestDebt) : 'None'}
                    hint="Balances at 8%+ drag the score"
                  />
                  <ScoreHint
                    label="Net worth"
                    value={money(health.netWorth)}
                    hint={health.netWorth > 0 ? 'Positive — good' : 'Negative — pay-down first'}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  A composite of savings rate (35pts), emergency coverage (25pts), high-interest debt
                  drag (20pts) and positive net worth (20pts). A guide, not a grade.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        !error && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Add your first asset or liability to see your position.
            </CardContent>
          </Card>
        )
      )}
    </div>
  );
}

function SummaryStat({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold tabular-nums" data-testid={testId}>{money(value)}</p>
      </CardContent>
    </Card>
  );
}

function ScoreHint({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-base font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function EntryList({
  kind,
  entries,
  labels,
  onChanged,
  emptyText,
}: {
  kind: 'asset' | 'liability';
  entries: (Asset | Liability)[];
  labels: Record<number, string>;
  onChanged: () => void;
  emptyText: string;
}) {
  const remove = async (id: string) => {
    if (kind === 'asset') {
      await financeClient.deleteAsset({ assetId: id });
    } else {
      await financeClient.deleteLiability({ liabilityId: id });
    }
    onChanged();
  };

  const title = kind === 'asset' ? 'Assets' : 'Liabilities';
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <ul className="divide-y">
            {entries.map((e) => {
              const value = kind === 'asset' ? cents((e as Asset).valueCents) : cents((e as Liability).balanceCents);
              return (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{e.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {labels[e.category] ?? 'Other'}
                      {kind === 'liability' && (e as Liability).interestRate > 0
                        ? ` · ${(e as Liability).interestRate}%`
                        : ''}
                      {kind === 'asset' && (e as Asset).isLiquid ? ' · liquid' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums">{money(value)}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${e.name}`}
                      onClick={() => remove(e.id)}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function EntryDialog({
  kind,
  open,
  onOpenChange,
  onSaved,
  userId,
}: {
  kind: 'asset' | 'liability';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  userId: string;
}) {
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [category, setCategory] = useState<string>(
    kind === 'asset' ? String(AssetCategory.CASH) : String(LiabilityCategory.MORTGAGE)
  );
  const [liquid, setLiquid] = useState(false);
  const [rate, setRate] = useState('');
  const [minRepay, setMinRepay] = useState('');
  const [saving, setSaving] = useState(false);

  const isAsset = kind === 'asset';
  const title = isAsset ? 'Add asset' : 'Add liability';
  const labels = isAsset ? ASSET_LABELS : LIABILITY_LABELS;

  const save = async () => {
    const centsValue = Math.round(parseFloat(value || '0') * 100);
    if (!name.trim() || centsValue < 0) return;
    setSaving(true);
    try {
      if (isAsset) {
        await financeClient.createAsset({
          userId,
          name: name.trim(),
          category: Number(category) as AssetCategory,
          valueCents: BigInt(centsValue),
          isLiquid: liquid,
        });
      } else {
        await financeClient.createLiability({
          userId,
          name: name.trim(),
          category: Number(category) as LiabilityCategory,
          balanceCents: BigInt(centsValue),
          interestRate: parseFloat(rate || '0'),
          minimumRepaymentCents: BigInt(Math.round(parseFloat(minRepay || '0') * 100)),
        });
      }
      onOpenChange(false);
      setName('');
      setValue('');
      setRate('');
      setMinRepay('');
      setLiquid(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant={isAsset ? 'default' : 'outline'} className="gap-2">
          <Plus className="h-4 w-4" /> {isAsset ? 'Asset' : 'Liability'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="nw-name">Name</Label>
            <Input id="nw-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={isAsset ? 'e.g. Emergency fund' : 'e.g. Home loan'} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="nw-value">{isAsset ? 'Value (AUD)' : 'Balance (AUD)'}</Label>
              <Input id="nw-value" type="number" min={0} step="100" value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nw-cat">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="nw-cat">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(labels).map(([k, l]) => (
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {isAsset ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={liquid} onCheckedChange={(v) => setLiquid(v === true)} />
              Reachable within ~30 days (counts toward emergency coverage)
            </label>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="nw-rate">Interest rate (% p.a.)</Label>
                <Input id="nw-rate" type="number" min={0} step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nw-min">Min repayment ($/mo)</Label>
                <Input id="nw-min" type="number" min={0} step="10" value={minRepay} onChange={(e) => setMinRepay(e.target.value)} />
              </div>
            </div>
          )}
          <Button className="w-full" onClick={save} disabled={saving || !name.trim() || !value}>
            {saving ? 'Saving…' : title}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
