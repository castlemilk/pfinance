import { render } from '@testing-library/react';
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
    const paths = sitemap().map((entry) => new URL(entry.url).pathname);

    expect(paths).toEqual(expect.arrayContaining([
      '/',
      '/blog',
      '/privacy',
      '/terms',
      '/features/receipt-scanner',
      '/features/bank-statement-import',
      '/features/household-budgeting',
      '/features/tax-deductions',
      '/tools/australian-salary-calculator',
      '/tools/budget-calculator',
      '/compare/spreadsheets-vs-finance-app',
    ]));
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

    expect(json.sameAs).toBeUndefined();
  });
});
