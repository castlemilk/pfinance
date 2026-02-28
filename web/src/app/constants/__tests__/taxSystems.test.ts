import {
  calculateTaxWithBrackets,
  calculateLITO,
  getAustralianBrackets,
  DEFAULT_TAX_YEAR,
} from '../taxSystems';

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
