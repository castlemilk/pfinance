import {
  getCurrentAustralianFY,
  getFYDateRange,
  getCategoryLabel,
  TAX_DEDUCTION_CATEGORIES,
} from '../taxDeductions';
import { TaxDeductionCategory } from '@/gen/pfinance/v1/types_pb';

describe('taxDeductions', () => {
  describe('getCurrentAustralianFY', () => {
    it('returns correct FY format', () => {
      const fy = getCurrentAustralianFY();
      expect(fy).toMatch(/^\d{4}-\d{2}$/);
    });
  });

  describe('getFYDateRange', () => {
    it('returns correct date range for 2025-26', () => {
      const { start, end } = getFYDateRange('2025-26');

      // Start should be July 1, 2025
      expect(start.getFullYear()).toBe(2025);
      expect(start.getMonth()).toBe(6); // July is month index 6
      expect(start.getDate()).toBe(1);

      // End should be June 30, 2026
      expect(end.getFullYear()).toBe(2026);
      expect(end.getMonth()).toBe(5); // June is month index 5
    });
  });

  describe('getCategoryLabel', () => {
    it('returns label for known category', () => {
      expect(getCategoryLabel(TaxDeductionCategory.WORK_TRAVEL)).toBe('Work Travel');
    });

    it('returns Unknown for invalid category', () => {
      expect(getCategoryLabel(999 as TaxDeductionCategory)).toBe('Unknown');
    });
  });

  describe('TAX_DEDUCTION_CATEGORIES', () => {
    it('has 10 entries', () => {
      expect(TAX_DEDUCTION_CATEGORIES).toHaveLength(10);
    });

    it('has unique codes', () => {
      const codes = TAX_DEDUCTION_CATEGORIES.map((c) => c.code);
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(codes.length);
    });
  });
});
