import {
  calculateTaxWithBrackets,
  calculateLITO,
  getAustralianBrackets,
  DEFAULT_TAX_YEAR,
} from '../taxSystems';
import * as tax from '../taxSystems';

describe('taxSystems', () => {
  describe('calculateTaxWithBrackets', () => {
    const brackets2024 = getAustralianBrackets('2024-25');

    it('returns 0 for 0 income', () => {
      expect(calculateTaxWithBrackets(0, brackets2024)).toBe(0);
    });

    it('returns 0 for tax-free threshold', () => {
      expect(calculateTaxWithBrackets(18200, brackets2024)).toBe(0);
    });

    it('calculates correctly for $85000', () => {
      const tax = calculateTaxWithBrackets(85000, brackets2024);
      expect(tax).toBeGreaterThan(14000);
      expect(tax).toBeLessThan(17000);
    });

    it('handles high income', () => {
      const tax = calculateTaxWithBrackets(200000, brackets2024);
      expect(tax).toBeGreaterThan(50000);
    });
  });

  describe('calculateLITO', () => {
    it('returns full offset for low income', () => {
      expect(calculateLITO(30000)).toBe(700);
    });

    it('returns partial offset in first phase-out', () => {
      const lito = calculateLITO(40000);
      expect(lito).toBeCloseTo(575, -1);
    });

    it('returns 0 for high income', () => {
      expect(calculateLITO(70000)).toBe(0);
    });

    it('returns 0 for non-residents', () => {
      expect(calculateLITO(30000, DEFAULT_TAX_YEAR, 'non-resident')).toBe(0);
    });
  });

  describe('getAustralianBrackets', () => {
    it('returns brackets for valid year', () => {
      const brackets = getAustralianBrackets('2024-25');
      expect(brackets).toHaveLength(5);
      expect(brackets[0].rate).toBe(0);
      expect(brackets[brackets.length - 1].rate).toBe(45);
    });
  });
});

describe('FY2026-27 onward settings', () => {
  it('applies the legislated 15% (2026-27) and 14% (2027-28) second bracket', () => {
    expect(tax.getAustralianBrackets('2025-26')[1].rate).toBe(16);
    expect(tax.getAustralianBrackets('2026-27')[1].rate).toBe(15);
    expect(tax.getAustralianBrackets('2027-28')[1].rate).toBe(14);
    // $45,000: 15% of $26,800 = $4,020 in 2026-27
    expect(tax.calculateTaxWithBrackets(45_000, tax.getAustralianBrackets('2026-27'))).toBeCloseTo(4_020, 0);
  });

  it('builds no-tax-free-threshold brackets from the selected year', () => {
    const brackets = tax.getAustralianBrackets('2026-27', 'no-tax-free');
    expect(brackets[0]).toMatchObject({ min: 0, max: 45000, rate: 15 });
    expect(brackets.every((b) => b.rate > 0)).toBe(true);
    expect(tax.getAustralianBrackets('2024-25', 'no-tax-free')[0].rate).toBe(16);
  });

  it('derives the current income year from the Sydney date and clamps it', () => {
    expect(tax.currentAustralianTaxYear(new Date('2026-11-09T00:00:00Z'))).toBe('2026-27');
    expect(tax.currentAustralianTaxYear(new Date('2026-06-30T12:00:00Z'))).toBe('2025-26');
    // 30 Jun 2026 15:00 UTC is 1 Jul 01:00 in Sydney
    expect(tax.currentAustralianTaxYear(new Date('2026-06-30T15:00:00Z'))).toBe('2026-27');
    expect(tax.currentAustralianTaxYear(new Date('2035-01-01T00:00:00Z'))).toBe('2027-28');
    expect(tax.currentAustralianTaxYear(new Date('2015-01-01T00:00:00Z'))).toBe('2020-21');
  });

  it('flags only years after the current one as future', () => {
    const current = tax.DEFAULT_TAX_YEAR;
    for (const opt of tax.TAX_YEAR_OPTIONS) {
      expect(Boolean(opt.isFuture)).toBe(opt.value > current);
    }
  });

  it('returns year-specific SG rates and concessional caps', () => {
    expect(tax.superGuaranteeRateFor('2024-25')).toBe(11.5);
    expect(tax.superGuaranteeRateFor('2026-27')).toBe(12);
    expect(tax.concessionalCapFor('2023-24')).toBe(27_500);
    expect(tax.concessionalCapFor('2025-26')).toBe(30_000);
    expect(tax.concessionalCapFor('2026-27')).toBe(32_500);
  });
});
