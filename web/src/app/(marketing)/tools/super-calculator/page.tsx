import type { Metadata } from 'next';
import SuperCalculator from '@/app/components/super-calculator/SuperCalculator';
import { BreadcrumbJsonLd, SoftwareApplicationJsonLd } from '@/components/seo/JsonLd';
import { createSeoMetadata, getSiteUrl } from '@/lib/seo';

export const metadata: Metadata = createSeoMetadata({
  title: 'Super Calculator and Growth Estimator',
  description: 'Project your super balance using your starting balance, average annual contributions, assumed return and time horizon. Explore an illustrative year-by-year estimate.',
  path: '/tools/super-calculator',
});

export default function SuperCalculatorPage() {
  const siteUrl = getSiteUrl().replace(/\/$/, '');
  return (
    <div className="container mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <SoftwareApplicationJsonLd
        name="PFinance Super Calculator and Growth Estimator"
        description="Project your Australian superannuation balance using your starting balance, average annual contributions, assumed return, and time horizon."
        applicationCategory="FinanceApplication"
      />
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', url: `${siteUrl}/` },
          { name: 'Tools', url: `${siteUrl}/tools/` },
          { name: 'Super Calculator and Growth Estimator', url: `${siteUrl}/tools/super-calculator/` },
        ]}
      />
      <h1 className="mb-3 text-3xl font-bold tracking-tight sm:text-4xl">Super calculator &amp; estimator</h1>
      <p className="mb-8 max-w-2xl text-muted-foreground">
        Make the assumptions yours. See contributions and investment growth separately, with no sign-in required.
      </p>
      <SuperCalculator />
    </div>
  );
}
