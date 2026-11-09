import type { Metadata } from 'next';
import MarketingInfoPage from '../../components/MarketingInfoPage';
import PublicCompoundInterestCalculator from '@/app/components/compound-interest-calculator/PublicCompoundInterestCalculator';
import { SoftwareApplicationJsonLd } from '@/components/seo/JsonLd';
import { getDiscoveryPage } from '@/lib/marketing-pages';
import { createSeoMetadata } from '@/lib/seo';

const page = getDiscoveryPage('/tools/compound-interest-calculator');

export const metadata: Metadata = createSeoMetadata({
  title: page.title,
  description: page.description,
  path: page.path,
});

export default function CompoundInterestCalculatorPage() {
  return (
    <>
      <SoftwareApplicationJsonLd
        name="PFinance Compound Interest Calculator"
        description={page.description}
        applicationCategory="FinanceApplication"
      />
      <MarketingInfoPage page={page}>
        <PublicCompoundInterestCalculator />
      </MarketingInfoPage>
    </>
  );
}
