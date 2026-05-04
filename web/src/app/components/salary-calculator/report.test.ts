import { buildSalaryReportViewModel, type ReportInput } from './report';
import { DEFAULT_TAX_SETTINGS } from './constants';

const sampleReport: ReportInput = {
  generatedAt: new Date('2026-05-04T09:30:00+09:30'),
  userName: 'Ben Ebsworth',
  userEmail: 'ben@example.com',
  taxCountry: 'australia',
  taxYear: '2024-25',
  taxCategory: 'resident',
  taxSettings: {
    ...DEFAULT_TAX_SETTINGS,
    includeSuper: true,
    includeMedicare: true,
    includeStudentLoan: true,
    includeVoluntarySuper: true,
    superRate: 11.5,
  },
  studentLoanRate: '4%',
  superannuation: 13800,
  salarySacrificeCalculation: {
    totalSalarySacrifice: 12000,
    taxDeductibleSacrifice: 9000,
    nonTaxDeductibleSacrifice: 3000,
    remainingPackagingCap: 3900,
    estimatedTaxSavings: 2700,
    netCashBenefit: 14700,
    packagingCap: 15900,
  },
  salarySacrifices: [
    {
      id: 's1',
      description: 'Meal card',
      amount: '1000',
      frequency: 'monthly',
      isTaxDeductible: true,
    },
  ],
  overtimeEntries: [
    {
      id: 'o1',
      hours: '5',
      rate: '80',
      frequency: 'weekly',
      includeSuper: true,
    },
  ],
  fringeBenefits: [
    {
      id: 'f1',
      description: 'Car allowance',
      amount: '500',
      frequency: 'monthly',
      type: 'taxable',
      reportable: true,
    },
  ],
  breakdowns: [
    {
      frequency: 'weekly',
      grossIncome: 2307.69,
      baseSalary: 2307.69,
      overtime: 400,
      tax: 520,
      medicare: 46.15,
      studentLoan: 92.3,
      netIncome: 1649.24,
      superannuation: 265.38,
      voluntarySuper: 50,
      fringeBenefits: 115.38,
      reportableFBT: 115.38,
      salarySacrifice: 230.77,
      taxDeductibleSacrifice: 173.08,
    },
    {
      frequency: 'annually',
      grossIncome: 120000,
      baseSalary: 120000,
      overtime: 20800,
      tax: 27000,
      medicare: 2400,
      studentLoan: 4800,
      netIncome: 85800,
      superannuation: 13800,
      voluntarySuper: 2600,
      fringeBenefits: 6000,
      reportableFBT: 6000,
      salarySacrifice: 12000,
      taxDeductibleSacrifice: 9000,
    },
    {
      frequency: 'monthly',
      grossIncome: 10000,
      baseSalary: 10000,
      overtime: 1733.33,
      tax: 2250,
      medicare: 200,
      studentLoan: 400,
      netIncome: 7150,
      superannuation: 1150,
      voluntarySuper: 216.67,
      fringeBenefits: 500,
      reportableFBT: 500,
      salarySacrifice: 1000,
      taxDeductibleSacrifice: 750,
    },
  ],
};

describe('salary report view model', () => {
  it('summarises the annual export using labelled totals and sorted frequencies', () => {
    const model = buildSalaryReportViewModel(sampleReport);

    expect(model.generatedDate).toBe('4 May 2026');
    expect(model.taxSystemLabel).toBe('Australian (Australian Resident)');
    expect(model.preparedFor).toBe('Ben Ebsworth · ben@example.com');
    expect(model.heroCards).toEqual([
      { label: 'Annual take-home', value: 'A$85,800.00', tone: 'positive' },
      { label: 'Gross income', value: 'A$120,000.00', tone: 'neutral' },
      { label: 'Tax and deductions', value: 'A$34,200.00', tone: 'negative' },
      { label: 'Total package', value: 'A$139,800.00', tone: 'accent' },
    ]);
    expect(model.frequencyRows.map((row) => row.label)).toEqual([
      'Annual',
      'Monthly',
      'Weekly',
    ]);
    expect(model.detailSections.map((section) => section.title)).toEqual([
      'Annual breakdown',
      'Enabled settings',
      'Salary packaging',
      'Overtime',
      'Fringe benefits',
      'Superannuation',
    ]);
  });

  it('omits default settings that are not enabled', () => {
    const model = buildSalaryReportViewModel({
      ...sampleReport,
      taxSettings: DEFAULT_TAX_SETTINGS,
      salarySacrificeCalculation: {
        totalSalarySacrifice: 0,
        taxDeductibleSacrifice: 0,
        nonTaxDeductibleSacrifice: 0,
        remainingPackagingCap: 0,
        estimatedTaxSavings: 0,
        netCashBenefit: 0,
        packagingCap: 0,
      },
      salarySacrifices: [],
      overtimeEntries: [],
      fringeBenefits: [],
      breakdowns: [
        {
          frequency: 'annually',
          grossIncome: 120000,
          baseSalary: 120000,
          overtime: 0,
          tax: 27000,
          medicare: 0,
          studentLoan: 0,
          netIncome: 93000,
          superannuation: 0,
          voluntarySuper: 0,
          fringeBenefits: 0,
          reportableFBT: 0,
          salarySacrifice: 0,
          taxDeductibleSacrifice: 0,
        },
      ],
    });

    expect(model.detailSections.map((section) => section.title)).toEqual([
      'Annual breakdown',
    ]);
  });

  it('renders only enabled calculator options in one compact export section', () => {
    const model = buildSalaryReportViewModel({
      ...sampleReport,
      taxCategory: 'non-resident',
      taxSettings: {
        ...sampleReport.taxSettings,
        includePrivateHealth: true,
      },
      salaryInputMode: 'net',
      salaryInputFrequency: 'monthly',
      isProratedHours: true,
      proratedHours: '30',
      proratedFrequency: 'weekly',
      taxableIncome: 111000,
      medicareLevy: 0,
      voluntarySuperContribution: 2600,
      voluntarySuperTaxSavings: 455,
      baseRemainingCap: 16200,
      remainingConcessionalCap: 13600,
      studentLoanBalance: 45000,
      deductions: {
        annualDeductions: 3200,
        capitalGains: 1500,
        dividends: 900,
        frankingCredits: 250,
        businessIncome: 5000,
        businessLoss: 1200,
        includesGST: true,
        otherIncome: 600,
        otherTaxOffsets: 300,
      },
      novatedLeases: [
        {
          id: 'lease-1',
          description: 'EV lease',
          amount: '500',
          frequency: 'fortnightly',
          isPreTax: true,
        },
      ],
      familyBenefits: {
        isCouple: true,
        spouseIncome: 45000,
        children: [
          {
            id: 'child-1',
            age: 3,
            inChildcare: true,
            childcareType: 'centre',
            weeklyHours: 40,
            weeklyCost: 500,
          },
        ],
        childSupportReceived: 1200,
        childSupportPaid: 600,
      },
    } as ReportInput);

    const sections = Object.fromEntries(model.detailSections.map((section) => [section.title, section]));

    expect(sections['Calculator inputs']).toBeUndefined();
    expect(sections['Tax settings']).toBeUndefined();
    expect(sections['Enabled settings'].rows).toEqual(
      expect.arrayContaining([
        { label: 'Input mode', value: 'Take-home pay', tone: 'accent' },
        { label: 'Pro-rata hours', value: '30 hours / Weekly', tone: 'accent' },
        { label: 'Tax category', value: 'Non-Resident', tone: 'accent' },
        {
          label: 'Medicare & health',
          value: 'Private health insurance',
          tone: 'accent',
          note: 'Medicare levy excluded',
        },
        {
          label: 'Student loan',
          value: 'A$45,000.00 balance',
          tone: 'negative',
          note: 'Repayment A$4,800.00 / yr at 4%',
        },
      ]),
    );
    expect(sections['Enabled settings'].rows).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Input frequency' }),
        expect.objectContaining({ label: 'Tax system' }),
        expect.objectContaining({ label: 'Tax year' }),
      ]),
    );
    expect(sections['Superannuation'].rows).toEqual(
      expect.arrayContaining([
        { label: 'Remaining concessional cap', value: 'A$13,600.00', tone: 'neutral' },
        { label: 'Estimated voluntary super tax saving', value: 'A$455.00', tone: 'positive' },
      ]),
    );
    expect(sections['Deductions & other income'].rows).toEqual(
      expect.arrayContaining([
        { label: 'Annual deductions', value: '-A$3,200.00', tone: 'positive' },
        { label: 'Business income includes GST', value: 'Yes', tone: 'accent' },
      ]),
    );
    expect(sections['Novated leases'].rows).toEqual(
      expect.arrayContaining([
        { label: 'EV lease', value: 'A$13,000.00 / yr', tone: 'accent', note: 'Pre-tax' },
      ]),
    );
    expect(sections['Family benefits'].rows).toEqual(
      expect.arrayContaining([
        { label: 'Family status', value: 'Couple', tone: 'neutral' },
        { label: 'Combined family income', value: 'A$156,000.00', tone: 'neutral' },
        {
          label: 'Child 1 care',
          value: 'A$18,200.00 subsidy / yr',
          tone: 'positive',
          note: 'Centre based, 40h/wk, A$26,000.00 annual cost, A$7,800.00 net',
        },
      ]),
    );
  });
});
