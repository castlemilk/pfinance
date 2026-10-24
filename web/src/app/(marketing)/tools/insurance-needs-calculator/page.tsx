import type { Metadata } from 'next';
import MarketingInfoPage from '../../components/MarketingInfoPage';
import PublicInsuranceNeedsCalculator from '@/app/components/insurance-needs-calculator/PublicInsuranceNeedsCalculator';
import { SoftwareApplicationJsonLd } from '@/components/seo/JsonLd';
import { getDiscoveryPage } from '@/lib/marketing-pages';
import { createSeoMetadata } from '@/lib/seo';

const page = getDiscoveryPage('/tools/insurance-needs-calculator');

export const metadata: Metadata = createSeoMetadata({
  title: page.title,
  description: page.description,
  path: page.path,
});

export default function InsuranceNeedsCalculatorPage() {
  return (
    <>
      <SoftwareApplicationJsonLd
        name="PFinance Insurance Needs Calculator"
        description={page.description}
        applicationCategory="FinanceApplication"
      />
      <MarketingInfoPage page={page}>
        <PublicInsuranceNeedsCalculator />
      </MarketingInfoPage>
    </>
  );
}
