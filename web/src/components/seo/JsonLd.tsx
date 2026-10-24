interface OrganizationJsonLdProps {
  name?: string;
  url?: string;
  logo?: string;
  description?: string;
  sameAs?: string[];
}

export function OrganizationJsonLd({
  name = 'PFinance',
  url = 'https://pfinance.dev',
  logo = 'https://pfinance.dev/logo.png',
  description = 'Personal finance tracking and budget management application',
  sameAs,
}: OrganizationJsonLdProps) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name,
    url,
    logo,
    description,
    ...(sameAs && sameAs.length > 0 ? { sameAs } : {}),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

interface BlogPostJsonLdProps {
  title: string;
  description: string;
  datePublished: string;
  dateModified?: string;
  authorName: string;
  url: string;
  image?: string;
}

export function BlogPostJsonLd({
  title,
  description,
  datePublished,
  dateModified,
  authorName,
  url,
  image,
}: BlogPostJsonLdProps) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: title,
    description,
    datePublished,
    dateModified: dateModified || datePublished,
    author: {
      '@type': 'Person',
      name: authorName,
    },
    publisher: {
      '@type': 'Organization',
      name: 'PFinance',
      logo: {
        '@type': 'ImageObject',
        url: 'https://pfinance.dev/logo.png',
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
    ...(image && {
      image: {
        '@type': 'ImageObject',
        url: image,
      },
    }),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

interface BreadcrumbJsonLdProps {
  items: Array<{
    name: string;
    url: string;
  }>;
}

export function BreadcrumbJsonLd({ items }: BreadcrumbJsonLdProps) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

interface WebsiteJsonLdProps {
  name?: string;
  url?: string;
  description?: string;
  searchUrlTemplate?: string;
}

export function WebsiteJsonLd({
  name = 'PFinance',
  url = 'https://pfinance.dev',
  description = 'Personal finance tracking and budget management application',
  searchUrlTemplate,
}: WebsiteJsonLdProps) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name,
    url,
    description,
    ...(searchUrlTemplate ? {
      potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: searchUrlTemplate,
      },
      'query-input': 'required name=search_term_string',
      },
    } : {}),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

interface SoftwareApplicationJsonLdProps {
  name?: string;
  description?: string;
  applicationCategory?: string;
  operatingSystem?: string;
  offers?: {
    price: number;
    priceCurrency: string;
  };
  aggregateRating?: {
    ratingValue: string;
    ratingCount: string;
  };
}

export function SoftwareApplicationJsonLd({
  name = 'PFinance',
  description = 'Track expenses, manage budgets, and collaborate with your household.',
  applicationCategory = 'FinanceApplication',
  operatingSystem = 'Web',
  offers = { price: 0, priceCurrency: 'AUD' },
  aggregateRating,
}: SoftwareApplicationJsonLdProps) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name,
    description,
    applicationCategory,
    operatingSystem,
    offers: {
      '@type': 'Offer',
      price: offers.price,
      priceCurrency: offers.priceCurrency,
    },
    ...(aggregateRating ? {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: aggregateRating.ratingValue,
        ratingCount: aggregateRating.ratingCount,
      },
    } : {}),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

interface FAQPageJsonLdProps {
  items: Array<{
    question: string;
    answer: string;
  }>;
}

export function FAQPageJsonLd({ items }: FAQPageJsonLdProps) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

interface HowToJsonLdProps {
  name?: string;
  description?: string;
  steps?: Array<{
    name: string;
    text: string;
  }>;
}

export function HowToJsonLd({
  name = 'How to track household expenses and ATO tax deductions in PFinance',
  description = 'Capture spending from receipts or bank statements, confirm every draft transaction, and export tax-ready deduction evidence at 30 June.',
  steps = [
    {
      name: 'Capture receipts, statements, or plain-English entries',
      text: 'Upload a receipt photo, import a PDF or CSV bank statement, or type a purchase in plain English.',
    },
    {
      name: 'Review and confirm draft transactions',
      text: 'Inspect extracted merchant names, amounts, GST, shared household splits, and ATO deduction categories before saving to your ledger.',
    },
    {
      name: 'Track budgets and export tax evidence at year end',
      text: 'Monitor personal and shared household budgets throughout the year and export deduction schedules with attached receipt evidence for your tax return.',
    },
  ],
}: HowToJsonLdProps) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name,
    description,
    step: steps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: step.name,
      text: step.text,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

interface BlogJsonLdProps {
  name?: string;
  description?: string;
  url?: string;
}

export function BlogJsonLd({
  name = 'PFinance Guides & Personal Finance Blog',
  description = 'Practical Australian personal and household finance guides covering budgeting, receipt retention, shared expenses, and tax-ready record keeping.',
  url = 'https://pfinance.dev/blog/',
}: BlogJsonLdProps) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name,
    description,
    url,
    publisher: {
      '@type': 'Organization',
      name: 'PFinance',
      url: 'https://pfinance.dev',
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
