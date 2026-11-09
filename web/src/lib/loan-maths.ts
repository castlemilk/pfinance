/**
 * Home loan repayment maths. Pure functions, no framework imports.
 *
 * Model:
 * - The annual rate is split evenly across repayment periods (annual / 12,
 *   / 26 or / 52). Lenders usually accrue interest daily and charge it
 *   monthly, so their figures can differ by a few dollars.
 * - Interest-only (IO) years come first. Each IO repayment is the interest
 *   charged on the balance that period.
 * - The principal-and-interest (P&I) repayment is set once, from the full
 *   loan amount over the years left after the IO period. Extra repayments
 *   reduce the balance but leave the scheduled repayment unchanged, so the
 *   loan finishes early.
 * - "Half-monthly" pays half the monthly P&I repayment every fortnight:
 *   26 half-payments a year, the same as 13 monthly repayments.
 *
 * Every input is sanitised: non-finite values become 0 and negatives are
 * clamped to 0, so no output can be NaN or Infinity.
 */

export type RepaymentFrequency = 'monthly' | 'fortnightly' | 'weekly';

export const PERIODS_PER_YEAR: Record<RepaymentFrequency, number> = {
  monthly: 12,
  fortnightly: 26,
  weekly: 52,
};

export interface LoanInputs {
  principal: number;
  annualRatePercent: number;
  termYears: number;
  frequency: RepaymentFrequency;
  /** Years of interest-only repayments before P&I starts. 0 for P&I from day one. */
  interestOnlyYears?: number;
  /** Paid on top of the scheduled repayment every period. */
  extraPerPeriod?: number;
  /** Fortnightly only: pay half the monthly P&I repayment instead of the true fortnightly amount. */
  halfMonthly?: boolean;
}

export interface LoanYearRow {
  /** 0 is the starting position. */
  year: number;
  interest: number;
  principal: number;
  /** Balance at the end of the year. */
  balance: number;
}

export interface LoanSchedule {
  periodsPerYear: number;
  /** Scheduled P&I repayment per period, before any extra repayment. */
  repayment: number;
  /** First-period interest-only repayment (0 when there is no IO period). */
  interestOnlyRepayment: number;
  interestOnlyPeriods: number;
  /** Periods in the contracted term. */
  termPeriods: number;
  /** Periods actually needed to clear the loan. */
  periodsToRepay: number;
  totalInterest: number;
  totalPaid: number;
  years: LoanYearRow[];
}

export interface LoanComparison {
  /** Same loan without the extra repayment. */
  base: LoanSchedule;
  /** The loan as entered, including any extra repayment. */
  plan: LoanSchedule;
  interestSaved: number;
  periodsSaved: number;
}

const clean = (value: number | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;

/**
 * Level repayment that clears `principal` over `periods` at `ratePerPeriod`.
 * Falls back to straight-line repayment at a 0% rate.
 */
export function amortisingRepayment(principal: number, ratePerPeriod: number, periods: number): number {
  const p = clean(principal);
  const r = clean(ratePerPeriod);
  const n = Math.floor(clean(periods));
  if (p === 0 || n === 0) return 0;
  if (r === 0) return p / n;
  return (p * r) / (1 - Math.pow(1 + r, -n));
}

export function simulateLoan(input: LoanInputs): LoanSchedule {
  const principal = clean(input.principal);
  const ppy = PERIODS_PER_YEAR[input.frequency] ?? 12;
  const annualRate = clean(input.annualRatePercent) / 100;
  const r = annualRate / ppy;
  const termPeriods = Math.max(1, Math.round(clean(input.termYears) * ppy));
  // Leave at least one P&I period so the loan is always repaid within the term.
  const ioPeriods = Math.min(Math.round(clean(input.interestOnlyYears) * ppy), termPeriods - 1);
  const piPeriods = termPeriods - ioPeriods;
  const extra = clean(input.extraPerPeriod);

  const halfMonthly = input.frequency === 'fortnightly' && input.halfMonthly === true;
  const repayment = halfMonthly
    ? amortisingRepayment(principal, annualRate / 12, Math.round((piPeriods / ppy) * 12)) / 2
    : amortisingRepayment(principal, r, piPeriods);

  const years: LoanYearRow[] = [{ year: 0, interest: 0, principal: 0, balance: principal }];
  let balance = principal;
  let totalInterest = 0;
  let totalPaid = 0;
  let yearInterest = 0;
  let yearPrincipal = 0;
  let period = 0;

  while (balance > 0.005 && period < termPeriods) {
    period += 1;
    const interest = balance * r;
    const scheduled = period <= ioPeriods ? interest : repayment;
    const owing = balance + interest;
    // The final contracted period clears any rounding residue.
    const payment = period >= termPeriods ? owing : Math.min(scheduled + extra, owing);
    balance = owing - payment;
    totalInterest += interest;
    totalPaid += payment;
    yearInterest += interest;
    yearPrincipal += payment - interest;
    if (balance <= 0.005) balance = 0;
    if (period % ppy === 0 || balance === 0) {
      years.push({ year: Math.ceil(period / ppy), interest: yearInterest, principal: yearPrincipal, balance });
      yearInterest = 0;
      yearPrincipal = 0;
    }
  }

  return {
    periodsPerYear: ppy,
    repayment,
    interestOnlyRepayment: ioPeriods > 0 ? principal * r : 0,
    interestOnlyPeriods: ioPeriods,
    termPeriods,
    periodsToRepay: period,
    totalInterest,
    totalPaid,
    years,
  };
}

/** Runs the loan as entered and again without the extra repayment. */
export function compareLoan(input: LoanInputs): LoanComparison {
  const plan = simulateLoan(input);
  const base = clean(input.extraPerPeriod) > 0 ? simulateLoan({ ...input, extraPerPeriod: 0 }) : plan;
  return {
    base,
    plan,
    interestSaved: Math.max(0, base.totalInterest - plan.totalInterest),
    periodsSaved: Math.max(0, base.periodsToRepay - plan.periodsToRepay),
  };
}

/** Splits a period count into whole years and leftover months, rounding months up. */
export function periodsToYearsMonths(periods: number, periodsPerYear: number): { years: number; months: number } {
  const ppy = periodsPerYear > 0 ? periodsPerYear : 12;
  const totalMonths = Math.max(0, Math.ceil((clean(periods) / ppy) * 12 - 1e-9));
  return { years: Math.floor(totalMonths / 12), months: totalMonths % 12 };
}
