import {
  MAX_TARGET_YEARS,
  projectCompoundGrowth,
  timeToTarget,
  type CompoundInputs,
} from '../compound-interest';

const base: CompoundInputs = {
  startingBalance: 10_000,
  contribution: 500,
  contributionFrequency: 'monthly',
  annualRatePercent: 5,
  compounding: 'monthly',
  years: 10,
};

describe('projectCompoundGrowth', () => {
  it('matches the closed-form future value for monthly deposits with monthly compounding', () => {
    const i = 0.05 / 12;
    const growth = Math.pow(1 + i, 120);
    const expected = 10_000 * growth + (500 * (growth - 1)) / i;
    const result = projectCompoundGrowth(base);
    expect(result.finalBalance).toBeCloseTo(expected, 6);
    expect(result.finalBalance).toBeCloseTo(94_111.23, 2);
  });

  it('splits the final balance into starting balance, deposits and interest', () => {
    const result = projectCompoundGrowth(base);
    expect(result.startingBalance).toBe(10_000);
    expect(result.totalContributions).toBeCloseTo(60_000, 6);
    expect(result.startingBalance + result.totalContributions + result.totalInterest).toBeCloseTo(result.finalBalance, 6);
    expect(result.rows).toHaveLength(11);
    for (const row of result.rows) {
      expect(row.totalDeposited + row.totalInterest).toBeCloseTo(row.balance, 6);
    }
    expect(result.rows[1].contributions).toBeCloseTo(6_000, 6);
  });

  it('compounds annually with annual deposits added at year end', () => {
    const result = projectCompoundGrowth({
      ...base,
      startingBalance: 1000,
      contribution: 100,
      contributionFrequency: 'annually',
      compounding: 'annually',
      years: 2,
    });
    expect(result.rows.map((row) => row.balance)).toEqual([1000, 1150, 1307.5]);
  });

  it('adds deposits at the end of each period, so they earn interest from the next one', () => {
    // A single year-end deposit earns nothing in its first year.
    const annual = projectCompoundGrowth({
      ...base,
      startingBalance: 0,
      contribution: 1000,
      contributionFrequency: 'annually',
      compounding: 'annually',
      years: 1,
    });
    expect(annual.finalBalance).toBe(1000);
    expect(annual.totalInterest).toBe(0);

    // Monthly deposits with annual compounding earn simple interest until the
    // year-end credit: $100 x 5% x (11 + 10 + ... + 0)/12 = $27.50.
    const monthlyIntoAnnual = projectCompoundGrowth({
      ...base,
      startingBalance: 0,
      contribution: 100,
      compounding: 'annually',
      years: 1,
    });
    expect(monthlyIntoAnnual.totalInterest).toBeCloseTo(27.5, 8);
    expect(monthlyIntoAnnual.finalBalance).toBeCloseTo(1227.5, 8);
  });

  it('credits more interest the more often it compounds', () => {
    const at = (compounding: CompoundInputs['compounding']) =>
      projectCompoundGrowth({ ...base, startingBalance: 1000, contribution: 0, compounding, years: 1 }).finalBalance;
    expect(at('monthly')).toBeCloseTo(1000 * Math.pow(1 + 0.05 / 12, 12), 8);
    expect(at('quarterly')).toBeCloseTo(1000 * Math.pow(1 + 0.05 / 4, 4), 8);
    expect(at('annually')).toBeCloseTo(1050, 8);
  });

  it('handles weekly and fortnightly deposits against monthly compounding', () => {
    const weekly = projectCompoundGrowth({ ...base, contribution: 100, contributionFrequency: 'weekly', years: 1 });
    const fortnightly = projectCompoundGrowth({ ...base, contribution: 200, contributionFrequency: 'fortnightly', years: 1 });
    expect(weekly.totalContributions).toBeCloseTo(5200, 6);
    expect(fortnightly.totalContributions).toBeCloseTo(5200, 6);
    // Same dollars, but weekly money arrives earlier on average.
    expect(weekly.totalInterest).toBeGreaterThan(fortnightly.totalInterest);
  });

  it('adds no interest at a 0% rate', () => {
    const result = projectCompoundGrowth({ ...base, annualRatePercent: 0 });
    expect(result.totalInterest).toBe(0);
    expect(result.finalBalance).toBe(70_000);
  });

  it('never produces NaN or Infinity from bad inputs and clamps negatives', () => {
    const result = projectCompoundGrowth({
      startingBalance: -500,
      contribution: NaN,
      contributionFrequency: 'monthly',
      annualRatePercent: -3,
      compounding: 'monthly',
      years: Infinity,
    });
    expect(result.finalBalance).toBe(0);
    expect(result.rows).toHaveLength(1);
    for (const value of [result.finalBalance, result.totalContributions, result.totalInterest]) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});

describe('timeToTarget', () => {
  it('counts whole months until the balance first reaches the target', () => {
    expect(timeToTarget({ ...base, startingBalance: 0, contribution: 1000, annualRatePercent: 0 }, 12_000)).toBe(12);
    expect(
      timeToTarget({ ...base, startingBalance: 0, contribution: 100, contributionFrequency: 'weekly', annualRatePercent: 0 }, 5200)
    ).toBe(12);
    // 10k + $500/month at 5% passes $50k in month 65.
    const i = 0.05 / 12;
    const fv = (n: number) => 10_000 * Math.pow(1 + i, n) + (500 * (Math.pow(1 + i, n) - 1)) / i;
    expect(fv(64)).toBeLessThan(50_000);
    expect(fv(65)).toBeGreaterThanOrEqual(50_000);
    expect(timeToTarget(base, 50_000)).toBe(65);
  });

  it('returns 0 when the starting balance already covers the target, and for no target', () => {
    expect(timeToTarget(base, 5_000)).toBe(0);
    expect(timeToTarget(base, 0)).toBe(0);
  });

  it(`returns null when the target is out of reach within ${MAX_TARGET_YEARS} years`, () => {
    expect(timeToTarget({ ...base, contribution: 0, annualRatePercent: 0 }, 20_000)).toBeNull();
  });
});
