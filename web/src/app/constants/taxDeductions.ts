import { TaxDeductionCategory } from '@/gen/pfinance/v1/types_pb';
import { TaxYear } from './taxSystems';

// ATO deduction category metadata
export interface TaxDeductionCategoryInfo {
  id: TaxDeductionCategory;
  code: string;        // ATO code (D1, D2, etc.)
  label: string;
  description: string;
  color: string;       // Tailwind color class
}

export const TAX_DEDUCTION_CATEGORIES: TaxDeductionCategoryInfo[] = [
  {
    id: TaxDeductionCategory.WORK_TRAVEL,
    code: 'D1',
    label: 'Work Travel',
    description: 'Work-related travel expenses (not regular commuting)',
    color: 'bg-blue-500',
  },
  {
    id: TaxDeductionCategory.UNIFORM,
    code: 'D2',
    label: 'Uniform & Laundry',
    description: 'Occupation-specific clothing, protective wear, laundry',
    color: 'bg-purple-500',
  },
  {
    id: TaxDeductionCategory.SELF_EDUCATION,
    code: 'D3',
    label: 'Self-Education',
    description: 'Education to maintain or improve skills for current employment',
    color: 'bg-green-500',
  },
  {
    id: TaxDeductionCategory.OTHER_WORK,
    code: 'D4',
    label: 'Other Work-Related',
    description: 'Tools, phone, subscriptions used for work',
    color: 'bg-orange-500',
  },
  {
    id: TaxDeductionCategory.HOME_OFFICE,
    code: 'D5',
    label: 'Home Office',
    description: 'Working from home expenses (67c/hr or actual cost)',
    color: 'bg-teal-500',
  },
  {
    id: TaxDeductionCategory.VEHICLE,
    code: 'D6',
    label: 'Vehicle',
    description: 'Car expenses for work trips (85c/km or logbook)',
    color: 'bg-red-500',
  },
  {
    id: TaxDeductionCategory.DONATIONS,
    code: 'D15',
    label: 'Donations',
    description: 'Gifts and donations to DGR-registered organisations ($2+)',
    color: 'bg-pink-500',
  },
  {
    id: TaxDeductionCategory.TAX_AFFAIRS,
    code: 'D10',
    label: 'Tax Affairs',
    description: 'Tax agent fees, accounting software',
    color: 'bg-indigo-500',
  },
  {
    id: TaxDeductionCategory.INCOME_PROTECTION,
    code: 'IP',
    label: 'Income Protection',
    description: 'Income protection insurance premiums',
    color: 'bg-amber-500',
  },
  {
    id: TaxDeductionCategory.OTHER,
    code: 'Other',
    label: 'Other Deductions',
    description: 'Other deductions not in above categories',
    color: 'bg-gray-500',
  },
];

export function getCategoryInfo(category: TaxDeductionCategory): TaxDeductionCategoryInfo | undefined {
  return TAX_DEDUCTION_CATEGORIES.find(c => c.id === category);
}

export function getCategoryLabel(category: TaxDeductionCategory): string {
  return getCategoryInfo(category)?.label ?? 'Unknown';
}

// FY date range helpers
export function getCurrentAustralianFY(): TaxYear {
  const now = new Date();
  const startYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const endYear = (startYear + 1) % 100;
  return `${startYear}-${String(endYear).padStart(2, '0')}` as TaxYear;
}

export function getFYDateRange(fy: string): { start: Date; end: Date } {
  const [startYearStr] = fy.split('-');
  const startYear = parseInt(startYearStr, 10);
  return {
    start: new Date(startYear, 6, 1),  // July 1
    end: new Date(startYear + 1, 5, 30, 23, 59, 59),  // June 30
  };
}
