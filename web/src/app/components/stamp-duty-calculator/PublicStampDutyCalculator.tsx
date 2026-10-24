'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
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
import { CalcField, CalcLayout, CalcPanel, ResultStat } from '@/app/components/calculator-ui';
import {
  firstHomeDuty,
  foreignSurcharge,
  standardDuty,
  STATE_NAMES,
  type StateCode,
} from '@/lib/stamp-duty';

const EXAMPLE = { price: '750000', state: 'NSW' as StateCode };

const money = (n: number) =>
  n.toLocaleString('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  });

export default function PublicStampDutyCalculator() {
  const id = React.useId();
  const [price, setPrice] = React.useState(EXAMPLE.price);
  const [state, setState] = React.useState<StateCode>(EXAMPLE.state);
  const [firstHome, setFirstHome] = React.useState(false);
  const [newHome, setNewHome] = React.useState(false);
  const [foreign, setForeign] = React.useState(false);

  const result = React.useMemo(() => {
    const value = price.trim() === '' ? NaN : Number(price);
    if (!Number.isFinite(value) || value <= 0) return { valid: false as const };

    const std = standardDuty(state, value);
    const fhb = firstHome ? firstHomeDuty(state, value, newHome) : null;
    const duty = fhb ? fhb.duty : std;
    const surcharge = foreign ? foreignSurcharge(state, value) : 0;
    const total = duty + surcharge;

    return {
      valid: true as const,
      std,
      fhb,
      duty,
      surcharge,
      total,
      effectiveRate: (total / value) * 100,
    };
  }, [price, state, firstHome, newHome, foreign]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Interactive stamp duty estimator — no sign-up.</p>
        <Button
          variant="outline"
          onClick={() => {
            setPrice(EXAMPLE.price);
            setState(EXAMPLE.state);
            setFirstHome(false);
            setNewHome(false);
            setForeign(false);
          }}
        >
          Reset example
        </Button>
      </div>

      <CalcLayout
        inputs={
          <CalcPanel title="The purchase">
            <CalcField
              id={`${id}-price`}
              label="Purchase price (AUD)"
              min={0}
              step="5000"
              value={price}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPrice(e.target.value)}
              hint="Duty is charged on the dutiable value — usually the price paid."
            />
            <div className="space-y-1.5">
              <label htmlFor={`${id}-state`} className="text-sm font-medium">
                State or territory
              </label>
              <Select value={state} onValueChange={(v) => setState(v as StateCode)}>
                <SelectTrigger id={`${id}-state`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATE_NAMES) as StateCode[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {s} — {STATE_NAMES[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2.5 pt-1">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={firstHome} onCheckedChange={(v) => setFirstHome(v === true)} />
                First home buyer
              </label>
              {firstHome && (state === 'SA') && (
                <label className="flex items-center gap-2 pl-6 text-sm">
                  <Checkbox checked={newHome} onCheckedChange={(v) => setNewHome(v === true)} />
                  Buying a new home
                </label>
              )}
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={foreign} onCheckedChange={(v) => setForeign(v === true)} />
                Foreign purchaser surcharge applies
              </label>
            </div>
          </CalcPanel>
        }
        results={
          result.valid ? (
            <>
              <div className="rounded-xl border border-primary/40 bg-primary/5 p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Estimated duty{foreign ? ' incl. surcharge' : ''} — {state}
                </p>
                <p className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
                  <span data-testid="stamp-duty-total">
                    <CountUp to={result.total} prefix="$" separator="," duration={1} trigger="view" />
                  </span>
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {result.effectiveRate.toFixed(2)}% of the purchase price
                  {result.fhb?.exempt ? ' — fully exempt' : ''}
                </p>
                {result.fhb && !result.fhb.exempt && result.fhb.duty < result.std && (
                  <p className="mt-1 text-sm font-medium text-primary">
                    First-home concession saves {money(result.std - result.fhb.duty)}
                  </p>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <ResultStat
                  label="Standard rate duty"
                  value={money(result.std)}
                  testId="stamp-duty-standard"
                />
                <ResultStat
                  label="Your estimated duty"
                  value={money(result.duty)}
                  sub={result.fhb ? result.fhb.note : 'Standard (non-concessional) rate.'}
                  testId="stamp-duty-yours"
                />
                <ResultStat
                  label="Foreign surcharge"
                  value={money(result.surcharge)}
                  sub={foreign ? 'Added on top of transfer duty.' : 'Toggle on if it applies.'}
                  testId="stamp-duty-surcharge"
                />
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Enter a purchase price to estimate duty.
            </div>
          )
        }
      />

      <p className="text-xs text-muted-foreground">
        Estimates use published standard transfer-duty scales plus simple price-threshold
        first-home concessions. Income-tested schemes, off-the-plan concessions, PPR/home
        concession rates and premiums above the top tier are not modelled — your conveyancer and
        the state revenue office calculator give the exact figure. Rates current 2025–26/2026–27.
      </p>

      {result.valid && (
        <CalculatorHandoffCta
          tool="stamp-duty"
          title="Stamp Duty Calculator"
          summary={`${state} duty on ${money(Number(price))}: ${money(result.total)}`}
          metrics={[
            { label: 'Purchase price', value: money(Number(price)) },
            { label: 'Estimated duty', value: money(result.total) },
            { label: 'Effective rate', value: `${result.effectiveRate.toFixed(2)}%` },
          ]}
          fields={{
            price: Number(price),
            state,
            duty: Math.round(result.total),
          }}
          targetPath="/personal/goals/"
          label="Save toward this purchase"
        />
      )}
    </div>
  );
}
