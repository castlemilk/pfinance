import { studentLoanRepaymentFor } from '../useSalaryCalculations';

describe('studentLoanRepaymentFor', () => {
  it('uses the marginal system from 2025-26', () => {
    expect(studentLoanRepaymentFor(85_000, '2025-26')).toBeCloseTo(2_700, 2);
    expect(studentLoanRepaymentFor(80_000, '2026-27')).toBeCloseTo(1_570.8, 1);
    // 2027-28 falls back to the latest published (2026-27) schedule
    expect(studentLoanRepaymentFor(80_000, '2027-28')).toBeCloseTo(1_570.8, 1);
    expect(studentLoanRepaymentFor(60_000, '2026-27')).toBe(0);
  });

  it('keeps the legacy percentage table for earlier years', () => {
    // 2023-24 table: $85,000 falls in the 5% band of total income
    expect(studentLoanRepaymentFor(85_000, '2023-24')).toBeCloseTo(4_250, 2);
  });
});
