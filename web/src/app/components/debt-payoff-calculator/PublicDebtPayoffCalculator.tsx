'use client';

import { useId, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import CalculatorHandoffCta from '../calculator-handoff/CalculatorHandoffCta';

const MAX_MONTHS = 600; // 50-year sanity cap

interface DebtRow {
  name: string;
  balance: string;
  ratePercent: string;
  minPayment: string;
}

const EXAMPLE_DEBTS: DebtRow[] = [
  { name: 'Credit card', balance: '6500', ratePercent: '20.99', minPayment: '150' },
  { name: 'Personal loan', balance: '12000', ratePercent: '9.5', minPayment: '280' },
  { name: 'Car loan', balance: '22000', ratePercent: '6.9', minPayment: '430' },
];
const EXAMPLE_EXTRA = '400';

const money = (value: number) =>
  new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(value);

interface Simulation {
  months: number;
  totalInterest: number;
  order: string[];
  never: boolean;
}

function simulate(debts: { name: string; balance: number; rate: number; min: number }[], extra: number, byRate: boolean): Simulation {
  const ordered = [...debts]
    .filter((d) => d.balance > 0)
    .sort(byRate ? (a, b) => b.rate - a.rate : (a, b) => a.balance - b.balance);
  const order = ordered.map((d) => d.name);
  const balances = ordered.map((d) => d.balance);
  const totalMin = ordered.reduce((s, d) => s + d.min, 0);

  if (totalMin + extra <= 0) return { months: 0, totalInterest: 0, order, never: true };

  let months = 0;
  let totalInterest = 0;
  while (balances.some((b) => b > 0.005) && months < MAX_MONTHS) {
    months += 1;
    let spare = extra;
    // Interest accrues, then each debt gets its minimum first.
    for (let i = 0; i < ordered.length; i++) {
      if (balances[i] <= 0) continue;
      const interest = balances[i] * (ordered[i].rate / 100 / 12);
      totalInterest += interest;
      balances[i] += interest;
      const minPay = Math.min(ordered[i].min, balances[i]);
      if (minPay > ordered[i].min - 0.001 && balances[i] - minPay <= 0) {
        // final payment on this debt frees its minimum
        spare += ordered[i].min - minPay;
      }
      balances[i] -= minPay;
    }
    // Snowball/avalanche target: first unpaid debt in priority order.
    for (let i = 0; i < ordered.length && spare > 0; i++) {
      if (balances[i] <= 0) continue;
      const pay = Math.min(spare, balances[i]);
      balances[i] -= pay;
      spare -= pay;
    }
    if (months === 1 && ordered.length > 0) {
      const firstMonthInterest = ordered.reduce((s, d) => s + d.balance * (d.rate / 100 / 12), 0);
      if (totalMin + extra < firstMonthInterest) return { months, totalInterest, order, never: true };
    }
  }
  return { months, totalInterest, order, never: months >= MAX_MONTHS };
}

export default function PublicDebtPayoffCalculator() {
  const id = useId();
  const [debts, setDebts] = useState<DebtRow[]>(EXAMPLE_DEBTS);
  const [extraPayment, setExtraPayment] = useState(EXAMPLE_EXTRA);

  const calculation = useMemo(() => {
    const parsed = debts.map((d, i) => {
      const balance = Number(d.balance);
      const rate = Number(d.ratePercent);
      const min = Number(d.minPayment);
      if (!Number.isFinite(balance) || balance < 0 || balance > 10_000_000) {
        return { error: `Debt ${i + 1}: enter a balance between $0 and $10,000,000.` };
      }
      if (!Number.isFinite(rate) || rate < 0 || rate > 60) {
        return { error: `Debt ${i + 1}: enter an interest rate between 0% and 60%.` };
      }
      if (!Number.isFinite(min) || min < 0 || min > 100_000) {
        return { error: `Debt ${i + 1}: enter a minimum repayment between $0 and $100,000.` };
      }
      return { name: d.name.trim() || `Debt ${i + 1}`, balance, rate, min };
    });
    const firstError = parsed.find((p) => 'error' in p);
    if (firstError && 'error' in firstError) {
      return { valid: false as const, error: firstError.error };
    }
    const extra = extraPayment.trim() === '' ? 0 : Number(extraPayment);
    if (!Number.isFinite(extra) || extra < 0 || extra > 100_000) {
      return { valid: false as const, error: 'Enter an extra repayment between $0 and $100,000.' };
    }
    const clean = parsed as { name: string; balance: number; rate: number; min: number }[];
    if (!clean.some((d) => d.balance > 0)) {
      return { valid: false as const, error: 'Add at least one debt with a balance above $0.' };
    }

    const avalanche = simulate(clean, extra, true);
    const snowball = simulate(clean, extra, false);
    const baseline = simulate(clean, 0, true); // minimums only
    const interestSaved = baseline.totalInterest - avalanche.totalInterest;
    const winner = avalanche.totalInterest <= snowball.totalInterest ? 'avalanche' : 'snowball';
    const monthsSaved = baseline.months - Math.min(avalanche.months, snowball.months);

    return {
      valid: true as const,
      avalanche,
      snowball,
      baseline,
      interestSaved,
      monthsSaved,
      winner,
      totalDebt: clean.reduce((s, d) => s + d.balance, 0),
      extra,
    };
  }, [debts, extraPayment]);

  const updateDebt = (i: number, key: keyof DebtRow) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDebts((p) => p.map((d, j) => (j === i ? { ...d, [key]: e.target.value } : d)));

  const fmtMonths = (months: number, never: boolean) => {
    if (never) return '50+ yrs';
    const y = Math.floor(months / 12);
    const m = months % 12;
    return y > 0 ? `${y}y ${m}m` : `${m}m`;
  };

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-5 text-left">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={`${id}-title`} className="text-2xl font-semibold tracking-tight">
            Interactive debt payoff calculator
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Compare the avalanche and snowball strategies on your debts. Add an extra repayment and
            see the payoff date and total interest for each approach.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setDebts(EXAMPLE_DEBTS.map((d) => ({ ...d })));
            setExtraPayment(EXAMPLE_EXTRA);
          }}
        >
          Reset example
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(320px,1fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Your debts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {debts.map((d, i) => (
              <div key={i} className="space-y-2 rounded-lg border p-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`${id}-n${i}`}>Name</Label>
                  <Input id={`${id}-n${i}`} value={d.name} onChange={updateDebt(i, 'name')} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={`${id}-b${i}`}>Balance $</Label>
                    <Input id={`${id}-b${i}`} type="number" min={0} value={d.balance} onChange={updateDebt(i, 'balance')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`${id}-r${i}`}>Rate %</Label>
                    <Input id={`${id}-r${i}`} type="number" min={0} step="0.01" value={d.ratePercent} onChange={updateDebt(i, 'ratePercent')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`${id}-m${i}`}>Min $/mo</Label>
                    <Input id={`${id}-m${i}`} type="number" min={0} value={d.minPayment} onChange={updateDebt(i, 'minPayment')} />
                  </div>
                </div>
              </div>
            ))}
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-extra`}>Extra repayment ($/mo)</Label>
              <Input id={`${id}-extra`} type="number" min={0} step="50" value={extraPayment} onChange={(e) => setExtraPayment(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                On top of minimums — rolled onto whichever debt the strategy targets first.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-5">
          {calculation.valid ? (
            <>
              <Card className="border-primary/40 bg-primary/5">
                <CardContent className="pt-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge variant="default">
                      {calculation.winner === 'avalanche' ? 'Avalanche wins on interest' : 'Snowball wins on interest'}
                    </Badge>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {money(calculation.totalDebt)} total debt
                    </span>
                  </div>
                  <p
                    data-testid="debt-payoff-date"
                    className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl"
                  >
                    Debt-free in {fmtMonths(Math.min(calculation.avalanche.months, calculation.snowball.months), false)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    With {money(calculation.extra)}/mo extra — saving{' '}
                    <strong className="text-foreground tabular-nums">{money(calculation.interestSaved)}</strong>{' '}
                    interest and {fmtMonths(calculation.monthsSaved, false)} vs minimums only.
                  </p>
                </CardContent>
              </Card>

              <div className="grid gap-4 sm:grid-cols-2">
                {(
                  [
                    { key: 'avalanche', label: 'Avalanche (highest rate first)', sim: calculation.avalanche },
                    { key: 'snowball', label: 'Snowball (smallest balance first)', sim: calculation.snowball },
                  ] as const
                ).map(({ key, label, sim }) => (
                  <Card key={key} className={calculation.winner === key ? 'border-primary/50' : ''}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{label}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <p className="text-3xl font-bold tabular-nums" data-testid={`debt-${key}-interest`}>
                        {money(sim.totalInterest)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        interest · payoff {fmtMonths(sim.months, sim.never)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Order: {sim.order.join(' → ')}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Minimums only</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Paying just the minimums takes{' '}
                  <strong className="text-foreground">{fmtMonths(calculation.baseline.months, calculation.baseline.never)}</strong>{' '}
                  and costs{' '}
                  <strong className="text-foreground">{money(calculation.baseline.totalInterest)}</strong>{' '}
                  in interest. The avalanche always costs the least interest; the snowball clears an
                  account sooner, which many households find easier to stick with.
                </CardContent>
              </Card>

              <div className="flex flex-wrap items-center gap-3">
                <CalculatorHandoffCta
                  tool="debt-payoff"
                  title="Debt Payoff Calculator"
                  summary={`${money(calculation.totalDebt)} across ${debts.length} debts — ${calculation.winner} clears in ${fmtMonths(Math.min(calculation.avalanche.months, calculation.snowball.months), false)}, saving ${money(calculation.interestSaved)} interest`}
                  metrics={[
                    { label: 'Total debt', value: money(calculation.totalDebt) },
                    { label: 'Extra repayment', value: `${money(calculation.extra)}/mo` },
                    { label: 'Avalanche interest', value: money(calculation.avalanche.totalInterest) },
                    { label: 'Snowball interest', value: money(calculation.snowball.totalInterest) },
                  ]}
                  fields={{
                    totalDebt: calculation.totalDebt,
                    extraMonthly: calculation.extra,
                    avalancheMonths: calculation.avalanche.months,
                    snowballMonths: calculation.snowball.months,
                    avalancheInterest: Math.round(calculation.avalanche.totalInterest),
                    snowballInterest: Math.round(calculation.snowball.totalInterest),
                  }}
                  targetPath="/personal/goals/"
                  label="Create a debt-free goal in PFinance"
                />
                <p className="text-xs text-muted-foreground">
                  Estimate only — assumes fixed rates and monthly compounding.
                </p>
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="py-10">
                <p role="status" className="font-medium text-destructive">
                  {calculation.error}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </section>
  );
}
