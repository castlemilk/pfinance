import { render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server.node';
import fs from 'node:fs';
import path from 'node:path';
import LandingPage from '../page';
import robots from '@/app/robots';
import sitemap from '@/app/sitemap';
import { metadata as rootMetadata } from '@/app/layout';
import { metadata as homeMetadata } from '../page';
import { metadata as blogMetadata } from '../blog/page';
import { metadata as privacyMetadata } from '../privacy/page';
import { metadata as termsMetadata } from '../terms/page';
import { metadata as receiptScannerMetadata } from '../features/receipt-scanner/page';
import { metadata as bankStatementMetadata } from '../features/bank-statement-import/page';
import { metadata as householdBudgetingMetadata } from '../features/household-budgeting/page';
import { metadata as taxDeductionsMetadata } from '../features/tax-deductions/page';
import { metadata as salaryCalculatorMetadata } from '../tools/australian-salary-calculator/page';
import { metadata as budgetCalculatorMetadata } from '../tools/budget-calculator/page';
import { metadata as spreadsheetComparisonMetadata } from '../compare/spreadsheets-vs-finance-app/page';
import { metadata as featuresHubMetadata } from '../features/page';
import { metadata as toolsHubMetadata } from '../tools/page';
import { metadata as compareHubMetadata } from '../compare/page';
import FeaturesHubPage from '../features/page';
import ToolsHubPage from '../tools/page';
import CompareHubPage from '../compare/page';
import TaxDeductionsPage from '../features/tax-deductions/page';
import BudgetCalculatorPage from '../tools/budget-calculator/page';
import AustralianSalaryCalculatorPage from '../tools/australian-salary-calculator/page';
import WfhDeductionCalculatorPage, { metadata as wfhCalculatorMetadata } from '../tools/wfh-deduction-calculator/page';
import MortgageOffsetCalculatorPage, { metadata as mortgageOffsetMetadata } from '../tools/mortgage-offset-calculator/page';
import HecsHelpCalculatorPage, { metadata as hecsHelpMetadata } from '../tools/hecs-help-calculator/page';
import DebtPayoffCalculatorPage, { metadata as debtPayoffMetadata } from '../tools/debt-payoff-calculator/page';
import InsuranceNeedsCalculatorPage, { metadata as insuranceNeedsMetadata } from '../tools/insurance-needs-calculator/page';
import CgtCalculatorPage, { metadata as cgtMetadata } from '../tools/cgt-calculator/page';
import BorrowingPowerCalculatorPage, { metadata as borrowingPowerMetadata } from '../tools/borrowing-power-calculator/page';
import InvestmentRiskProfilePage, { metadata as riskProfileMetadata } from '../tools/investment-risk-profile/page';
import BlogPage from '../blog/page';
import { buildRssFeedXml } from '@/lib/rss';
import Footer, { footerLinks } from '../components/Footer';
import { discoveryPages, hubPages } from '@/lib/marketing-pages';
import { getAllPosts, extractTocHeadings } from '@/lib/blog';
import {
  OrganizationJsonLd,
  SoftwareApplicationJsonLd,
  WebsiteJsonLd,
  FAQPageJsonLd,
  HowToJsonLd,
  BlogJsonLd,
} from '@/components/seo/JsonLd';

const publicOrigin = 'https://pfinance.dev';

jest.mock('next/dynamic', () => () => () => null);
jest.mock('react-rough-notation', () => ({
  RoughNotation: ({ children }: { children: React.ReactNode }) => children,
}));

function canonicalPath(metadata: typeof homeMetadata): string | undefined {
  return metadata.alternates?.canonical?.toString();
}

function serializedOpenGraphImages(metadata: typeof homeMetadata): string {
  return JSON.stringify(metadata.openGraph?.images ?? []);
}

function scriptJson(container: HTMLElement): Record<string, unknown> {
  const script = container.querySelector('script[type="application/ld+json"]');
  if (!script) {
    throw new Error('JSON-LD script not rendered');
  }
  return JSON.parse(script.innerHTML);
}

describe('marketing SEO routes', () => {
  it('does not force every route to use the home page canonical', () => {
    expect(rootMetadata.alternates?.canonical).toBeUndefined();
    expect(rootMetadata.metadataBase?.toString()).toBe(`${publicOrigin}/`);
  });

  it('defines canonical URLs and leaves OG images to the file convention', () => {
    expect(canonicalPath(homeMetadata)).toBe('/');
    expect(serializedOpenGraphImages(homeMetadata)).not.toContain('/og-image.png');

    expect(canonicalPath(blogMetadata)).toBe('/blog');
    expect(serializedOpenGraphImages(blogMetadata)).not.toContain('/og-image.png');

    expect(canonicalPath(privacyMetadata)).toBe('/privacy');
    expect(canonicalPath(termsMetadata)).toBe('/terms');
  });

  it('provides a generated opengraph-image route for every public marketing page', () => {
    const marketingDir = path.join(__dirname, '..');
    const appDir = path.join(__dirname, '..', '..');

    expect(fs.existsSync(path.join(appDir, 'opengraph-image.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(marketingDir, 'opengraph-image.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(marketingDir, 'blog', 'opengraph-image.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(marketingDir, 'blog', '[slug]', 'opengraph-image.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(marketingDir, 'tools', 'super-calculator', 'opengraph-image.tsx'))).toBe(true);

    for (const page of [...discoveryPages, ...hubPages]) {
      const ogFile = path.join(marketingDir, page.path, 'opengraph-image.tsx');
      expect({ path: page.path, exists: fs.existsSync(ogFile) }).toEqual({ path: page.path, exists: true });
    }
  });

  it('defines discovery metadata for feature, tool, and comparison landing pages', () => {
    const pages = [
      receiptScannerMetadata,
      bankStatementMetadata,
      householdBudgetingMetadata,
      taxDeductionsMetadata,
      salaryCalculatorMetadata,
      budgetCalculatorMetadata,
      wfhCalculatorMetadata,
      mortgageOffsetMetadata,
      hecsHelpMetadata,
      debtPayoffMetadata,
      insuranceNeedsMetadata,
      cgtMetadata,
      borrowingPowerMetadata,
      riskProfileMetadata,
      spreadsheetComparisonMetadata,
    ];

    for (const metadata of pages) {
      expect(canonicalPath(metadata)).toMatch(/^\/(features|tools|compare)\//);
      expect(metadata.description).toBeTruthy();
      expect(serializedOpenGraphImages(metadata)).not.toContain('/og-image.png');
    }
  });

  it('includes every public discovery page in the sitemap', () => {
    const entries = sitemap();
    const paths = entries.map((entry) => new URL(entry.url).pathname);
    const origins = new Set(entries.map((entry) => new URL(entry.url).origin));

    expect(origins).toEqual(new Set([publicOrigin]));
    expect(paths).toEqual(expect.arrayContaining([
      '/',
      '/blog/',
      '/privacy/',
      '/terms/',
      '/features/',
      '/tools/',
      '/compare/',
      '/features/receipt-scanner/',
      '/features/bank-statement-import/',
      '/features/household-budgeting/',
      '/features/tax-deductions/',
      '/tools/australian-salary-calculator/',
      '/tools/budget-calculator/',
      '/tools/super-calculator/',
      '/tools/wfh-deduction-calculator/',
      '/tools/mortgage-offset-calculator/',
      '/tools/hecs-help-calculator/',
      '/compare/spreadsheets-vs-finance-app/',
    ]));
  });

  it('defines metadata and substantive content for all three hub pages', () => {
    expect(canonicalPath(featuresHubMetadata)).toBe('/features');
    expect(canonicalPath(toolsHubMetadata)).toBe('/tools');
    expect(canonicalPath(compareHubMetadata)).toBe('/compare');

    for (const HubComponent of [FeaturesHubPage, ToolsHubPage, CompareHubPage]) {
      const html = renderToStaticMarkup(<HubComponent />);
      const body = new DOMParser().parseFromString(html, 'text/html').body;
      const wordCount = (body.textContent || '').trim().split(/\s+/).length;
      expect(wordCount).toBeGreaterThanOrEqual(200);
      expect(body.querySelectorAll('h1')).toHaveLength(1);
    }
  });

  it('links every discovery page, hub, and calculator in the footer with trailing slashes', () => {
    const allHrefs = [
      ...footerLinks.product.map((l) => l.href),
      ...footerLinks.resources.map((l) => l.href),
      ...footerLinks.legal.map((l) => l.href),
    ];

    for (const page of discoveryPages) {
      expect(allHrefs).toContain(`${page.path}/`);
    }
    for (const hub of hubPages) {
      expect(allHrefs).toContain(`${hub.path}/`);
    }
    expect(allHrefs).toContain('/tools/super-calculator/');

    for (const href of allHrefs) {
      if (!href.includes('#')) {
        expect(href.endsWith('/')).toBe(true);
      }
    }

    const { container } = render(<Footer />);
    expect(container.textContent).toContain('Tax Deductions');
    expect(container.textContent).toContain('Super Calculator & Estimator');
  });

  it('renders substantive content, FAQ schema, and breadcrumbs on discovery pages', () => {
    const html = renderToStaticMarkup(<TaxDeductionsPage />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const wordCount = (doc.body.textContent || '').trim().split(/\s+/).length;
    expect(wordCount).toBeGreaterThanOrEqual(350);

    const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]')).map((el) =>
      JSON.parse(el.innerHTML)
    );
    const types = scripts.map((s) => s['@type']);
    expect(types).toEqual(expect.arrayContaining(['BreadcrumbList', 'FAQPage']));
  });

  it('mounts the interactive budget calculator on /tools/budget-calculator/', () => {
    const html = renderToStaticMarkup(<BudgetCalculatorPage />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.body.textContent).toContain('Interactive household budget calculator');
    expect(doc.querySelector('[data-testid="budget-needs-monthly"]')?.textContent).toContain('$3,250');
  });

  it('mounts the interactive Australian salary calculator on /tools/australian-salary-calculator/ without requiring auth or finance providers', () => {
    const html = renderToStaticMarkup(<AustralianSalaryCalculatorPage />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.body.textContent).toContain('Gross Salary');
    expect(doc.body.textContent).toContain('Pay Cycle');
    expect(doc.querySelectorAll('h1')).toHaveLength(1);
  });

  it('mounts the interactive ATO WFH deduction calculator on /tools/wfh-deduction-calculator/', () => {
    expect(canonicalPath(wfhCalculatorMetadata)).toBe('/tools/wfh-deduction-calculator');
    const html = renderToStaticMarkup(<WfhDeductionCalculatorPage />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.body.textContent).toContain('Interactive WFH deduction comparison calculator');
    expect(doc.querySelector('[data-testid="wfh-recommended-method"]')?.textContent).toContain('Actual Cost Method');
    expect(doc.querySelectorAll('h1')).toHaveLength(1);
  });

  it('mounts the interactive mortgage offset calculator on /tools/mortgage-offset-calculator/', () => {
    expect(canonicalPath(mortgageOffsetMetadata)).toBe('/tools/mortgage-offset-calculator');
    const html = renderToStaticMarkup(<MortgageOffsetCalculatorPage />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.body.textContent).toContain('Interactive mortgage offset calculator');
    expect(doc.querySelector('[data-testid="offset-interest-saved"]')?.textContent).toContain('$');
    expect(doc.querySelector('[data-testid="offset-effective-rate"]')?.textContent).toContain('5.90%');
    expect(doc.querySelectorAll('h1')).toHaveLength(1);
  });

  it('mounts the interactive HECS-HELP calculator on /tools/hecs-help-calculator/', () => {
    expect(canonicalPath(hecsHelpMetadata)).toBe('/tools/hecs-help-calculator');
    const html = renderToStaticMarkup(<HecsHelpCalculatorPage />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.body.textContent).toContain('Interactive HECS-HELP repayment estimator');
    // $85,000 repayment income -> 15c x $18,000 = $2,700 compulsory
    expect(doc.querySelector('[data-testid="hecs-compulsory-repayment"]')?.textContent).toContain('$2,700');
    expect(doc.querySelectorAll('h1')).toHaveLength(1);
  });

  it('mounts the interactive debt payoff calculator on /tools/debt-payoff-calculator/', () => {
    expect(canonicalPath(debtPayoffMetadata)).toBe('/tools/debt-payoff-calculator');
    const html = renderToStaticMarkup(<DebtPayoffCalculatorPage />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.body.textContent).toContain('Interactive debt payoff calculator');
    expect(doc.body.textContent).toContain('Debt-free in');
    expect(doc.querySelector('[data-testid="debt-avalanche-interest"]')?.textContent).toContain('$');
    expect(doc.querySelector('[data-testid="debt-snowball-interest"]')?.textContent).toContain('$');
    expect(doc.querySelectorAll('h1')).toHaveLength(1);
  });

  it('mounts the interactive insurance needs calculator on /tools/insurance-needs-calculator/', () => {
    expect(canonicalPath(insuranceNeedsMetadata)).toBe('/tools/insurance-needs-calculator');
    const html = renderToStaticMarkup(<InsuranceNeedsCalculatorPage />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.body.textContent).toContain('Interactive insurance needs calculator');
    // $95k income x 10yrs x 70% + $480k debts + $80k costs − $245k resources = $980,000
    expect(doc.querySelector('[data-testid="insurance-life-cover"]')?.textContent).toContain('$980,000');
    expect(doc.querySelector('[data-testid="insurance-ip-benefit"]')?.textContent).toContain('$5,542');
    expect(doc.querySelectorAll('h1')).toHaveLength(1);
  });

  it('mounts the interactive CGT calculator on /tools/cgt-calculator/', () => {
    expect(canonicalPath(cgtMetadata)).toBe('/tools/cgt-calculator');
    const html = renderToStaticMarkup(<CgtCalculatorPage />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.body.textContent).toContain('Interactive capital gains tax calculator');
    // $140k gain, held 30mo -> 50% discount -> $70k taxable at 39% (30%+2% Medicare on $95k+$70k) = $27,300
    expect(doc.querySelector('[data-testid="cgt-taxable"]')?.textContent).toContain('$70,000');
    expect(doc.querySelector('[data-testid="cgt-gross"]')?.textContent).toContain('$140,000');
    expect(doc.querySelectorAll('h1')).toHaveLength(1);
  });

  it('mounts the interactive borrowing power estimator on /tools/borrowing-power-calculator/', () => {
    expect(canonicalPath(borrowingPowerMetadata)).toBe('/tools/borrowing-power-calculator');
    const html = renderToStaticMarkup(<BorrowingPowerCalculatorPage />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.body.textContent).toContain('Interactive borrowing power estimator');
    expect(doc.body.textContent).toContain('maximum property price');
    expect(doc.querySelector('[data-testid="borrowing-repayment"]')?.textContent).toContain('$');
    expect(doc.querySelectorAll('h1')).toHaveLength(1);
  });

  it('mounts the interactive risk profile quiz on /tools/investment-risk-profile/', () => {
    expect(canonicalPath(riskProfileMetadata)).toBe('/tools/investment-risk-profile');
    const html = renderToStaticMarkup(<InvestmentRiskProfilePage />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.body.textContent).toContain('Interactive risk profile quiz');
    expect(doc.body.textContent).toContain('When will you need the money?');
    expect(doc.body.textContent).toContain('Answer the five questions');
    expect(doc.querySelectorAll('h1')).toHaveLength(1);
  });

  it('serves a valid RSS 2.0 feed at /feed.xml and extracts blog TOC headings', () => {
    const xml = buildRssFeedXml();
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain('https://pfinance.dev/blog/keep-track-of-expenses-for-taxes-australia/');

    const toc = extractTocHeadings('## Section One\n### Sub A\n## Section Two');
    expect(toc).toEqual([
      { id: 'section-one', text: 'Section One', level: 2 },
      { id: 'sub-a', text: 'Sub A', level: 3 },
      { id: 'section-two', text: 'Section Two', level: 2 },
    ]);
  });

  it('publishes all blog guides in the sitemap and renders them on the blog index', () => {
    const posts = getAllPosts();
    expect(posts.length).toBeGreaterThanOrEqual(11);

    const sitemapPaths = sitemap().map((entry) => new URL(entry.url).pathname);
    for (const post of posts) {
      expect(sitemapPaths).toContain(`/blog/${post.slug}/`);
    }

    const html = renderToStaticMarkup(<BlogPage />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    for (const post of posts) {
      expect(doc.body.textContent).toContain(post.title);
    }
  });

  it('points robots.txt at the public sitemap domain', () => {
    expect(robots().sitemap).toBe(`${publicOrigin}/sitemap.xml`);
  });

  it('publishes canonical sitemap paths and preserves the public super calculator', () => {
    const entries = sitemap();
    expect(entries.some((entry) => entry.url === `${publicOrigin}/tools/super-calculator/`)).toBe(true);
    for (const entry of entries) {
      expect(new URL(entry.url).pathname.endsWith('/')).toBe(true);
      expect(entry.url).not.toContain('dev//');
      expect(new URL(entry.url).pathname).not.toMatch(/^\/(personal|shared|auth|admin|api)\//);
    }
  });

  it('normalises a configured site origin with a trailing slash', () => {
    const previous = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = `${publicOrigin}/`;
    try {
      for (const entry of sitemap()) expect(entry.url).not.toContain('dev//');
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
      else process.env.NEXT_PUBLIC_SITE_URL = previous;
    }
  });

  it('does not invent build-time lastmod dates for static pages', () => {
    for (const entry of sitemap()) {
      if (!new URL(entry.url).pathname.startsWith('/blog/') || entry.url.endsWith('/blog/')) {
        expect(entry.lastModified).toBeUndefined();
      } else {
        expect(entry.lastModified).toBeInstanceOf(Date);
        expect(Number.isNaN(new Date(entry.lastModified!).getTime())).toBe(false);
      }
    }
  });

  it('lets crawlers render public assets while keeping private paths blocked', () => {
    const rules = robots().rules;
    const rule = Array.isArray(rules) ? rules[0] : rules;
    const list = (value?: string | string[]) => typeof value === 'string' ? [value] : value ?? [];
    const allows = (pathname: string) => {
      const permitted = Math.max(0, ...list(rule.allow).filter((prefix) => pathname.startsWith(prefix)).map((prefix) => prefix.length));
      const blocked = Math.max(-1, ...list(rule.disallow).filter((prefix) => pathname.startsWith(prefix)).map((prefix) => prefix.length));
      return permitted >= blocked;
    };
    expect(allows('/_next/static/chunks/app.js')).toBe(true);
    expect(allows('/_next/image?url=%2Flogo.png&w=64&q=75')).toBe(true);
    expect(allows('/_next/image/?url=%2Flogo.png&w=64&q=75')).toBe(true);
    for (const pathname of ['/personal/expenses/', '/shared/groups/', '/auth/', '/admin/', '/api/process-document/', '/_next/data/private.json']) {
      expect(allows(pathname)).toBe(false);
    }
  });

  it('does not present invented endorsements or usage counts on the landing page', () => {
    const html = renderToStaticMarkup(<LandingPage />);
    const container = new DOMParser().parseFromString(html, 'text/html').body;
    expect(container.textContent).not.toMatch(/thousands|1,000\+|Transactions Tracked|User Rating|Average satisfaction|99\.9%/i);
    expect(container.querySelector('img[src*="pravatar"]')).toBeNull();
    expect(container.textContent).toContain('Track expenses');
    expect(container.textContent).toContain('Expense Tracking');
  });
});

describe('marketing JSON-LD trust signals', () => {
  it('does not advertise unavailable site search', () => {
    const { container } = render(<WebsiteJsonLd />);
    const json = scriptJson(container);

    expect(json.potentialAction).toBeUndefined();
  });

  it('does not publish unverifiable ratings by default and uses AUD currency', () => {
    const { container } = render(<SoftwareApplicationJsonLd />);
    const json = scriptJson(container);

    expect(json.aggregateRating).toBeUndefined();
    expect((json.offers as { priceCurrency?: string })?.priceCurrency).toBe('AUD');
  });

  it('renders FAQPage, HowTo, and Blog structured data schemas', () => {
    const { container: faqContainer } = render(
      <FAQPageJsonLd items={[{ question: 'Q1?', answer: 'A1.' }]} />
    );
    expect(scriptJson(faqContainer)['@type']).toBe('FAQPage');

    const { container: howToContainer } = render(<HowToJsonLd />);
    expect(scriptJson(howToContainer)['@type']).toBe('HowTo');

    const { container: blogContainer } = render(<BlogJsonLd />);
    expect(scriptJson(blogContainer)['@type']).toBe('Blog');
  });

  it('does not publish placeholder social profiles', () => {
    const { container } = render(<OrganizationJsonLd />);
    const json = scriptJson(container);

    expect(json.url).toBe(publicOrigin);
    expect(json.sameAs).toBeUndefined();
  });

  it('uses the production domain for website JSON-LD by default', () => {
    const { container } = render(<WebsiteJsonLd />);
    const json = scriptJson(container);

    expect(json.url).toBe(publicOrigin);
  });
});
