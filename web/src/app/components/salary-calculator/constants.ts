/**
 * SalaryCalculator - Constants
 * 
 * ATO rates, thresholds, and constants for salary calculations.
 */

// Super contribution limits
export const ATO_PERSONAL_SUPER_CONTRIBUTION_LIMIT = 30000;
export const ATO_PERSONAL_SUPER_CONTRIBUTION_URL = "https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families/super/growing-and-keeping-track-of-your-super/how-to-save-more-in-your-super/personal-super-contributions";

// FBT rate and cap
export const FBT_RATE = 0.47;
export const FBT_EXEMPT_CAP_INFO = "Some organizations (like NFPs and charities) may have an FBT exemption cap that varies by organization.";
export const ATO_FBT_URL = "https://www.ato.gov.au/rates/fbt/";
export const ATO_SALARY_SACRIFICE_URL = "https://www.ato.gov.au/individuals/income-and-deductions/income-you-must-declare/salary-and-wages/salary-sacrifice-arrangements/";

// Common salary packaging caps reference
export const COMMON_PACKAGING_CAPS = [
  { value: 15899, label: "Public hospital/health promotion charity" },
  { value: 18550, label: "Public benevolent institution" },
  { value: 30000, label: "FBT-exempt organizations" },
  { value: 17000, label: "Other NFPs" }
] as const;

// Student loan repayment
export const ATO_STUDENT_LOAN_URL = "https://www.ato.gov.au/tax-rates-and-codes/study-and-training-support-loans-rates-and-repayment-thresholds";

// HELP/STSL repayment thresholds and rates for 2023-24
export const HELP_REPAYMENT_THRESHOLDS = [
  { min: 0, max: 51550, rate: 0 },
  { min: 51550, max: 59518, rate: 0.01 },
  { min: 59519, max: 63089, rate: 0.02 },
  { min: 63090, max: 66875, rate: 0.025 },
  { min: 66876, max: 70888, rate: 0.03 },
  { min: 70889, max: 75140, rate: 0.035 },
  { min: 75141, max: 79649, rate: 0.04 },
  { min: 79650, max: 84429, rate: 0.045 },
  { min: 84430, max: 89494, rate: 0.05 },
  { min: 89495, max: 94865, rate: 0.055 },
  { min: 94866, max: 100557, rate: 0.06 },
  { min: 100558, max: 106591, rate: 0.065 },
  { min: 106592, max: 112990, rate: 0.07 },
  { min: 112991, max: 119769, rate: 0.075 },
  { min: 119770, max: 126955, rate: 0.08 },
  { min: 126956, max: 134572, rate: 0.085 },
  { min: 134573, max: 142646, rate: 0.09 },
  { min: 142647, max: 151204, rate: 0.095 },
  { min: 151205, max: Infinity, rate: 0.10 }
] as const;

// Medicare levy
export const ATO_MEDICARE_LEVY_URL = "https://www.ato.gov.au/individuals/medicare-and-private-health-insurance/medicare-levy/";
export const MEDICARE_LEVY_RATE = 0.02; // 2%

// Default form values
export const DEFAULT_FORM_VALUES = {
  salary: '105000',
  frequency: 'annually' as const,
  voluntarySuper: '0',
  isProratedHours: false,
  proratedHours: '38',
  proratedFrequency: 'weekly' as const,
  packagingCap: 15899,
};

// Default tax settings
export const DEFAULT_TAX_SETTINGS = {
  includeSuper: true,
  superRate: 11.5,
  includeMedicare: true,
  medicareExemption: false,
  includeSeniorOffset: false,
  includeStudentLoan: false,
  studentLoanRate: 2,
  includeDependentChildren: false,
  includeSpouse: false,
  includePrivateHealth: false,
  includeVoluntarySuper: false,
};
