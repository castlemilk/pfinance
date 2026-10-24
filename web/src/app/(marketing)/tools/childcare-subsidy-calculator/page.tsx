import type { Metadata } from 'next';
import MarketingInfoPage from '../../components/MarketingInfoPage';
import PublicCcsEstimator from '@/app/components/ccs-estimator/PublicCcsEstimator';
import { SoftwareApplicationJsonLd } from '@/components/seo/JsonLd';
import { getDiscoveryPage } from '@/lib/marketing-pages';
import { createSeoMetadata } from '@/lib/seo';

const page = getDiscoveryPage('/tools/childcare-subsidy-calculator');

export const metadata: Metadata = createSeoMetadata({
  title: page.title,
  description: page.description,
  path: page.path,
});

export default function ChildcareSubsidyCalculatorPage() {
  return (
    <>
      <SoftwareApplicationJsonLd
        name="PFinance Child Care Subsidy Calculator"
        description={page.description}
        applicationCategory="FinanceApplication"
      />
      <MarketingInfoPage page={page}>
        <PublicCcsEstimator />
      </MarketingInfoPage>
    </>
  );
}
