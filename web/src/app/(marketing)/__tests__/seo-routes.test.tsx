import { render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server.node';
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
import {
  OrganizationJsonLd,
  SoftwareApplicationJsonLd,
  WebsiteJsonLd,
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

  it('defines canonical URLs and social images for the core public pages', () => {
    expect(canonicalPath(homeMetadata)).toBe('/');
    expect(serializedOpenGraphImages(homeMetadata)).toContain('/og-image.png');

    expect(canonicalPath(blogMetadata)).toBe('/blog');
    expect(serializedOpenGraphImages(blogMetadata)).toContain('/og-image.png');

    expect(canonicalPath(privacyMetadata)).toBe('/privacy');
    expect(canonicalPath(termsMetadata)).toBe('/terms');
  });

  it('defines discovery metadata for feature, tool, and comparison landing pages', () => {
    const pages = [
      receiptScannerMetadata,
      bankStatementMetadata,
      householdBudgetingMetadata,
      taxDeductionsMetadata,
      salaryCalculatorMetadata,
      budgetCalculatorMetadata,
      spreadsheetComparisonMetadata,
    ];

    for (const metadata of pages) {
      expect(canonicalPath(metadata)).toMatch(/^\/(features|tools|compare)\//);
      expect(metadata.description).toBeTruthy();
      expect(serializedOpenGraphImages(metadata)).toContain('/og-image.png');
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
      '/features/receipt-scanner/',
      '/features/bank-statement-import/',
      '/features/household-budgeting/',
      '/features/tax-deductions/',
      '/tools/australian-salary-calculator/',
      '/tools/budget-calculator/',
      '/compare/spreadsheets-vs-finance-app/',
    ]));
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

  it('does not publish unverifiable ratings by default', () => {
    const { container } = render(<SoftwareApplicationJsonLd />);
    const json = scriptJson(container);

    expect(json.aggregateRating).toBeUndefined();
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
