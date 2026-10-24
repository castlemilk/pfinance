'use client';

import { useId, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import CalculatorHandoffCta from '../calculator-handoff/CalculatorHandoffCta';

// Income-protection policies in Australia typically cap benefits at ~70% of
// pre-disability income (plus super contributions on some policies).
const IP_REPLACEMENT = 0.7;
const DEFAULT_REPLACEMENT_YEARS = 10;

const EXAMPLE = {
  annualIncome: '95000',
  replacementYears: String(DEFAULT_REPLACEMENT_YEARS),
  debts: '480000',
  futureCosts: '80000',
  liquidAssets: '45000',
  existingCover: '200000',
};

const money = (value: number) =>
  new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(value);

const num = (v: string) => (v.trim() === '' ? NaN : Number(v));

export default function PublicInsuranceNeedsCalculator() {
  const id = useId();
  const [values, setValues] = useState(EXAMPLE);

  const calculation = useMemo(() => {
    const annualIncome = num(values.annualIncome);
    const replacementYears = num(values.replacementYears);
    const debts = num(values.debts);
    const futureCosts = num(values.futureCosts);
    const liquidAssets = num(values.liquidAssets);
    const existingCover = num(values.existingCover);

    if (!Number.isFinite(annualIncome) || annualIncome < 0 || annualIncome > 5_000_000) {
      return { valid: false as const, error: 'Enter an annual income between $0 and $5,000,000.' };
    }
    if (!Number.isFinite(replacementYears) || replacementYears < 0 || replacementYears > 40) {
      return { valid: false as const, error: 'Enter replacement years between 0 and 40.' };
    }
    for (const [v, label] of [
      [debts, 'debts'],
      [futureCosts, 'future costs'],
      [liquidAssets, 'assets'],
      [existingCover, 'existing cover'],
    ] as const) {
      if (!Number.isFinite(v) || v < 0 || v > 50_000_000) {
        return { valid: false as const, error: `Enter ${label} between $0 and $50,000,000.` };
      }
    }

    // Needs analysis: the gap between what your family would need and what they
    // would already have if you died or couldn't work again.
    const incomeReplacement = annualIncome * replacementYears * IP_REPLACEMENT;
    const grossNeed = incomeReplacement + debts + futureCosts;
    const resources = liquidAssets + existingCover;
    const lifeGap = Math.max(0, grossNeed - resources);
    // TPD commonly includes a margin for medical and home-modification costs.
    const tpdGap = Math.max(0, grossNeed + annualIncome - resources);
    const ipMonthly = (annualIncome * IP_REPLACEMENT) / 12;

    return {
      valid: true as const,
      incomeReplacement,
      grossNeed,
      resources,
      lifeGap,
      tpdGap,
      ipMonthly,
    };
  }, [values]);

  const update = (key: keyof typeof EXAMPLE) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((p) => ({ ...p, [key]: e.target.value }));

  const field = (key: keyof typeof EXAMPLE, label: string, hint?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`${id}-${key}`}>{label}</Label>
      <Input id={`${id}-${key}`} type="number" min={0} value={values[key]} onChange={update(key)} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-5 text-left">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={`${id}-title`} className="text-2xl font-semibold tracking-tight">
            Interactive insurance needs calculator
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            The same needs-analysis method a planner uses: what your household would need if you
            couldn&apos;t earn, minus what it would already have.
          </p>
        </div>
        <Button variant="outline" onClick={() => setValues({ ...EXAMPLE })}>
          Reset example
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(320px,1fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Your household</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {field('annualIncome', 'Annual income (AUD)', 'Gross salary the household relies on.')}
            {field('replacementYears', 'Years of income to replace', 'Typically until kids are independent or the partner can retire.')}
            {field('debts', 'Debts to clear (mortgage + other)')}
            {field('futureCosts', 'Future costs (education, funeral, etc.)')}
            {field('liquidAssets', 'Savings, super & investments')}
            {field('existingCover', 'Existing life/TPD cover', 'Check your super statement — most funds include default cover.')}
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-5">
          {calculation.valid ? (
            <>
              <Card className="border-primary/40 bg-primary/5">
                <CardContent className="pt-6">
                  <Badge variant="default">Suggested life cover</Badge>
                  <p
                    data-testid="insurance-life-cover"
                    className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl"
                  >
                    {money(calculation.lifeGap)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Need {money(calculation.grossNeed)} — resources {money(calculation.resources)}
                  </p>
                </CardContent>
              </Card>

              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">TPD cover</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p className="text-3xl font-bold tabular-nums" data-testid="insurance-tpd-cover">
                      {money(calculation.tpdGap)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Same needs plus a margin for medical costs and home modification — usually set
                      alongside life cover.
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Income protection</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p className="text-3xl font-bold tabular-nums" data-testid="insurance-ip-benefit">
                      {money(calculation.ipMonthly)}/mo
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Policies typically replace up to 70% of income. Shorter benefit periods and
                      longer waiting periods cost less.
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Inside vs outside super</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Holding life and TPD cover inside super means premiums come out of your retirement
                  balance rather than take-home pay — convenient, but default cover is rarely enough
                  and policy definitions can be weaker than retail policies. Income protection held
                  outside super is generally tax-deductible. This estimate is a starting point for a
                  conversation, not advice — a licensed adviser can tailor cover to your situation.
                </CardContent>
              </Card>

              <div className="flex flex-wrap items-center gap-3">
                <CalculatorHandoffCta
                  tool="insurance-needs"
                  title="Insurance Needs Calculator"
                  summary={`Suggested cover — life ${money(calculation.lifeGap)}, TPD ${money(calculation.tpdGap)}, income protection ${money(calculation.ipMonthly)}/mo`}
                  metrics={[
                    { label: 'Life cover gap', value: money(calculation.lifeGap) },
                    { label: 'TPD gap', value: money(calculation.tpdGap) },
                    { label: 'IP benefit', value: `${money(calculation.ipMonthly)}/mo` },
                  ]}
                  fields={{
                    annualIncome: Number(values.annualIncome),
                    replacementYears: Number(values.replacementYears),
                    debts: Number(values.debts),
                    liquidAssets: Number(values.liquidAssets),
                    existingCover: Number(values.existingCover),
                    lifeCoverGap: Math.round(calculation.lifeGap),
                    tpdGap: Math.round(calculation.tpdGap),
                  }}
                  targetPath="/personal/goals/"
                  label="Save this cover target in PFinance"
                />
                <p className="text-xs text-muted-foreground">
                  General estimate only — not personal advice. Cover needs depend on health,
                  dependants, and existing policies.
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
