import { projectSuper, validateSuperAssumptions, type SuperAssumptions } from '../projection';

const base: SuperAssumptions = { startingBalance: 1000, annualContribution: 100, annualReturnPercent: 5, years: 2 };

describe('super growth projection', () => {
  it('compounds annually and adds contributions at year end', () => {
    const rows = projectSuper(base);
    expect(rows.map(row => row.balance)).toEqual([1000, 1150, 1307.5]);
    expect(rows[2]).toMatchObject({ totalContributions: 200, totalGrowth: 107.5, investmentReturn: 57.5, contributedCapital: 1200 });
  });
  it('does not give a year-end contribution a full year of returns', () => {
    expect(projectSuper({ ...base, startingBalance: 0, years: 1 })[1].balance).toBe(100);
  });
  it('handles zero return without division by zero', () => {
    expect(projectSuper({ ...base, annualReturnPercent: 0 })[2].balance).toBe(1200);
  });
  it('handles contributions of zero', () => {
    expect(projectSuper({ ...base, annualContribution: 0 })[2].balance).toBe(1102.5);
  });
  it('models negative returns and labels losses accurately', () => {
    const end = projectSuper({ ...base, annualReturnPercent: -10 })[2];
    expect(end.balance).toBe(1000);
    expect(end.totalGrowth).toBe(-200);
  });
  it('allows a complete annual loss but never a negative balance', () => {
    expect(projectSuper({ ...base, annualReturnPercent: -100 })[2].balance).toBe(100);
  });
  it('returns the current balance for a zero-year horizon', () => {
    expect(projectSuper({ ...base, years: 0 })).toHaveLength(1);
  });
  it('keeps annual money steps in cents and reconciles every row', () => {
    for (const row of projectSuper({ ...base, startingBalance: 1234.56, annualContribution: 123.45, annualReturnPercent: 6.7, years: 40 })) {
      expect(row.balance).toBeCloseTo(1234.56 + row.totalContributions + row.totalGrowth, 2);
      expect(row.balance * 100).toBeCloseTo(Math.round(row.balance * 100), 5);
    }
  });
  it.each([
    { startingBalance: -1 }, { annualContribution: -1 }, { annualReturnPercent: -101 },
    { annualReturnPercent: Infinity }, { years: NaN }, { years: 1.5 }, { years: 81 },
    { startingBalance: NaN }, { annualContribution: 1_000_000_001 },
  ])('rejects invalid assumptions: %p', (change) => {
    expect(Object.keys(validateSuperAssumptions({ ...base, ...change })).length).toBeGreaterThan(0);
    expect(() => projectSuper({ ...base, ...change })).toThrow(RangeError);
  });
  it('fails safely rather than displaying overflow', () => {
    expect(() => projectSuper({ ...base, startingBalance: 1e9, annualReturnPercent: 100, years: 80 })).toThrow('supported range');
  });
  it('does not mutate the assumptions', () => {
    expect(() => projectSuper(Object.freeze({ ...base }))).not.toThrow();
  });
});
