'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { scaleLinear } from '@visx/scale';
import { LinePath } from '@visx/shape';
import { curveMonotoneX } from '@visx/curve';
import { AxisBottom, AxisLeft } from '@visx/axis';
import CalculatorHandoffCta from '../calculator-handoff/CalculatorHandoffCta';
import { CalcField, CalcLayout, CalcPanel, ResultStat } from '@/app/components/calculator-ui';
import { firstHomeDuty, standardDuty, type StateCode } from '@/lib/stamp-duty';

const EXAMPLE = {
  price: '750000', deposit: '150000', state: 'NSW', rate: '6.0', term: '30',
  rent: '650', rentGrowth: '4', propertyGrowth: '4.5', investReturn: '7',
  ownerCosts: '1.0', years: '10',
};

const STATES: StateCode[] = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'];
const money = (n: number) =>
  n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });

function annualPayment(loan: number, ratePct: number, years: number): number {
  if (loan <= 0) return 0;
  const r = ratePct / 100 / 12;
  const n = years * 12;
  if (Math.abs(r) < 1e-9) return loan / years;
  const m = (loan * r) / (1 - Math.pow(1 + r, -n));
  return m * 12;
}

export default function PublicRentVsBuy() {
  const id = React.useId();
  const [values, setValues] = React.useState(EXAMPLE);
  const [firstHome, setFirstHome] = React.useState(false);

  const update = (key: keyof typeof EXAMPLE) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((p) => ({ ...p, [key]: e.target.value }));

  const result = React.useMemo(() => {
    const num = (k: keyof typeof EXAMPLE) => (values[k].trim() === '' ? NaN : Number(values[k]));
    const [price, deposit, rate, term, rent, rentG, propG, invR, ownerPct, years] = [
      'price', 'deposit', 'rate', 'term', 'rent', 'rentGrowth', 'propertyGrowth', 'investReturn', 'ownerCosts', 'years',
    ].map((k) => num(k as keyof typeof EXAMPLE));

    if (!Number.isFinite(price) || price <= 0) return { valid: false as const, error: 'Enter a property price.' };
    if (!Number.isFinite(deposit) || deposit < 0 || deposit >= price) return { valid: false as const, error: 'Deposit must be less than the price.' };
    if (!Number.isFinite(rate) || rate < 0 || rate > 15) return { valid: false as const, error: 'Enter a mortgage rate between 0% and 15%.' };
    if (!Number.isFinite(term) || term < 5 || term > 40) return { valid: false as const, error: 'Loan term 5–40 years.' };
    if (!Number.isFinite(rent) || rent <= 0) return { valid: false as const, error: 'Enter the weekly rent for an equivalent home.' };
    if (!Number.isFinite(years) || years < 1 || years > 40 || !Number.isInteger(years)) return { valid: false as const, error: 'Comparison window 1–40 years.' };
    for (const [v, n] of [[rentG, 'rent growth'], [propG, 'property growth'], [invR, 'investment return'], [ownerPct, 'owner costs']] as const) {
      if (!Number.isFinite(v) || v < -10 || v > 20) return { valid: false as const, error: `Enter a ${n} between −10% and 20%.` };
    }

    const state = values.state as StateCode;
    const duty = firstHome ? firstHomeDuty(state, price, true).duty : standardDuty(state, price);
    const upfront = deposit + duty + 3_000; // + conveyancing/misc estimate

    const loan = price - deposit;
    const pay = annualPayment(loan, rate, term);
    const monthlyRate = rate / 100 / 12;

    // Year-by-year: buyer equity vs renter portfolio.
    const points: { year: number; buyer: number; renter: number }[] = [];
    let loanBal = loan;
    let portfolio = upfront; // renter invests the cash they didn't spend
    let propValue = price;
    let annualRent = rent * 52;
    let breakeven: number | null = null;

    for (let y = 0; y <= years; y++) {
      const buyerWealth = propValue - loanBal;
      const renterWealth = portfolio;
      if (breakeven === null && y > 0 && buyerWealth >= renterWealth) breakeven = y;
      points.push({ year: y, buyer: buyerWealth, renter: renterWealth });
      if (y === years) break;
      // Advance one year.
      for (let m = 0; m < 12; m++) {
        loanBal = Math.max(0, loanBal + loanBal * monthlyRate - pay / 12);
      }
      const ownerAnnual = propValue * (ownerPct / 100);
      const buyerOutgoings = pay + ownerAnnual;
      portfolio = portfolio * (1 + invR / 100) + (buyerOutgoings - annualRent);
      propValue *= 1 + propG / 100;
      annualRent *= 1 + rentG / 100;
    }

    const end = points[points.length - 1];
    const gap = end.buyer - end.renter;
    return { valid: true as const, points, breakeven, gap, duty, upfront, pay, endBuyer: end.buyer, endRenter: end.renter };
  }, [values, firstHome]);

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-5 text-left">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={`${id}-title`} className="text-2xl font-semibold tracking-tight">
            Interactive rent vs buy comparison
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Buyer equity vs the renter&rsquo;s investment portfolio over your horizon — including
            stamp duty and the cash-flow difference the renter gets to invest.
          </p>
        </div>
        <Button variant="outline" onClick={() => setValues({ ...EXAMPLE })}>
          Reset example
        </Button>
      </div>

      <CalcLayout
        inputs={
          <CalcPanel title="The two scenarios">
            <div className="grid grid-cols-2 gap-3">
              <CalcField id={`${id}-price`} label="Property price (AUD)" min={0} step="10000" value={values.price} onChange={update('price')} />
              <CalcField id={`${id}-deposit`} label="Deposit (AUD)" min={0} step="5000" value={values.deposit} onChange={update('deposit')} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor={`${id}-state`} className="text-sm font-medium">State / territory</label>
                <Select value={values.state} onValueChange={(v) => setValues((p) => ({ ...p, state: v }))}>
                  <SelectTrigger id={`${id}-state`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <CalcField id={`${id}-rent`} label="Equivalent weekly rent (AUD)" min={0} step="10" value={values.rent} onChange={update('rent')} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <CalcField id={`${id}-rate`} label="Mortgage rate (%)" step="0.1" value={values.rate} onChange={update('rate')} />
              <CalcField id={`${id}-term`} label="Loan term (yrs)" min={5} max={40} value={values.term} onChange={update('term')} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <CalcField id={`${id}-propg`} label="Property growth (%/yr)" step="0.5" value={values.propertyGrowth} onChange={update('propertyGrowth')} />
              <CalcField id={`${id}-rentg`} label="Rent growth (%/yr)" step="0.5" value={values.rentGrowth} onChange={update('rentGrowth')} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <CalcField id={`${id}-invr`} label="Investment return (%/yr)" step="0.5" value={values.investReturn} onChange={update('investReturn')} hint="What the renter earns on invested cash." />
              <CalcField id={`${id}-ownerc`} label="Owner costs (% of value/yr)" step="0.1" value={values.ownerCosts} onChange={update('ownerCosts')} hint="Rates, insurance, maintenance." />
            </div>
            <div className="flex items-center justify-between gap-3">
              <CalcField id={`${id}-years`} label="Compare over (yrs)" min={1} max={40} value={values.years} onChange={update('years')} />
              <label className="flex items-center gap-2 pt-5 text-sm">
                <Checkbox checked={firstHome} onCheckedChange={(v) => setFirstHome(v === true)} />
                First-home buyer
              </label>
            </div>
          </CalcPanel>
        }
        results={
          result.valid ? (
            <>
              <div className="rounded-xl border border-primary/40 bg-primary/5 p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {result.gap >= 0 ? 'Buying ahead by' : 'Renting ahead by'} after {values.years} years
                </p>
                <p className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl" data-testid="rvb-gap">
                  {money(Math.abs(result.gap))}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {result.breakeven ? `Buying overtakes renting in year ${result.breakeven}` : 'Buying does not overtake within the window'}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <ResultStat label="Buyer net position" value={money(result.endBuyer)} sub="Property value minus loan" testId="rvb-buyer" />
                <ResultStat label="Renter net position" value={money(result.endRenter)} sub="Invested deposit + saved difference" testId="rvb-renter" />
                <ResultStat label="Stamp duty + upfront" value={money(result.upfront)} sub={`${money(result.duty)} duty${firstHome ? ' (FHB)' : ''} + $3k costs`} testId="rvb-upfront" />
              </div>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Wealth over time</CardTitle>
                </CardHeader>
                <CardContent>
                  <WealthChart points={result.points} />
                  <p className="mt-2 text-xs text-muted-foreground">
                    Solid — buying · dashed — renting and investing the difference
                  </p>
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
        Stylised comparison — constant growth rates, no transaction selling costs, LMI, rent
        assistance, or tax differences between the two portfolios. Stamp duty is an estimate;
        confirm with your state revenue office. General information, not advice.
      </p>

      {result.valid && (
        <CalculatorHandoffCta
          tool="rent-vs-buy"
          title="Rent vs Buy"
          summary={`${result.gap >= 0 ? 'Buying' : 'Renting'} ahead by ${money(Math.abs(result.gap))} over ${values.years}y`}
          metrics={[
            { label: 'Breakeven', value: result.breakeven ? `Year ${result.breakeven}` : 'Beyond window' },
            { label: 'Upfront', value: money(result.upfront) },
            { label: 'Repayments', value: `${money(result.pay / 12)}/mo` },
          ]}
          fields={{ price: Number(values.price), deposit: Number(values.deposit) }}
          targetPath="/personal/goals/"
          label="Turn this into a deposit goal"
        />
      )}
    </section>
  );
}

function WealthChart({ points }: { points: { year: number; buyer: number; renter: number }[] }) {
  const width = 560;
  const height = 220;
  const margin = { top: 10, right: 10, bottom: 28, left: 64 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const maxY = Math.max(...points.flatMap((p) => [p.buyer, p.renter]), 1);
  const maxX = Math.max(...points.map((p) => p.year), 1);
  const x = scaleLinear({ domain: [0, maxX], range: [0, innerW] });
  const y = scaleLinear({ domain: [0, maxY], range: [innerH, 0], nice: true });
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Buyer equity vs renter portfolio over time">
      <g transform={`translate(${margin.left},${margin.top})`}>
        <LinePath data={points} x={(d) => x(d.year)} y={(d) => y(d.buyer)} curve={curveMonotoneX} strokeWidth={2.5} className="stroke-primary" />
        <LinePath data={points} x={(d) => x(d.year)} y={(d) => y(d.renter)} curve={curveMonotoneX} strokeWidth={2} strokeDasharray="5 4" className="stroke-muted-foreground" />
        <AxisBottom scale={x} top={innerH} numTicks={Math.min(maxX, 10)} tickFormat={(v) => `${v}`} tickLabelProps={() => ({ fontSize: 10, fill: 'currentColor', textAnchor: 'middle' })} />
        <AxisLeft scale={y} numTicks={5} tickFormat={(v) => `$${Math.round(Number(v) / 1000)}k`} tickLabelProps={() => ({ fontSize: 10, fill: 'currentColor', textAnchor: 'end', dy: 3 })} />
      </g>
    </svg>
  );
}
