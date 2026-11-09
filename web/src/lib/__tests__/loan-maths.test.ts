import {
  amortisingRepayment,
  compareLoan,
  periodsToYearsMonths,
  simulateLoan,
  type LoanInputs,
} from '../loan-maths';

const base: LoanInputs = { principal: 500_000, annualRatePercent: 6, termYears: 30, frequency: 'monthly' };

describe('amortisingRepayment', () => {
  it('matches the standard annuity formula', () => {
    // 500k at 6% over 30 years: the textbook $2,997.75 a month.
    expect(amortisingRepayment(500_000, 0.06 / 12, 360)).toBeCloseTo(2997.75, 2);
    // 300k at 5% over 25 years: $1,753.77 a month.
    expect(amortisingRepayment(300_000, 0.05 / 12, 300)).toBeCloseTo(1753.77, 2);
  });

  it('repays in equal instalments at a 0% rate', () => {
    expect(amortisingRepayment(360_000, 0, 360)).toBe(1000);
  });

  it('returns 0 instead of NaN or Infinity for empty or invalid inputs', () => {
    expect(amortisingRepayment(0, 0.005, 360)).toBe(0);
    expect(amortisingRepayment(100_000, 0.005, 0)).toBe(0);
    expect(amortisingRepayment(NaN, 0.005, 360)).toBe(0);
    expect(amortisingRepayment(100_000, Infinity, 360)).toBeCloseTo(100_000 / 360, 8);
  });
});

describe('simulateLoan', () => {
  it('runs a standard monthly P&I schedule to zero over the full term', () => {
    const loan = simulateLoan(base);
    expect(loan.repayment).toBeCloseTo(2997.75, 2);
    expect(loan.periodsToRepay).toBe(360);
    expect(loan.totalInterest).toBeCloseTo(2997.7526 * 360 - 500_000, 0);
    expect(loan.totalPaid).toBeCloseTo(loan.totalInterest + 500_000, 6);
    expect(loan.years).toHaveLength(31);
    expect(loan.years[0]).toEqual({ year: 0, interest: 0, principal: 0, balance: 500_000 });
    expect(loan.years[30].balance).toBe(0);
    // Every year's principal adds back up to the loan amount.
    const principalRepaid = loan.years.reduce((sum, row) => sum + row.principal, 0);
    expect(principalRepaid).toBeCloseTo(500_000, 4);
  });

  it('uses the annual rate / 26 over 26 repayments a year for fortnightly', () => {
    const loan = simulateLoan({ ...base, frequency: 'fortnightly' });
    expect(loan.periodsPerYear).toBe(26);
    expect(loan.repayment).toBeCloseTo(amortisingRepayment(500_000, 0.06 / 26, 780), 8);
    expect(loan.periodsToRepay).toBe(780);
    // A true fortnightly schedule is not "half the monthly repayment".
    expect(loan.repayment).toBeLessThan(simulateLoan(base).repayment / 2);
  });

  it('uses the annual rate / 52 over 52 repayments a year for weekly', () => {
    const loan = simulateLoan({ ...base, frequency: 'weekly' });
    expect(loan.repayment).toBeCloseTo(amortisingRepayment(500_000, 0.06 / 52, 1560), 8);
    expect(loan.periodsToRepay).toBe(1560);
  });

  it('pays half the monthly repayment each fortnight when asked, finishing early', () => {
    const monthly = simulateLoan(base);
    const trueFortnightly = simulateLoan({ ...base, frequency: 'fortnightly' });
    const halfMonthly = simulateLoan({ ...base, frequency: 'fortnightly', halfMonthly: true });
    expect(halfMonthly.repayment).toBeCloseTo(monthly.repayment / 2, 8);
    expect(halfMonthly.periodsToRepay).toBeLessThan(780);
    expect(halfMonthly.totalInterest).toBeLessThan(trueFortnightly.totalInterest);
    // halfMonthly is ignored for other frequencies.
    expect(simulateLoan({ ...base, halfMonthly: true }).repayment).toBeCloseTo(monthly.repayment, 8);
  });

  it('charges no interest at a 0% rate', () => {
    const loan = simulateLoan({ ...base, principal: 360_000, annualRatePercent: 0 });
    expect(loan.repayment).toBe(1000);
    expect(loan.totalInterest).toBe(0);
    expect(loan.totalPaid).toBeCloseTo(360_000, 6);
    expect(loan.periodsToRepay).toBe(360);
    const io = simulateLoan({ ...base, principal: 360_000, annualRatePercent: 0, interestOnlyYears: 5 });
    expect(io.interestOnlyRepayment).toBe(0);
    expect(io.repayment).toBe(1200); // 360k over the 25 P&I years
  });

  it('holds the balance through an interest-only period, then amortises over the remaining term', () => {
    const io = simulateLoan({ ...base, interestOnlyYears: 5 });
    expect(io.interestOnlyPeriods).toBe(60);
    expect(io.interestOnlyRepayment).toBeCloseTo(2500, 8);
    expect(io.years[5]).toMatchObject({ balance: 500_000, principal: 0 });
    expect(io.years[5].interest).toBeCloseTo(30_000, 6);
    // P&I over the 25 remaining years, which is higher than P&I over 30.
    expect(io.repayment).toBeCloseTo(amortisingRepayment(500_000, 0.005, 300), 8);
    expect(io.repayment).toBeGreaterThan(simulateLoan(base).repayment);
    expect(io.totalInterest).toBeGreaterThan(simulateLoan(base).totalInterest);
    expect(io.periodsToRepay).toBe(360);
    expect(io.years[30].balance).toBe(0);
  });

  it('always leaves at least one P&I period when the IO period covers the term', () => {
    const io = simulateLoan({ ...base, termYears: 5, interestOnlyYears: 10 });
    expect(io.interestOnlyPeriods).toBe(59);
    expect(io.years[io.years.length - 1].balance).toBe(0);
  });

  it('never produces NaN or Infinity from bad inputs and clamps negatives', () => {
    const loan = simulateLoan({
      principal: -100,
      annualRatePercent: NaN,
      termYears: Infinity,
      frequency: 'monthly',
      extraPerPeriod: -50,
    });
    for (const value of [loan.repayment, loan.totalInterest, loan.totalPaid, loan.periodsToRepay]) {
      expect(Number.isFinite(value)).toBe(true);
    }
    expect(loan.totalPaid).toBe(0);
    const negativeExtra = simulateLoan({ ...base, extraPerPeriod: -500 });
    expect(negativeExtra.periodsToRepay).toBe(360);
  });
});

describe('compareLoan', () => {
  it('shortens the term and saves interest with an extra repayment, keeping the scheduled repayment', () => {
    const result = compareLoan({ ...base, extraPerPeriod: 500 });
    expect(result.plan.repayment).toBeCloseTo(result.base.repayment, 8);
    expect(result.base.periodsToRepay).toBe(360);
    expect(result.plan.periodsToRepay).toBe(252); // 21 years
    expect(result.periodsSaved).toBe(108);
    expect(result.interestSaved).toBeCloseTo(result.base.totalInterest - result.plan.totalInterest, 6);
    expect(result.interestSaved).toBeGreaterThan(190_000);
    expect(result.plan.years[result.plan.years.length - 1].balance).toBe(0);
    expect(result.plan.totalPaid).toBeCloseTo(500_000 + result.plan.totalInterest, 4);
  });

  it('applies extra repayments during an interest-only period to principal', () => {
    const result = compareLoan({ ...base, interestOnlyYears: 5, extraPerPeriod: 1000 });
    expect(result.plan.years[5].balance).toBeCloseTo(500_000 - 60_000, 6);
    expect(result.plan.periodsToRepay).toBeLessThan(360);
    expect(result.interestSaved).toBeGreaterThan(0);
  });

  it('reports no saving without an extra repayment', () => {
    const result = compareLoan(base);
    expect(result.plan).toBe(result.base);
    expect(result.interestSaved).toBe(0);
    expect(result.periodsSaved).toBe(0);
  });
});

describe('periodsToYearsMonths', () => {
  it('splits periods into years and months, rounding part months up', () => {
    expect(periodsToYearsMonths(360, 12)).toEqual({ years: 30, months: 0 });
    expect(periodsToYearsMonths(638, 26)).toEqual({ years: 24, months: 7 });
    expect(periodsToYearsMonths(53, 52)).toEqual({ years: 1, months: 1 });
    expect(periodsToYearsMonths(0, 12)).toEqual({ years: 0, months: 0 });
  });
});
