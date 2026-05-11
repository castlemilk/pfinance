export interface MarketingPageData {
  path: string;
  title: string;
  description: string;
  eyebrow: string;
  heading: string;
  body: string;
  primaryCta: string;
  secondaryCta: string;
  highlights: string[];
  sections: Array<{
    title: string;
    body: string;
  }>;
  priority: number;
  changeFrequency: 'weekly' | 'monthly';
}

export const discoveryPages: MarketingPageData[] = [
  {
    path: '/features/receipt-scanner',
    title: 'Receipt Scanner for Personal Finance',
    description: 'Scan receipts, review extracted line items, and turn paper purchases into organized expense records.',
    eyebrow: 'Receipt scanner',
    heading: 'Turn receipts into reviewed expenses',
    body: 'Upload receipt images, extract merchant and amount details, then review the result before it reaches your records.',
    primaryCta: 'Scan a receipt',
    secondaryCta: 'Read receipt guides',
    highlights: [
      'Image compression before upload',
      'Review step before import',
      'Category suggestions for common merchants',
    ],
    sections: [
      {
        title: 'Built for real spending records',
        body: 'PFinance keeps receipt capture connected to the same categories, tax flags, and review flow used by your regular expenses.',
      },
      {
        title: 'Control before automation',
        body: 'AI extraction is treated as a draft. You can confirm, correct, or discard imported values before they affect your totals.',
      },
      {
        title: 'Useful at tax time',
        body: 'Receipts can support deduction review and export workflows, reducing the scramble for purchase evidence later.',
      },
    ],
    priority: 0.86,
    changeFrequency: 'monthly',
  },
  {
    path: '/features/bank-statement-import',
    title: 'Bank Statement Import and Expense Review',
    description: 'Import statement transactions, review duplicates, and categorize spending without rebuilding your budget by hand.',
    eyebrow: 'Statement import',
    heading: 'Move statement lines into a clean expense ledger',
    body: 'Bring bank statement data into PFinance, check the extracted transactions, and keep the final import readable.',
    primaryCta: 'Import a statement',
    secondaryCta: 'See budgeting tips',
    highlights: [
      'Bulk transaction review',
      'Duplicate detection workflow',
      'Category mapping for recurring merchants',
    ],
    sections: [
      {
        title: 'Fewer manual entries',
        body: 'Statement import is designed for catch-up work, month-end review, and moving historical spending into one place.',
      },
      {
        title: 'Review before commit',
        body: 'Transactions are staged before import so mistakes can be fixed without polluting your expense history.',
      },
      {
        title: 'Cleaner household history',
        body: 'Once imported, transactions use the same lists, charts, and reports as manually entered expenses.',
      },
    ],
    priority: 0.84,
    changeFrequency: 'monthly',
  },
  {
    path: '/features/household-budgeting',
    title: 'Household Budgeting and Shared Expense Tracking',
    description: 'Track shared household expenses, split costs, and keep family or roommate spending visible in one finance workspace.',
    eyebrow: 'Household budgeting',
    heading: 'A shared view of household money',
    body: 'Coordinate spending with the people you share costs with, without losing your own personal finance view.',
    primaryCta: 'Open household dashboard',
    secondaryCta: 'Read shared finance guides',
    highlights: [
      'Shared groups and balances',
      'Personal and household views',
      'Reports for recurring costs',
    ],
    sections: [
      {
        title: 'Designed for more than one person',
        body: 'PFinance supports shared groups so rent, groceries, utilities, and one-off costs can be tracked together.',
      },
      {
        title: 'Personal context stays intact',
        body: 'Shared finances do not erase your own budget. You can keep household commitments visible beside personal income and expenses.',
      },
      {
        title: 'Less ambiguity',
        body: 'Group balances and reports help clarify who paid, what changed, and where the household budget is drifting.',
      },
    ],
    priority: 0.82,
    changeFrequency: 'monthly',
  },
  {
    path: '/features/tax-deductions',
    title: 'Tax Deduction Tracking for Expenses',
    description: 'Flag tax-related expenses, review deduction categories, and prepare cleaner records before tax time.',
    eyebrow: 'Tax deductions',
    heading: 'Keep deduction evidence close to the expense',
    body: 'Track possible deductions throughout the year so review and export work is not left until the deadline.',
    primaryCta: 'Review tax tracker',
    secondaryCta: 'Read tax guides',
    highlights: [
      'Tax category review',
      'Receipt evidence workflows',
      'Year-by-year comparison support',
    ],
    sections: [
      {
        title: 'Review while details are fresh',
        body: 'Expenses can be assessed for tax relevance close to the transaction date, while merchant and purpose are easier to remember.',
      },
      {
        title: 'Evidence with context',
        body: 'Receipts, categories, and notes live alongside the transaction, making later review more direct.',
      },
      {
        title: 'Export-ready records',
        body: 'Structured expense data gives you a cleaner starting point for accountant review or personal filing preparation.',
      },
    ],
    priority: 0.84,
    changeFrequency: 'monthly',
  },
  {
    path: '/tools/australian-salary-calculator',
    title: 'Australian Salary Calculator',
    description: 'Estimate Australian take-home pay with tax year, Medicare, superannuation, student loan, and salary packaging settings.',
    eyebrow: 'Salary calculator',
    heading: 'Estimate Australian take-home pay with real settings',
    body: 'Model gross or take-home pay, adjust common Australian tax settings, and export a salary report for review.',
    primaryCta: 'Open salary calculator',
    secondaryCta: 'Read income guides',
    highlights: [
      'Gross and take-home input modes',
      'Super, Medicare, and student loan options',
      'PDF and shareable report flows',
    ],
    sections: [
      {
        title: 'Built for Australian pay settings',
        body: 'The calculator includes tax-year selection, residency category, superannuation, student loan, and Medicare options.',
      },
      {
        title: 'Useful for offer comparison',
        body: 'Switch between annual, monthly, fortnightly, weekly, daily, and hourly views to make compensation easier to compare.',
      },
      {
        title: 'Report-ready output',
        body: 'The salary report summarizes key assumptions so exported figures are easier to verify later.',
      },
    ],
    priority: 0.9,
    changeFrequency: 'weekly',
  },
  {
    path: '/tools/budget-calculator',
    title: 'Budget Calculator for Income and Expenses',
    description: 'Plan a budget from income, recurring expenses, savings goals, and spending categories in PFinance.',
    eyebrow: 'Budget calculator',
    heading: 'Turn income and expenses into a workable budget',
    body: 'Use your actual finance records to understand what is left, where it goes, and which categories need a clearer plan.',
    primaryCta: 'Open budget tools',
    secondaryCta: 'Read budgeting guides',
    highlights: [
      'Income and expense summaries',
      'Category-level budget tracking',
      'Savings goal context',
    ],
    sections: [
      {
        title: 'Grounded in your records',
        body: 'PFinance connects budgeting to the expenses and income you already track instead of making you maintain a separate spreadsheet.',
      },
      {
        title: 'Better category feedback',
        body: 'Budget progress is easier to act on when it sits beside the transaction list that created the variance.',
      },
      {
        title: 'Useful for repeated review',
        body: 'A budget should survive more than one setup session. PFinance is built around ongoing tracking and adjustment.',
      },
    ],
    priority: 0.88,
    changeFrequency: 'weekly',
  },
  {
    path: '/compare/spreadsheets-vs-finance-app',
    title: 'Spreadsheets vs Finance Apps for Budgeting',
    description: 'Compare spreadsheet budgeting with a dedicated personal finance app for receipt capture, collaboration, and ongoing review.',
    eyebrow: 'Comparison',
    heading: 'When a spreadsheet stops being enough',
    body: 'Spreadsheets are flexible, but repeated tracking, receipts, shared budgets, and tax review need workflows that hold together.',
    primaryCta: 'Try PFinance',
    secondaryCta: 'Read finance guides',
    highlights: [
      'Less manual maintenance',
      'Shared household workflows',
      'Receipt and tax evidence support',
    ],
    sections: [
      {
        title: 'Spreadsheets are best for custom models',
        body: 'A spreadsheet is still useful for one-off projections and highly personal formulas.',
      },
      {
        title: 'Finance apps are better for repeat workflows',
        body: 'Recurring tracking, import review, receipt evidence, and multi-user access are easier when the product owns the workflow.',
      },
      {
        title: 'PFinance keeps the operational layer together',
        body: 'Transactions, categories, shared expenses, and reports stay connected so the system is easier to revisit each week.',
      },
    ],
    priority: 0.78,
    changeFrequency: 'monthly',
  },
];

export function getDiscoveryPage(path: string): MarketingPageData {
  const page = discoveryPages.find((item) => item.path === path);
  if (!page) {
    throw new Error(`Unknown discovery page: ${path}`);
  }
  return page;
}
