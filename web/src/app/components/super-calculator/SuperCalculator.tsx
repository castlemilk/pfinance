'use client';

import { useId, useMemo, useState } from 'react';
import { AreaClosed, LinePath } from '@visx/shape';
import { scaleLinear } from '@visx/scale';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { ParentSize } from '@visx/responsive';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import CalculatorHandoffCta from '../calculator-handoff/CalculatorHandoffCta';
import { projectSuper, validateSuperAssumptions, type SuperAssumptions, type SuperProjectionYear } from './projection';

const EXAMPLE = { startingBalance: '100000', annualContribution: '12000', annualReturnPercent: '6', years: '25' };
const money = (value: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(value);
const fields: { key: keyof SuperAssumptions; label: string; hint: string; step: string }[] = [
  { key: 'startingBalance', label: 'Starting super balance (AUD)', hint: 'Your current balance, before future contributions.', step: '0.01' },
  { key: 'annualContribution', label: 'Average annual contributions (AUD)', hint: 'The net amount credited to your super each year, after any contribution tax.', step: '0.01' },
  { key: 'annualReturnPercent', label: 'Assumed annual return (%)', hint: 'Use a net return after investment tax, fees and insurance. Negative returns are supported.', step: '0.1' },
  { key: 'years', label: 'Years to project', hint: 'Choose a whole number from 0 to 80.', step: '1' },
];

function ProjectionChart({ rows, width }: { rows: SuperProjectionYear[]; width: number }) {
  const gradient = useId().replaceAll(':', '');
  const height = 280;
  const margin = { left: 64, right: 20, top: 20, bottom: 42 };
  const x = scaleLinear({ domain: [0, Math.max(1, rows.length - 1)], range: [margin.left, width - margin.right] });
  const y = scaleLinear({ domain: [0, Math.max(1, ...rows.flatMap(row => [row.balance, row.contributedCapital]))], range: [height - margin.bottom, margin.top], nice: true });
  return <svg width={width} height={height} role="img" aria-label="Projected super balance compared with starting balance plus contributions. Exact values are in the year-by-year table.">
    <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity={0.25} /><stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} /></linearGradient></defs>
    <AreaClosed data={rows} x={row => x(row.year)} y={row => y(row.balance)} yScale={y} fill={`url(#${gradient})`} />
    <LinePath data={rows} x={row => x(row.year)} y={row => y(row.contributedCapital)} stroke="var(--muted-foreground)" strokeWidth={2} strokeDasharray="5 5" />
    <LinePath data={rows} x={row => x(row.year)} y={row => y(row.balance)} stroke="var(--primary)" strokeWidth={3} />
    {rows.length === 1 && <circle cx={x(0)} cy={y(rows[0].balance)} r={4} fill="var(--primary)" />}
    <AxisBottom top={height - margin.bottom} scale={x} tickValues={rows.length === 1 ? [0] : undefined} numTicks={Math.min(5, Math.max(1, rows.length - 1))} tickFormat={value => `${value}`} label="Years from now" stroke="var(--border)" tickStroke="var(--border)" tickLabelProps={() => ({ fill: 'var(--muted-foreground)', fontSize: 12, textAnchor: 'middle' })} labelProps={{ fill: 'var(--foreground)', fontSize: 12, textAnchor: 'middle' }} />
    <AxisLeft left={margin.left} scale={y} numTicks={4} tickFormat={value => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', notation: 'compact', maximumFractionDigits: 1 }).format(Number(value))} stroke="var(--border)" tickStroke="var(--border)" tickLabelProps={() => ({ fill: 'var(--muted-foreground)', fontSize: 12, textAnchor: 'end', dy: '0.3em' })} />
  </svg>;
}

export default function SuperCalculator() {
  const id = useId();
  const [values, setValues] = useState(EXAMPLE);
  const calculation = useMemo(() => {
    const assumptions = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim() === '' ? NaN : Number(value)])) as unknown as SuperAssumptions;
    const errors = validateSuperAssumptions(assumptions);
    if (Object.keys(errors).length) return { assumptions, errors, rows: null, message: '' };
    try { return { assumptions, errors, rows: projectSuper(assumptions), message: '' }; }
    catch (error) { return { assumptions, errors, rows: null, message: error instanceof Error ? error.message : 'Check the projection inputs.' }; }
  }, [values]);
  const { rows, errors, assumptions } = calculation;
  const end = rows?.[rows.length - 1];

  return <section aria-labelledby={`${id}-title`} className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 id={`${id}-title`} className="text-2xl font-semibold tracking-tight">Super growth calculator</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Explore how your balance, contributions and an assumed return could add up over time.</p></div>
      <Button variant="outline" onClick={() => setValues({ ...EXAMPLE })}>Reset example</Button>
    </div>
    <div className="grid gap-5 lg:grid-cols-[minmax(260px,1fr)_minmax(0,2fr)]">
      <Card><CardHeader><CardTitle className="text-lg">Your assumptions</CardTitle></CardHeader><CardContent className="space-y-5">
        {fields.map(field => <div key={field.key} className="space-y-2">
          <Label htmlFor={`${id}-${field.key}`}>{field.label}</Label>
          <Input id={`${id}-${field.key}`} type="number" inputMode={field.key === 'years' ? 'numeric' : 'decimal'} step={field.step} min={field.key === 'annualReturnPercent' ? -100 : 0} max={field.key === 'years' ? 80 : field.key === 'annualReturnPercent' ? 100 : 1_000_000_000} value={values[field.key]} aria-invalid={Boolean(errors[field.key])} aria-describedby={`${id}-${field.key}-hint`} onChange={event => setValues(previous => ({ ...previous, [field.key]: event.target.value }))} className="min-h-11" />
          <p id={`${id}-${field.key}-hint`} className={`text-sm ${errors[field.key] ? 'text-destructive' : 'text-muted-foreground'}`}>{errors[field.key] || field.hint}</p>
        </div>)}
        <p className="border-t pt-4 text-sm text-muted-foreground">The starting values are an editable example, not a suggested contribution or return.</p>
      </CardContent></Card>
      <div className="min-w-0 space-y-5">
        {end && rows ? <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="sm:col-span-3 border-primary/30"><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Illustrative balance after {assumptions.years} {assumptions.years === 1 ? 'year' : 'years'}</p><p data-testid="super-projected-balance" className="mt-2 break-words text-3xl font-semibold tabular-nums sm:text-4xl">{money(end.balance)}</p><p className="mt-2 text-sm text-muted-foreground">Future dollars, before any adjustment for inflation.</p></CardContent></Card>
            {[
              ['Starting balance', money(rows[0].balance)],
              ['Future contributions', money(end.totalContributions)],
              [end.totalGrowth < 0 ? 'Investment loss' : 'Investment growth', money(end.totalGrowth)],
            ].map(([label, value]) => <Card key={label}><CardContent className="pt-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 break-words text-xl font-semibold tabular-nums">{value}</p></CardContent></Card>)}
          </div>
          <Card><CardHeader><CardTitle className="text-lg">Your projected path</CardTitle></CardHeader><CardContent>
            <figure><div className="h-[280px] min-w-0"><ParentSize>{({ width }) => width > 0 ? <ProjectionChart rows={rows} width={width} /> : null}</ParentSize></div>
              <figcaption className="flex flex-wrap gap-x-5 gap-y-2 text-sm"><span><span aria-hidden="true" className="mr-2 inline-block h-0.5 w-5 bg-primary align-middle" />Projected balance</span><span><span aria-hidden="true" className="mr-2 inline-block w-5 border-t-2 border-dashed border-muted-foreground align-middle" />Starting balance + contributions</span></figcaption>
            </figure>
          </CardContent></Card>
          <div className="flex flex-wrap items-center gap-3">
            <CalculatorHandoffCta
              tool="super"
              title="Super Calculator"
              summary={`Projected ${money(end.balance)} in ${assumptions.years} yrs from ${money(assumptions.startingBalance)} + ${money(assumptions.annualContribution)}/yr at ${assumptions.annualReturnPercent}%`}
              metrics={[
                { label: 'Projected balance', value: money(end.balance) },
                { label: 'Contributions', value: money(end.totalContributions) },
                { label: 'Growth', value: money(end.totalGrowth) },
              ]}
              fields={{
                startingBalance: assumptions.startingBalance,
                annualContribution: assumptions.annualContribution,
                annualReturnPercent: assumptions.annualReturnPercent,
                years: assumptions.years,
                projectedBalance: Math.round(end.balance),
              }}
              targetPath="/personal/goals/"
              label="Set a super goal in PFinance"
            />
            <p className="text-xs text-muted-foreground">Carry the projection into a savings goal.</p>
          </div>
        </> : <Card><CardContent className="py-10"><p role="status">{calculation.message || 'Enter valid assumptions to see your projection.'}</p><p className="mt-2 text-sm text-muted-foreground">No previous result is shown while an input is invalid.</p></CardContent></Card>}
      </div>
    </div>
    <Card><CardContent className="space-y-3 pt-6 text-sm leading-relaxed"><h3 className="font-semibold">How this estimate works</h3><p>Returns compound once a year. Your annual contribution is added at the end of each year, so it starts earning returns in the following year. Contributions and the assumed return stay constant.</p><p>Enter contributions after any contribution tax, and a return after tax, fees and insurance. This simplified model does not calculate those costs, contribution caps, government benefits, withdrawals or inflation. Actual returns vary and can be negative; this is an illustration, not a forecast or personal financial advice.</p><p>Calculated locally in your browser; this tool does not save your inputs. For a broader model with additional assumptions, see the <a href="https://moneysmart.gov.au/how-super-works/superannuation-calculator" className="underline underline-offset-4">ASIC Moneysmart superannuation calculator</a>.</p></CardContent></Card>
    {rows && <details className="rounded-lg border bg-card p-4"><summary className="cursor-pointer py-1 font-medium">Year-by-year breakdown</summary><div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Super projection table">
      <table className="w-full min-w-[540px] text-right text-sm tabular-nums"><caption className="mb-3 text-left text-muted-foreground">Illustrative amounts in AUD, rounded to whole dollars for display. Year 0 is your starting position.</caption><thead><tr className="border-b"><th scope="col" className="p-3 text-left">Year</th><th scope="col" className="p-3">Opening balance</th><th scope="col" className="p-3">Contribution</th><th scope="col" className="p-3">Return</th><th scope="col" className="p-3">Closing balance</th></tr></thead><tbody>{rows.map(row => <tr key={row.year} className="border-b last:border-0"><th scope="row" className="p-3 text-left font-medium">{row.year}</th><td className="p-3">{money(row.openingBalance)}</td><td className="p-3">{money(row.contribution)}</td><td className="p-3">{money(row.investmentReturn)}</td><td className="p-3 font-medium">{money(row.balance)}</td></tr>)}</tbody></table>
    </div></details>}
  </section>;
}
