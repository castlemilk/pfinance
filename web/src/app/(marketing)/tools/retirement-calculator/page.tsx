import type { Metadata } from 'next';
import MarketingInfoPage from '../../components/MarketingInfoPage';
import PublicRetirementCalculator from '@/app/components/retirement-calculator/PublicRetirementCalculator';
import { SoftwareApplicationJsonLd } from '@/components/seo/JsonLd';
import { getDiscoveryPage } from '@/lib/marketing-pages';
import { createSeoMetadata } from '@/lib/seo';

const page = getDiscoveryPage('/tools/retirement-calculator');

export const metadata: Metadata = createSeoMetadata({
  title: page.title,
  description: page.description,
  path: page.path,
});

export default function RetirementCalculatorPage() {
  return (
    <>
      <SoftwareApplicationJsonLd
        name="PFinance Retirement Calculator"
        description={page.description}
        applicationCategory="FinanceApplication"
      />
      <MarketingInfoPage page={page}>
        <PublicRetirementCalculator />
      </MarketingInfoPage>
    </>
  );
}
