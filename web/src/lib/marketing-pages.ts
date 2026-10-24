export interface MarketingPageFaq {
  question: string;
  answer: string;
}

export interface MarketingPageSection {
  title: string;
  body: string;
  paragraphs?: string[];
}

export interface MarketingPageData {
  path: string;
  category: 'features' | 'tools' | 'compare';
  hubPath: '/features' | '/tools' | '/compare';
  hubLabel: 'Features' | 'Tools' | 'Compare';
  navLabel: string;
  title: string;
  description: string;
  eyebrow: string;
  heading: string;
  body: string;
  primaryCta: string;
  primaryCtaHref: string;
  secondaryCta: string;
  secondaryCtaHref: string;
  highlights: string[];
  sections: MarketingPageSection[];
  faqs: MarketingPageFaq[];
  priority: number;
  changeFrequency: 'weekly' | 'monthly';
}

export interface HubPageData {
  path: '/features' | '/tools' | '/compare';
  title: string;
  description: string;
  eyebrow: string;
  heading: string;
  body: string;
  sections: MarketingPageSection[];
  priority: number;
  changeFrequency: 'weekly' | 'monthly';
}

export const hubPages: HubPageData[] = [
  {
    path: '/features',
    title: 'Personal & Household Finance Features',
    description: 'Explore PFinance features for Australian households: receipt scanning, staged bank statement imports, shared household budgets, and ATO tax deduction tracking.',
    eyebrow: 'Product features',
    heading: 'Built for how Australian households actually track money',
    body: 'PFinance keeps daily expense capture, shared household ledgers, and tax-time evidence in a single system so you never have to reconcile separate apps at the end of June.',
    sections: [
      {
        title: 'Draft-first capture instead of blind automation',
        body: 'Whether you photograph a faded thermal receipt, upload a PDF or CSV bank statement, or type a quick note in plain English, PFinance stages every extracted transaction as a draft. You confirm the merchant, category, split, and tax flag before anything alters your budget or ledger.',
      },
      {
        title: 'Personal clarity alongside shared household commitments',
        body: 'Couples and families rarely run 100% merged or 100% separate finances. PFinance lets you maintain your own personal income, goals, and discretionary budgets while contributing shared housing, grocery, utility, and strata costs into a transparent household group.',
      },
      {
        title: 'Evidence attached from purchase to tax return',
        body: 'A bank line proves you paid a merchant on a date, but the Australian Taxation Office requires itemized evidence showing what was bought and how it relates to your income. PFinance keeps the receipt image, work-use percentage, and ATO category (D1 through D15) linked to the expense record all year.',
      },
    ],
    priority: 0.88,
    changeFrequency: 'weekly',
  },
  {
    path: '/tools',
    title: 'Free Australian Personal Finance Calculators & Tools',
    description: 'Model Australian take-home pay, superannuation growth, and household budget splits in your browser with no sign-in required.',
    eyebrow: 'Free calculators',
    heading: 'Interactive Australian finance calculators—no sign-in required',
    body: 'Test salary offers, model superannuation compounding, and structure a household budget split right in your browser before saving a single record.',
    sections: [
      {
        title: 'Model real Australian pay and tax mechanics',
        body: 'Our calculators account for progressive resident and non-resident tax brackets, the Medicare levy and surcharge, HELP/STSL student loan repayments, salary sacrifice, novated leases, and superannuation guarantee contributions.',
      },
      {
        title: 'Private in-browser calculations first',
        body: 'Every calculator on this page runs immediately in your browser without requiring an account. You can test scenarios, export a clean PDF summary, or copy a shareable link to review with your partner or accountant.',
      },
      {
        title: 'Move from a one-off calculation to an ongoing plan',
        body: 'A calculator gives you a snapshot on a single afternoon; PFinance turns those numbers into living income streams, category budgets, and savings goals that update as real transactions arrive.',
      },
    ],
    priority: 0.9,
    changeFrequency: 'weekly',
  },
  {
    path: '/compare',
    title: 'Compare Personal Finance Approaches & Budgeting Tools',
    description: 'Honest comparisons between spreadsheets, single-player expense trackers, and shared household finance software for Australian households.',
    eyebrow: 'Comparisons',
    heading: 'Choose the right system for your household complexity',
    body: 'Not every person needs a dedicated finance platform. See where a simple spreadsheet is still the best tool—and where receipts, shared bills, and tax evidence outgrow manual tabs.',
    sections: [
      {
        title: 'When a spreadsheet is genuinely better',
        body: 'If you are one person with one salary, a single transaction account, and minimal work-related deductions, a monthly spreadsheet review takes ten minutes and costs nothing. We will always tell you when a simpler approach fits your workflow better than adding another subscription.',
      },
      {
        title: 'Where manual systems break down',
        body: 'Spreadsheets struggle when two people pay shared bills from different cards, when PDF bank statements need deduplication across overlapping months, or when you need to locate forty paper receipts for an ATO deduction review in July before lodging your return.',
      },
      {
        title: 'Designed for Australian tax and banking workflows',
        body: 'Unlike US-centric budgeting tools built around 401(k) accounts and calendar-year taxes, PFinance is structured around the 1 July – 30 June Australian financial year, ATO deduction categories D1 through D15, superannuation, and staged statement imports.',
      },
    ],
    priority: 0.8,
    changeFrequency: 'monthly',
  },
];

export const discoveryPages: MarketingPageData[] = [
  {
    path: '/features/receipt-scanner',
    category: 'features',
    hubPath: '/features',
    hubLabel: 'Features',
    navLabel: 'Receipt Scanner',
    title: 'Receipt Scanner for Personal Finance',
    description: 'Scan receipts, review extracted line items, and turn paper purchases into organized expense records with attached tax evidence.',
    eyebrow: 'Receipt scanner',
    heading: 'Turn receipts into reviewed expenses',
    body: 'Upload receipt images or PDFs, extract merchant, date, GST, and line-item details with AI, and review the draft before it reaches your ledger.',
    primaryCta: 'Scan a receipt',
    primaryCtaHref: '/personal/expenses/',
    secondaryCta: 'Read expense guides',
    secondaryCtaHref: '/blog/',
    highlights: [
      'Client-side image compression before upload',
      'Mandatory human review step before import',
      'Receipt image stays attached for 5-year ATO retention',
    ],
    sections: [
      {
        title: 'What a receipt proves vs. what a bank line shows',
        body: 'A bank statement line only shows that you paid $142.50 at Bunnings or Officeworks on a Tuesday. It does not show whether you bought protective work boots, home-office stationery, or garden plants. For substantiation under Australian Taxation Office rules, a record generally needs to show the supplier name, the amount, the nature of the goods or services, the date the expense was incurred, and the date of the document. Capturing the receipt at the moment of purchase preserves the line-item proof that a bank feed alone never carries.',
      },
      {
        title: 'Control before automation: every extraction is a draft',
        body: 'Optical character recognition and vision models are fast, but crumpled thermal paper, surcharges, and handwritten tips can still confuse automated parsers. PFinance treats AI extraction as a helpful assistant rather than an autopilot. When you upload a photo or PDF, the scanner extracts the merchant name, total amount, date, and suggested category alongside a field-level confidence score. You can edit any value, split a mixed personal-and-work receipt by percentage, or discard the draft before a single cent touches your expense totals.',
      },
      {
        title: 'Built for the five-year retention window',
        body: 'Thermal paper fades within months inside a glovebox or wallet, yet the ATO generally requires individuals to keep written evidence of work-related deduction claims for five years from the date you lodge your tax return. Storing the compressed digital image directly on the expense record means the evidence, the category, the work-use note, and the transaction sit in one place—and can be exported together as a structured ZIP archive organized by deduction category at tax time.',
      },
    ],
    faqs: [
      {
        question: 'Does PFinance automatically add scanned receipts to my budget without review?',
        answer: 'No. Every scanned receipt is staged as a draft first. You see the extracted merchant, date, amount, and confidence badge, and you confirm or adjust the details before saving.',
      },
      {
        question: 'Why do I need a receipt if I already import my bank statement?',
        answer: 'A bank statement shows the merchant and total paid, but not the individual items purchased. When claiming work-related deductions over the substantiation threshold, itemized proof of what you bought is essential.',
      },
      {
        question: 'Can I attach a receipt to anshared household expense?',
        answer: 'Yes. Scanned receipts work for both personal expenses and shared household group expenses, keeping warranty proof and bill invoices visible to everyone in the group.',
      },
    ],
    priority: 0.86,
    changeFrequency: 'monthly',
  },
  {
    path: '/features/bank-statement-import',
    category: 'features',
    hubPath: '/features',
    hubLabel: 'Features',
    navLabel: 'Statement Import',
    title: 'Bank Statement Import and Expense Review',
    description: 'Import PDF and CSV bank statements, detect duplicate transactions, and categorize spending without rebuilding your ledger by hand.',
    eyebrow: 'Statement import',
    heading: 'Move statement lines into a clean expense ledger',
    body: 'Bring PDF and CSV bank statements into PFinance, stage extracted transactions for duplicate checks, and normalize messy merchant strings before commit.',
    primaryCta: 'Import a statement',
    primaryCtaHref: '/personal/expenses/',
    secondaryCta: 'See budgeting tips',
    secondaryCtaHref: '/blog/',
    highlights: [
      'Staged bulk transaction review before commit',
      'Fuzzy duplicate detection across overlapping statements',
      'Merchant normalization and persistent category overrides',
    ],
    sections: [
      {
        title: 'Staged imports prevent ledger pollution',
        body: 'Importing a three-month PDF or CSV bank statement directly into a live budget is a common way to ruin a finance tracker: internal transfers get counted as spending, refunded purchases appear twice, and cryptic EFTPOS descriptions land in "Other". PFinance stages every statement upload in an interactive review table first. You can filter lines, deselect internal account transfers, adjust categories in bulk, and verify the batch total before committing a single transaction.',
      },
      {
        title: 'Duplicate detection for overlapping statement periods',
        body: 'When you log key expenses manually or upload overlapping monthly statements, duplicate entries are inevitable unless the system checks for them. Before import, PFinance compares incoming statement lines against your existing ledger using date windows, exact cent amounts, and normalized merchant names. Potential matches are highlighted with a match score and reason so you can skip duplicates while keeping legitimate repeat purchases—like two coffees on the same morning.',
      },
      {
        title: 'Statement imports today and CDR Open Banking context',
        body: 'Bank statement PDF and CSV imports work with any Australian bank account today without sharing banking credentials. While Gamma Systems Pty Ltd is completing Consumer Data Right (CDR) accreditation steps, PFinance is not yet an Accredited Data Recipient—so staged statement uploads give you full control over which accounts and date ranges you bring into your workspace, with merchant normalization that remembers your category rules on every future upload.',
      },
    ],
    faqs: [
      {
        question: 'What happens if I upload a statement that overlaps with transactions I already entered?',
        answer: 'PFinance runs a duplicate check across date, amount in cents, and normalized merchant name before you import, flagging likely duplicates so you can exclude them with one click.',
      },
      {
        question: 'How does PFinance clean up messy bank descriptions?',
        answer: 'The extraction pipeline strips terminal numbers, card suffixes, and payment processor prefixes (like SQ* or SP*) to normalize merchants and apply your saved category overrides.',
      },
      {
        question: 'Is PFinance an accredited CDR Open Banking Data Recipient?',
        answer: 'Not yet. Accreditation, Register onboarding, and conformance testing under Gamma Systems Pty Ltd are not complete. Statement import via PDF and CSV is available today for all banks.',
      },
    ],
    priority: 0.84,
    changeFrequency: 'monthly',
  },
  {
    path: '/features/household-budgeting',
    category: 'features',
    hubPath: '/features',
    hubLabel: 'Features',
    navLabel: 'Household Budgeting',
    title: 'Household Budgeting and Shared Expense Tracking',
    description: 'Track shared household expenses, split costs proportionally or equally, and keep family or partner spending visible in one workspace.',
    eyebrow: 'Household budgeting',
    heading: 'A shared view of household money',
    body: 'Coordinate rent, mortgage, groceries, utilities, and sinking funds with your partner or housemates without giving up your personal finance view.',
    primaryCta: 'Open household dashboard',
    primaryCtaHref: '/shared/',
    secondaryCta: 'Read shared finance guides',
    secondaryCtaHref: '/blog/',
    highlights: [
      'Equal, percentage, share, or fixed-amount splits',
      'Separate personal and shared household views',
      'Running member balances and settlement tracking',
    ],
    sections: [
      {
        title: 'Designed for how modern households actually split costs',
        body: 'Most couples and shared households neither pool every dollar into a single joint account nor split every bill 50/50 down to the cent. When one partner earns $130,000 and the other earns $85,000—or takes parental leave—an equal split can strain the lower earner, while a proportional split (such as 60/40 on rent and utilities) keeps shared commitments fair. PFinance supports equal splits, custom percentages, share ratios, and exact dollar allocations on every group expense.',
      },
      {
        title: 'Sinking funds and irregular Australian household bills',
        body: 'Monthly budgets rarely fail because of weekly groceries; they fail when quarterly council rates, strata levies, water bills, annual car registration, and home insurance arrive in the same fortnight. Tracking recurring household bills and shared budgets in one workspace lets everyone see both the monthly baseline and the upcoming lumpy commitments, so the household can set aside sinking funds before the due date.',
      },
      {
        title: 'Personal autonomy alongside household transparency',
        body: 'Sharing a household ledger should not mean surrendering privacy over personal spending or hobbies. In PFinance, your personal workspace holds your individual income, personal expenses, and tax deductions, while the shared workspace holds only the expenses and budgets you explicitly log or contribute to the group. Group balances show who paid and who owes whom at any point, removing end-of-month spreadsheet friction.',
      },
    ],
    faqs: [
      {
        question: 'Can we split household bills proportionally by income instead of 50/50?',
        answer: 'Yes. Every shared expense supports equal splits, percentage splits (for example 60% / 40%), share ratios, or exact dollar amounts per member.',
      },
      {
        question: 'Do other group members see my personal expenses and salary?',
        answer: 'No. Group members only see expenses, incomes, and budgets created within or explicitly contributed to that shared group.',
      },
      {
        question: 'How many people can join a household finance group?',
        answer: 'Groups support couples, families, or multi-person share houses with role-based permissions (Owner, Admin, Member, and Viewer) and invite links.',
      },
    ],
    priority: 0.82,
    changeFrequency: 'monthly',
  },
  {
    path: '/features/tax-deductions',
    category: 'features',
    hubPath: '/features',
    hubLabel: 'Features',
    navLabel: 'Tax Deductions',
    title: 'Tax Deduction Tracking for Expenses',
    description: 'Flag work-related expenses across ATO deduction categories D1–D15, attach receipt evidence, and export cleaner records before 30 June.',
    eyebrow: 'Tax deductions',
    heading: 'Keep deduction evidence close to the expense',
    body: 'Organize work-related expenses, partial work-use splits, and supporting receipts throughout the 1 July – 30 June Australian financial year.',
    primaryCta: 'Open tax tracker',
    primaryCtaHref: '/personal/tax/',
    secondaryCta: 'Read tax guides',
    secondaryCtaHref: '/blog/',
    highlights: [
      'Aligned to ATO deduction categories (D1–D15)',
      'Partial work-use percentage and substantiation notes',
      'CSV, JSON, and receipt ZIP export for your tax agent',
    ],
    sections: [
      {
        title: 'The three golden rules of work-related deductions',
        body: 'In Australia, claiming a work-related deduction generally rests on three tests set by the ATO: you must have spent the money yourself and not been reimbursed, the expense must directly relate to earning your assessable income, and you must have a record to prove it. PFinance does not provide tax advice or decide eligibility—that is the role of the ATO or your registered tax agent—but it ensures that when you incur a potentially deductible expense, the receipt, the work-use percentage, and the context note are captured immediately.',
      },
      {
        title: 'Structured around the Australian financial year and ATO categories',
        body: 'Instead of generic US tax tags, PFinance organizes deductible expenses by standard Australian return categories: D1 work-related travel, D2 uniform and protective clothing, D3 self-education, D4 other work-related expenses (tools, subscriptions, union fees), D5 working from home, D6 vehicle expenses, D10 cost of managing tax affairs, D15 gifts and donations to DGR charities, and income protection insurance. Partial deductions—such as a mobile phone or internet plan used 40% for work—calculate the claimable portion automatically.',
      },
      {
        title: 'Turn 30 June and 31 October into an export, not an excavation',
        body: 'Whether you lodge your own return via myTax before 31 October or work with a registered tax agent, the hardest part of tax time is reconstructing twelve months of forgotten purchases. PFinance lets you run a guided review wizard across the financial year, compare category totals against the prior year to spot missing recurring claims, and export a structured schedule alongside a categorized ZIP folder of your receipts.',
      },
    ],
    faqs: [
      {
        question: 'Does PFinance give tax advice or lodge my return with the ATO?',
        answer: 'No. PFinance is record-keeping and organization software. It helps you categorize expenses, record work-use percentages, and export evidence for your own review or for a registered tax agent.',
      },
      {
        question: 'How does PFinance handle expenses that are partly personal and partly for work?',
        answer: 'You can set a deductible percentage (from 0% to 100%) and attach a calculation note—for example, a 4-week representative diary showing 35% work use on an internet bill.',
      },
      {
        question: 'What financial years are supported?',
        answer: 'PFinance tracks expenses using the Australian financial year (1 July to 30 June) and supports year-over-year deduction comparisons across financial years.',
      },
    ],
    priority: 0.84,
    changeFrequency: 'monthly',
  },
  {
    path: '/tools/australian-salary-calculator',
    category: 'tools',
    hubPath: '/tools',
    hubLabel: 'Tools',
    navLabel: 'Australian Salary Calculator',
    title: 'Australian Salary Calculator',
    description: 'Estimate Australian take-home pay across weekly, fortnightly, monthly, and annual cycles with Medicare levy, superannuation, HELP debt, and salary packaging.',
    eyebrow: 'Salary calculator',
    heading: 'Estimate Australian take-home pay with real settings',
    body: 'Model gross or target take-home pay in your browser, adjust residency, Medicare, superannuation, student loan, and salary sacrifice settings, and export a detailed report.',
    primaryCta: 'Save salary in PFinance',
    primaryCtaHref: '/personal/income/',
    secondaryCta: 'Explore all calculators',
    secondaryCtaHref: '/tools/',
    highlights: [
      'Gross-to-net and reverse target take-home modes',
      'Superannuation, Medicare, HELP/STSL, and novated leases',
      'Instant PDF download and shareable scenario links',
    ],
    sections: [
      {
        title: 'How progressive tax brackets and the Low Income Tax Offset work',
        body: 'Australian income tax is progressive, meaning higher tax rates apply only to the slice of taxable income above each threshold—never to your entire salary. Resident taxpayers benefit from a tax-free threshold on their first band of income, and lower-to-middle earners may also receive the Low Income Tax Offset (LITO), which reduces tax payable but cannot refund Medicare levy amounts. Non-residents and Working Holiday Makers face different bracket structures from the first dollar earned, which you can toggle directly in the calculator above.',
      },
      {
        title: 'Superannuation on top of base salary vs. total remuneration package',
        body: 'Job offers in Australia are quoted either as "base salary plus super" or as a "Total Remuneration Package (TRP)" inclusive of employer superannuation guarantee contributions. In addition, voluntary pre-tax (concessional) super contributions—salary sacrifice—reduce your taxable income while being taxed at the concessional fund rate up to the annual concessional contributions cap. Our calculator tracks your employer super alongside voluntary sacrifices so you can see both your take-home pay and your remaining cap.',
      },
      {
        title: 'Medicare levy, private health insurance, and HELP repayments',
        body: 'Beyond base income tax, take-home pay is shaped by the Medicare levy (and the Medicare Levy Surcharge if your income for surcharge purposes exceeds the threshold without appropriate private hospital cover) as well as compulsory HELP/HECS/STSL repayments. Because salary sacrifice and fringe benefits are added back into Repayment Income and Adjusted Taxable Income, packaging a benefit can sometimes reduce income tax while still counting toward student loan or surcharge tests.',
      },
    ],
    faqs: [
      {
        question: 'Can I calculate the gross salary needed to achieve a specific take-home pay?',
        answer: 'Yes. Switch the Input Type toggle from Gross to Net (Take-home) to reverse-calculate the annual gross salary required to land on your target weekly, fortnightly, or monthly pay.',
      },
      {
        question: 'Does the calculator save my salary details to a server when I use it on this page?',
        answer: 'No. On this public page, all calculations run locally in your browser. If you sign in to PFinance, you can optionally save your salary configuration to your account.',
      },
      {
        question: 'How do pro-rata / part-time hours work in the calculator?',
        answer: 'Enable the Pro-rata / Part-time toggle and enter your hours worked per week or fortnight; the calculator scales your full-time equivalent salary before computing tax and superannuation.',
      },
    ],
    priority: 0.9,
    changeFrequency: 'weekly',
  },
  {
    path: '/tools/budget-calculator',
    category: 'tools',
    hubPath: '/tools',
    hubLabel: 'Tools',
    navLabel: 'Budget Calculator',
    title: 'Budget Calculator for Income and Expenses',
    description: 'Split your after-tax pay across essential needs, discretionary wants, and savings goals using 50/30/20 or custom Australian household allocations.',
    eyebrow: 'Budget calculator',
    heading: 'Turn income and expenses into a workable budget',
    body: 'Test how your take-home income divides across housing, groceries, utilities, lifestyle spending, and savings—for one person or a dual-income household.',
    primaryCta: 'Track this budget in PFinance',
    primaryCtaHref: '/personal/expenses/',
    secondaryCta: 'Try the salary calculator',
    secondaryCtaHref: '/tools/australian-salary-calculator/',
    highlights: [
      'Interactive 50/30/20 and custom percentage sliders',
      'Supports single or combined household take-home pay',
      'Models irregular quarterly bills alongside weekly spending',
    ],
    sections: [
      {
        title: 'Treat 50/30/20 as a diagnostic baseline, not a rigid law',
        body: 'The classic 50/30/20 guideline allocates 50% of after-tax pay to essential needs, 30% to discretionary wants, and 20% to savings and extra debt repayment. In Australian capital cities—where rent or mortgage payments alone can consume 35% to 45% of take-home income—hitting 50% for all essentials combined is often unrealistic. Using 50/30/20 as a starting diagnostic shows you immediately whether fixed housing and utility costs are crowding out savings, so you can adjust the split to 60/20/20 or 65/15/20 intentionally.',
      },
      {
        title: 'Converting weekly, fortnightly, quarterly, and annual cycles',
        body: 'One of the most common budgeting errors is mixing time horizons: multiplying weekly rent by four instead of 52 divided by 12, or forgetting that fortnightly pay produces 26 paydays a year rather than 24. A workable household budget normalizes every income stream and bill to a true annual cent total first, then projects accurate weekly, fortnightly, and monthly allowances so quarterly electricity, water, and strata bills never catch you short.',
      },
      {
        title: 'From static budget targets to real transaction feedback',
        body: 'Any calculator can divide a paycheck into neat percentages on day one. The real test of a budget happens in week three when groceries run over and car rego falls due. When you move your numbers into PFinance, each category budget sits directly beside the imported receipts and statement transactions that consume it, alerting you when a category reaches 80% of its limit before the period ends.',
      },
    ],
    faqs: [
      {
        question: 'Should I enter gross salary or after-tax take-home pay into the budget calculator?',
        answer: 'Use your after-tax take-home pay (excluding employer superannuation), since that is the cash available to pay rent, bills, groceries, and savings. Use our Australian Salary Calculator first if you only know your gross salary.',
      },
      {
        question: 'Where do minimum debt payments and mortgage repayments belong?',
        answer: 'Minimum required repayments on a mortgage, personal loan, or credit card belong under Needs (Essentials). Voluntary extra repayments above the minimum belong under Savings & Debt Payoff.',
      },
      {
        question: 'How should couples use the budget calculator?',
        answer: 'You can enter your combined household take-home pay to plan shared targets, or check the proportional income split table in the calculator to see each partner’s fair share of shared essentials.',
      },
    ],
    priority: 0.88,
    changeFrequency: 'weekly',
  },
  {
    path: '/tools/wfh-deduction-calculator',
    category: 'tools',
    hubPath: '/tools',
    hubLabel: 'Tools',
    navLabel: 'WFH Deduction Calculator',
    title: 'ATO Working From Home (WFH) Deduction Calculator',
    description: 'Compare the ATO 67c/hr Fixed Rate Method against the Actual Cost Method for working from home deductions, including phone, internet, and electricity.',
    eyebrow: 'WFH calculator',
    heading: 'Compare Fixed Rate vs Actual Cost WFH deductions',
    body: 'Enter your weekly working-from-home hours and monthly phone, internet, and energy costs to see which ATO method produces the larger deduction—and what records you must keep.',
    primaryCta: 'Track deductions in PFinance',
    primaryCtaHref: '/personal/tax/',
    secondaryCta: 'Read the WFH tax guide',
    secondaryCtaHref: '/blog/working-from-home-tax-deductions-guide/',
    highlights: [
      'Side-by-side 67c/hr Fixed Rate vs Actual Cost comparison',
      'Accounts for the mobile & internet bundling rule',
      'Estimates tax refund impact across marginal brackets',
    ],
    sections: [
      {
        title: 'Why the 67c/hr Fixed Rate Method is not always the winner',
        body: 'The ATO Revised Fixed Rate Method (67 cents per hour worked from home) is convenient because it avoids apportioning every electricity and internet bill individually. However, the fixed rate bundles mobile phone usage, home internet, electricity, gas, and stationery into that single hourly figure. If you use your mobile phone and home NBN heavily for work, claiming under the Fixed Rate Method prevents you from claiming your work-related mobile phone or internet bills separately anywhere else on your return.',
      },
      {
        title: 'When the Actual Cost Method yields a larger deduction',
        body: 'Under the Actual Cost Method, you calculate the work-related portion of your mobile phone plan, home internet plan, electricity and gas for your workspace, and computer consumables separately. For employees who work hybrid schedules (for example, two days a week from home) while using a mobile phone 50% or more for work calls and data, the Actual Cost Method frequently produces a substantially larger deduction—provided you retain every bill and a representative four-week usage diary.',
      },
      {
        title: 'Keep records for both methods throughout the year',
        body: 'You do not have to choose between Fixed Rate and Actual Cost on 1 July. If you maintain a contemporaneous log of your working-from-home hours across the financial year and store your monthly phone, internet, and quarterly electricity invoices in PFinance, you can compare both totals at 30 June and use whichever method gives you the better legitimate claim.',
      },
    ],
    faqs: [
      {
        question: 'Can I claim my mobile phone bill separately if I use the 67c/hr Fixed Rate Method?',
        answer: 'No. Under ATO rules for the Revised Fixed Rate Method, mobile and home phone expenses as well as home internet are included inside the hourly rate and cannot be claimed separately under D4 or D5.',
      },
      {
        question: 'Can I still claim depreciation on a desk, monitor, or laptop under the Fixed Rate Method?',
        answer: 'Yes. Decline in value (depreciation) of office furniture and equipment—or an immediate deduction for work items costing $300 or less—can be claimed on top of the 67c/hr fixed rate.',
      },
      {
        question: 'What records are required for the 67c/hr Fixed Rate Method?',
        answer: 'You must keep a contemporaneous record of all hours worked from home across the entire financial year (such as timesheets, rosters, or a diary updated as you work) plus at least one bill for each running expense you incurred.',
      },
    ],
    priority: 0.87,
    changeFrequency: 'weekly',
  },
  {
    path: '/tools/mortgage-offset-calculator',
    category: 'tools',
    hubPath: '/tools',
    hubLabel: 'Tools',
    navLabel: 'Mortgage Offset Calculator',
    title: 'Mortgage Offset & Savings Calculator',
    description: 'Compare cash in a 100% mortgage offset versus a taxable savings account — interest saved, years off the loan, and after-tax returns.',
    eyebrow: 'Offset calculator',
    heading: 'See what your offset balance is really worth',
    body: 'Enter your loan balance, rate, and remaining term alongside the cash you could park in a 100% offset account. Compare tax-free interest savings against the after-tax return of a high-interest savings account.',
    primaryCta: 'Track payoff goals',
    primaryCtaHref: '/personal/goals/',
    secondaryCta: 'Read the offset guide',
    secondaryCtaHref: '/blog/mortgage-offset-vs-high-interest-savings-account-australia/',
    highlights: [
      'Full amortization simulation with and without offset',
      'Years-and-months saved plus total interest difference',
      'After-tax comparison against a HISA at your marginal rate',
    ],
    sections: [
      {
        title: 'Why offset savings are effectively tax-free',
        body: 'Interest earned in a high-interest savings account is assessable income taxed at your marginal rate (including the Medicare levy), so a 4.5% HISA on a 32% marginal rate only nets about 3.06%. Money in a 100% offset account earns nothing directly — instead it stops your lender charging interest on that slice of your loan, which is a guaranteed return equal to your mortgage rate with no tax withheld. When your loan rate exceeds the after-tax HISA rate, offset wins on every dollar.',
      },
      {
        title: 'The compounding effect of paying principal sooner',
        body: 'Every dollar of interest not charged flows straight into principal reduction, which shrinks the interest base for the following month. A persistent offset balance therefore does more than save a flat percentage each year — it shortens the loan by months or years. The calculator simulates the full month-by-month amortization schedule both ways so you can see the real payoff date difference, not just a first-year estimate.',
      },
      {
        title: 'Keep the emergency fund accessible, not redrawn',
        body: 'Unlike extra repayments locked into a loan (subject to redraw rules and minimums), cash in a genuine 100% offset account stays instantly accessible for emergencies, sinking funds, and opportunities. That makes offset the natural home for an emergency buffer while you have a variable-rate mortgage — you get liquidity and the tax-free saving at the same time.',
      },
    ],
    faqs: [
      {
        question: 'Does a partial offset account work the same way?',
        answer: 'Partial offsets only reduce the interest-bearing balance by a percentage of your deposit. The calculator models a 100% offset; if your product is partial, scale the offset balance input accordingly.',
      },
      {
        question: 'Is money in offset still mine to spend?',
        answer: 'Yes. A genuine offset account is a normal transaction account linked to your loan — you can withdraw at any time. The saving stops for whatever you withdraw, but nothing is locked away.',
      },
      {
        question: 'Why compare against after-tax savings interest?',
        answer: 'HISA interest is taxed as income at your marginal rate. Offset savings are not income — they are interest you were never charged — so comparing the offset to the gross HISA rate overstates the savings account.',
      },
    ],
    priority: 0.87,
    changeFrequency: 'weekly',
  },
  {
    path: '/tools/hecs-help-calculator',
    category: 'tools',
    hubPath: '/tools',
    hubLabel: 'Tools',
    navLabel: 'HECS-HELP Calculator',
    title: 'HECS-HELP Repayment & Indexation Calculator',
    description: 'Estimate your compulsory HELP repayment under the 2025–26 marginal rate system, annual 1 June indexation, and your projected year-end balance.',
    eyebrow: 'HECS-HELP calculator',
    heading: 'Estimate your compulsory HELP repayment',
    body: 'From 1 July 2025, HELP repayments are marginal — charged only on repayment income above $67,000. Enter your repayment income and loan balance to see the annual repayment, per-fortnight withholding, and indexation-adjusted year-end balance.',
    primaryCta: 'Set a payoff goal',
    primaryCtaHref: '/personal/goals/',
    secondaryCta: 'Salary sacrifice & HELP guide',
    secondaryCtaHref: '/blog/salary-sacrifice-super-hecs-medicare-australia/',
    highlights: [
      '2025–26 marginal repayment schedule (15c / 17c / 10% tiers)',
      'Per-fortnight withholding estimate for pay-cycle budgeting',
      '1 June indexation projection on your current balance',
    ],
    sections: [
      {
        title: 'How the 2025–26 marginal repayment system works',
        body: 'Compulsory repayments are now calculated only on the slice of repayment income above $67,000 — not on your total income. You pay 15 cents per dollar between $67,001 and $125,000, $8,700 plus 17 cents per dollar between $125,001 and $179,285, and 10% of total repayment income at $179,286 and above. Most holders will see smaller compulsory repayments than under the old percentage-of-total-income table.',
      },
      {
        title: 'Repayment income is wider than taxable income',
        body: 'Repayment income adds back reportable employer super contributions (including salary sacrifice), total reportable fringe benefits, net investment losses, and exempt foreign employment income to your taxable income. If you salary sacrifice into super or package a car, enter the add-back-inclusive figure or the estimate will understate your compulsory repayment.',
      },
      {
        title: 'Indexation lands before repayments credit',
        body: 'On 1 June each year your outstanding balance is indexed by the lower of CPI or WPI, and that uplift applies before the year\'s repayments are credited. Making a voluntary repayment before 1 June reduces the base that indexation is applied to — which is why timing a lump sum just before indexation day saves slightly more than paying after it.',
      },
    ],
    faqs: [
      {
        question: 'What counts as repayment income?',
        answer: 'Taxable income (excluding assessable FHSS released amounts) plus reportable fringe benefits, reportable super contributions, total net investment losses, and exempt foreign employment income.',
      },
      {
        question: 'Do I pay anything if my repayment income is under $67,000?',
        answer: 'No. For 2025–26 the minimum repayment threshold is $67,000, indexed annually in line with average weekly earnings.',
      },
      {
        question: 'Does salary sacrificing into super reduce my HELP repayment?',
        answer: 'No. Reportable super contributions are added back into repayment income, so concessional salary sacrifice does not lower the compulsory repayment — though it still reduces income tax.',
      },
    ],
    priority: 0.86,
    changeFrequency: 'weekly',
  },
  {
    path: '/compare/spreadsheets-vs-finance-app',
    category: 'compare',
    hubPath: '/compare',
    hubLabel: 'Compare',
    navLabel: 'Spreadsheets vs Apps',
    title: 'Spreadsheets vs Finance Apps for Budgeting',
    description: 'An honest comparison of spreadsheet budgeting vs a dedicated personal finance app for receipt capture, household collaboration, and ATO tax records.',
    eyebrow: 'Comparison',
    heading: 'When a spreadsheet stops being enough',
    body: 'Spreadsheets are unbeatable for custom one-off models, but recurring statement imports, shared household balances, and five-year tax receipt retention need a dedicated workflow.',
    primaryCta: 'Try PFinance',
    primaryCtaHref: '/personal/expenses/',
    secondaryCta: 'Read finance guides',
    secondaryCtaHref: '/blog/',
    highlights: [
      'Honest breakdown of where spreadsheets still win',
      'Side-by-side comparison across 6 operational workflows',
      'Built for shared households and ATO receipt evidence',
    ],
    sections: [
      {
        title: 'Where a spreadsheet genuinely wins',
        body: 'Let us be upfront: if you are a single person with one salary, one everyday transaction account, no shared household bills to split, and only a handful of tax deductions each year, a spreadsheet is often the better tool. It is free, never changes its interface, and lets you write any custom formula or 30-year projection you want. You do not need software when a twenty-minute monthly CSV paste answers every question you have.',
      },
      {
        title: 'Where spreadsheets quietly fail in practice',
        body: 'Spreadsheets break down on operational maintenance rather than math. First, a spreadsheet row cannot natively hold a compressed receipt photo alongside a work-use percentage and export a categorized evidence ZIP at tax time. Second, when two partners pay shared household expenses from three different cards, maintaining running "who owes whom" balances in a shared sheet leads to broken formulas and version drift. Third, pasting overlapping bank CSVs without automated fuzzy duplicate detection quickly double-counts expenses.',
      },
      {
        title: 'Use both for what they do best',
        body: 'Choosing PFinance does not mean abandoning spreadsheets for custom modeling. PFinance owns the high-friction operational layer—capturing receipts on your phone, staging and deduplicating bank statements, tracking shared household group balances, and organizing ATO deduction categories D1–D15—and lets you export clean, normalized CSV or JSON data whenever you want to run a custom model in Excel or Google Sheets.',
      },
    ],
    faqs: [
      {
        question: 'Can I export my PFinance records back into a spreadsheet whenever I want?',
        answer: 'Yes. PFinance supports full CSV and JSON exports of your expenses, incomes, and tax deduction schedules so your data is never locked in.',
      },
      {
        question: 'Why not just use a shared Google Sheet with my partner?',
        answer: 'A shared sheet works well for a static bill list, but becomes tedious when tracking variable weekly groceries, unequal percentage splits, receipt attachments, and separating personal spending from household spending.',
      },
      {
        question: 'How does PFinance handle historical data migration from a spreadsheet or bank CSV?',
        answer: 'You can bulk-import historical CSV or PDF statements through our staged import workflow, which normalizes merchant names and flags duplicates before saving.',
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

export function getHubPage(path: '/features' | '/tools' | '/compare'): HubPageData {
  const hub = hubPages.find((item) => item.path === path);
  if (!hub) {
    throw new Error(`Unknown hub page: ${path}`);
  }
  return hub;
}
