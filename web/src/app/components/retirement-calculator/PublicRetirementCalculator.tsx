'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import CalculatorHandoffCta from '../calculator-handoff/CalculatorHandoffCta';
import { CountUp } from '@/components/gamma/CountUp';
import { SegmentedMeter } from '@/components/gamma/SegmentedMeter';
import { CalcField, CalcLayout, CalcPanel, ResultStat } from '@/app/components/calculator-ui';
import { projectSuper } from '@/app/components/super-calculator/projection';

const EXAMPLE = {
  age: '35',
  retireAge: '67',
  balance: '120000',
  contributions: '14400',
  otherSavings: '40000',
  realReturn: '5',
};

const money = (n: number) =>
  n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });

// ASFA Retirement Standard, June quarter 2026 (annual, per household, homeowners).
const ASFA_TARGETS = {
  modest: { single: 36_548, couple: 52_690 },
  comfortable: { single: 56_166, couple: 78_998 },
} as const;

// Age Pension, max rate incl. supplements (20 Mar 2026), + asset-test bands
// last published 20 Sep 2025.
const PENSION = {
  single: 31_223,
  couple: 47_070,
} as const;
const ASSET_TEST = {
  homeowner: { single: { free: 321_500, cutoff: 714_500 }, couple: { free: 481_500, cutoff: 1_074_000 } },
  nonHomeowner: { single: { free: 579_500, cutoff: 972_500 }, couple: { free: 739_500, cutoff: 1_332_000 } },
} as const;
// Taper: pension falls $3/fortnight per $1,000 over the free area (both statuses).

function estimatedPension(assessableAssets: number, couple: boolean, homeowner: boolean): number {
  const band = ASSET_TEST[homeowner ? 'homeowner' : 'nonHomeowner'][couple ? 'couple' : 'single'];
  const maxPension = couple ? PENSION.couple : PENSION.single;
  if (assessableAssets >= band.cutoff) return 0;
  if (assessableAssets <= band.free) return maxPension;
  const over = assessableAssets - band.free;
  const reductionPerYear = (over / 1_000) * 3 * 26; // $3/fortnight per $1,000
  return Math.max(0, maxPension - reductionPerYear);
}

// Level drawdown (real dollars) that depletes capital by `years` at real return r%.
function sustainableDraw(balance: number, realReturnPct: number, years: number): number {
  if (balance <= 0 || years <= 0) return 0;
  const r = realReturnPct / 100;
  if (Math.abs(r) < 1e-9) return balance / years;
  return balance * (r / (1 - Math.pow(1 + r, -years)));
}

type TargetKey = keyof typeof ASFA_TARGETS;

export default function PublicRetirementCalculator() {
  const id = React.useId();
  const [values, setValues] = React.useState(EXAMPLE);
  const [couple, setCouple] = React.useState(false);
  const [homeowner, setHomeowner] = React.useState(true);
  const [target, setTarget] = React.useState<TargetKey>('comfortable');

  const update = (key: keyof typeof EXAMPLE) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((p) => ({ ...p, [key]: e.target.value }));

  const result = React.useMemo(() => {
    const num = (k: keyof typeof EXAMPLE) => (values[k].trim() === '' ? NaN : Number(values[k]));
    const age = num('age');
    const retireAge = num('retireAge');
    const balance = num('balance');
    const contributions = num('contributions');
    const otherSavings = num('otherSavings');
    const realReturn = num('realReturn');

    if (!Number.isFinite(age) || age < 18 || age > 75)
      return { valid: false as const, error: 'Enter your age between 18 and 75.' };
    if (!Number.isFinite(retireAge) || retireAge <= age || retireAge > 80)
      return { valid: false as const, error: 'Retirement age must be above your age, up to 80.' };
    if (!Number.isFinite(balance) || balance < 0)
      return { valid: false as const, error: 'Enter a super balance of $0 or more.' };
    if (!Number.isFinite(contributions) || contributions < 0)
      return { valid: false as const, error: 'Enter annual contributions of $0 or more.' };
    if (!Number.isFinite(otherSavings) || otherSavings < 0)
      return { valid: false as const, error: 'Enter other savings of $0 or more.' };
    if (!Number.isFinite(realReturn) || realReturn < -5 || realReturn > 12)
      return { valid: false as const, error: 'Enter a real return between −5% and 12%.' };

    const years = retireAge - age;
    const horizonYears = 90 - retireAge; // draw down to age 90

    const rows = projectSuper({
      startingBalance: balance,
      annualContribution: contributions,
      annualReturnPercent: realReturn,
      years,
    });
    const projectedSuper = rows[rows.length - 1].balance;

    // Other savings grow at the same real rate, no additional contributions.
    const projectedOther = otherSavings * Math.pow(1 + realReturn / 100, years);
    const nestEgg = projectedSuper + projectedOther;

    const draw = sustainableDraw(nestEgg, realReturn, horizonYears);
    const pension = estimatedPension(nestEgg, couple, homeowner);
    const annualIncome = draw + pension;
    const targetIncome = ASFA_TARGETS[target][couple ? 'couple' : 'single'];
    const fundedPct = targetIncome > 0 ? (annualIncome / targetIncome) * 100 : 0;

    return {
      valid: true as const,
      years,
      projectedSuper,
      projectedOther,
      nestEgg,
      draw,
      pension,
      annualIncome,
      targetIncome,
      fundedPct,
      gap: annualIncome - targetIncome,
    };
  }, [values, couple, homeowner, target]);

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-5 text-left">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={`${id}-title`} className="text-2xl font-semibold tracking-tight">
            Interactive retirement readiness calculator
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Project your super, add an Age Pension estimate, and compare against the ASFA
            Retirement Standard — all in today&rsquo;s dollars.
          </p>
        </div>
        <Button variant="outline" onClick={() => setValues({ ...EXAMPLE })}>
          Reset example
        </Button>
      </div>

      <CalcLayout
        inputs={
          <CalcPanel title="Your position">
            <div className="grid grid-cols-2 gap-3">
              <CalcField id={`${id}-age`} label="Your age" min={18} max={75} value={values.age} onChange={update('age')} />
              <CalcField id={`${id}-retire`} label="Retire at" min={55} max={80} value={values.retireAge} onChange={update('retireAge')} hint="67 is pension age for most." />
            </div>
            <CalcField
              id={`${id}-balance`}
              label="Super balance today (AUD)"
              min={0}
              step="5000"
              value={values.balance}
              onChange={update('balance')}
            />
            <CalcField
              id={`${id}-contrib`}
              label="Annual contributions (AUD)"
              min={0}
              step="500"
              value={values.contributions}
              onChange={update('contributions')}
              hint="Employer SG + your own, after the 15% contributions tax."
            />
            <CalcField
              id={`${id}-other`}
              label="Other savings outside super (AUD)"
              min={0}
              step="5000"
              value={values.otherSavings}
              onChange={update('otherSavings')}
              hint="Investments you could draw on in retirement."
            />
            <CalcField
              id={`${id}-return`}
              label="Real return (% p.a., after inflation)"
              step="0.5"
              value={values.realReturn}
              onChange={update('realReturn')}
              hint="5% keeps everything in today's dollars."
            />
            <div className="space-y-2.5 pt-1">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={couple} onCheckedChange={(v) => setCouple(v === true)} />
                Couple (combined household)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={homeowner} onCheckedChange={(v) => setHomeowner(v === true)} />
                Own your home at retirement
              </label>
              <div className="space-y-1.5">
                <label htmlFor={`${id}-target`} className="text-sm font-medium">
                  ASFA lifestyle target
                </label>
                <Select value={target} onValueChange={(v) => setTarget(v as TargetKey)}>
                  <SelectTrigger id={`${id}-target`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="modest">Modest — above the pension, some extras</SelectItem>
                    <SelectItem value="comfortable">Comfortable — holidays, good cover, leisure</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CalcPanel>
        }
        results={
          result.valid ? (
            <>
              <div className="rounded-xl border border-primary/40 bg-primary/5 p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Estimated annual income in retirement{couple ? ' (household)' : ''}
                </p>
                <p className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
                  <span data-testid="retire-income">
                    <CountUp to={result.annualIncome} prefix="$" separator="," duration={1.2} trigger="view" />
                  </span>
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  vs ASFA {target} target of {money(result.targetIncome)} —{' '}
                  {result.gap >= 0
                    ? `${money(result.gap)} ahead`
                    : `${money(-result.gap)} short`}
                </p>
              </div>

              <SegmentedMeter
                label={`Funded against the ${target} standard`}
                description="Estimated retirement income as a share of the ASFA target"
                value={result.fundedPct}
                min={0}
                max={150}
                low={70}
                high={100}
                optimum={100}
                segments={15}
                formatValue={(v) => `${Math.round(v)}%`}
              />

              <div className="grid gap-3 sm:grid-cols-3">
                <ResultStat
                  label="Projected nest egg at 67"
                  value={money(result.nestEgg)}
                  sub={`${money(result.projectedSuper)} super + ${money(result.projectedOther)} other`}
                  testId="retire-nest-egg"
                />
                <ResultStat
                  label="Sustainable draw to 90"
                  value={`${money(result.draw)}/yr`}
                  sub="Level real drawdown of the nest egg"
                  testId="retire-draw"
                />
                <ResultStat
                  label="Age Pension estimate"
                  value={`${money(result.pension)}/yr`}
                  sub="Assets test only — income test may differ"
                  testId="retire-pension"
                />
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Reading the number</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Below ~70% funded usually means lifting contributions or pushing the date out.
                  Between 70% and 100% the gap is closeable with salary sacrifice or a later
                  retirement. Above 100% the plan clears the {target} standard — check the
                  comfortable column anyway. Estimates only: markets, rules and the income test
                  all move the real outcome.
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-10">
                <p role="status" className="font-medium text-destructive">{result.error}</p>
              </CardContent>
            </Card>
          )
        }
      />

      <p className="text-xs text-muted-foreground">
        Illustrative model in today&rsquo;s dollars using a constant real return. Pension estimate
        applies the assets test at projected wealth (rates from 20 Sep 2025); the income test,
        deeming, transition-to-retirement, and drawdown-sequencing are not modelled. ASFA
        Retirement Standard figures are the June quarter 2026 release. General information —
        not personal financial advice.
      </p>

      {result.valid && (
        <CalculatorHandoffCta
          tool="retirement"
          title="Retirement Readiness"
          summary={`Projected ${money(result.nestEgg)} at 67 → ~${money(result.annualIncome)}/yr vs ${money(result.targetIncome)} target`}
          metrics={[
            { label: 'Nest egg', value: money(result.nestEgg) },
            { label: 'Est. income', value: `${money(result.annualIncome)}/yr` },
            { label: 'Funded', value: `${Math.round(result.fundedPct)}%` },
          ]}
          fields={{
            superBalance: Number(values.balance),
            annualContributions: Number(values.contributions),
            yearsToRetirement: result.years,
          }}
          targetPath="/personal/goals/"
          label="Turn this into a plan"
        />
      )}
    </section>
  );
}
