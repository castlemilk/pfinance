/**
 * Compound interest with regular deposits. Pure functions, no framework imports.
 *
 * Model (matches how a bank savings account works, on a coarser clock):
 * - Time advances in equal steps: the smallest interval that both the deposit
 *   and compounding frequencies divide evenly (e.g. 156 steps a year for
 *   weekly deposits with monthly compounding).
 * - Each step accrues simple interest on the current balance. Accrued
 *   interest is credited to the balance only at the end of each compounding
 *   period, and earns interest from then on.
 * - Deposits land at the end of each deposit period, after that step's
 *   interest, so a deposit starts earning in the following step.
 *
 * Every input is sanitised: non-finite values become 0 and negatives are
 * clamped to 0, so no output can be NaN or Infinity.
 */

export type ContributionFrequency = 'weekly' | 'fortnightly' | 'monthly' | 'annually';
export type CompoundingFrequency = 'monthly' | 'quarterly' | 'annually';

export const CONTRIBUTIONS_PER_YEAR: Record<ContributionFrequency, number> = {
  weekly: 52,
  fortnightly: 26,
  monthly: 12,
  annually: 1,
};

export const COMPOUNDS_PER_YEAR: Record<CompoundingFrequency, number> = {
  monthly: 12,
  quarterly: 4,
  annually: 1,
};

export interface CompoundInputs {
  startingBalance: number;
  contribution: number;
  contributionFrequency: ContributionFrequency;
  annualRatePercent: number;
  compounding: CompoundingFrequency;
  /** Whole years to project. */
  years: number;
}

export interface CompoundYearRow {
  /** 0 is the starting position. */
  year: number;
  contributions: number;
  interest: number;
  /** Credited balance at the end of the year. */
  balance: number;
  /** Starting balance plus every deposit so far. */
  totalDeposited: number;
  totalInterest: number;
}

export interface CompoundResult {
  finalBalance: number;
  startingBalance: number;
  totalContributions: number;
  totalInterest: number;
  rows: CompoundYearRow[];
}

/** Longest horizon `timeToTarget` will search before giving up. */
export const MAX_TARGET_YEARS = 100;

const clean = (value: number | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

function clock(input: CompoundInputs) {
  const perYear = CONTRIBUTIONS_PER_YEAR[input.contributionFrequency] ?? 12;
  const compounds = COMPOUNDS_PER_YEAR[input.compounding] ?? 12;
  const steps = (perYear * compounds) / gcd(perYear, compounds);
  return {
    steps,
    depositEvery: steps / perYear,
    creditEvery: steps / compounds,
    ratePerStep: clean(input.annualRatePercent) / 100 / steps,
    deposit: clean(input.contribution),
  };
}

/**
 * Walks the account forward one step at a time. `visit` is called after each
 * step with the step number and the credited balance; returning `true` stops
 * the walk early. Returns the step that stopped it, or null if none did.
 */
function walk(
  input: CompoundInputs,
  totalSteps: number,
  visit: (step: number, state: { balance: number; deposited: number; interest: number }) => boolean | void
): number | null {
  const { depositEvery, creditEvery, ratePerStep, deposit } = clock(input);
  const state = { balance: clean(input.startingBalance), deposited: 0, interest: 0 };
  let accrued = 0;
  for (let step = 1; step <= totalSteps; step++) {
    accrued += state.balance * ratePerStep;
    // Every compounding frequency divides the year evenly, so year ends always
    // land on a credit and the yearly rows show a credited balance.
    if (step % creditEvery === 0) {
      state.balance += accrued;
      state.interest += accrued;
      accrued = 0;
    }
    if (step % depositEvery === 0) {
      state.balance += deposit;
      state.deposited += deposit;
    }
    if (visit(step, state) === true) return step;
  }
  return null;
}

export function projectCompoundGrowth(input: CompoundInputs): CompoundResult {
  const startingBalance = clean(input.startingBalance);
  const years = Math.floor(clean(input.years));
  const { steps } = clock(input);
  const rows: CompoundYearRow[] = [
    { year: 0, contributions: 0, interest: 0, balance: startingBalance, totalDeposited: startingBalance, totalInterest: 0 },
  ];

  let lastDeposited = 0;
  let lastInterest = 0;
  walk(input, years * steps, (step, state) => {
    if (step % steps !== 0) return;
    rows.push({
      year: step / steps,
      contributions: state.deposited - lastDeposited,
      interest: state.interest - lastInterest,
      balance: state.balance,
      totalDeposited: startingBalance + state.deposited,
      totalInterest: state.interest,
    });
    lastDeposited = state.deposited;
    lastInterest = state.interest;
  });

  const end = rows[rows.length - 1];
  return {
    finalBalance: end.balance,
    startingBalance,
    totalContributions: end.totalDeposited - startingBalance,
    totalInterest: end.totalInterest,
    rows,
  };
}

/**
 * Whole months until the credited balance first reaches `target`, or null if
 * it does not within MAX_TARGET_YEARS. 0 when the starting balance already
 * meets the target.
 */
export function timeToTarget(input: CompoundInputs, target: number): number | null {
  const goal = clean(target);
  if (goal === 0 || clean(input.startingBalance) >= goal) return 0;
  const { steps } = clock(input);
  const hit = walk(input, MAX_TARGET_YEARS * steps, (_step, state) => state.balance >= goal);
  if (hit === null) return null;
  return Math.ceil((hit * 12) / steps - 1e-9);
}
