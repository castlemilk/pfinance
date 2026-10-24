import type { Metadata } from 'next';
import MarketingInfoPage from '../../components/MarketingInfoPage';
import PublicWfhCalculator from '@/app/components/wfh-calculator/PublicWfhCalculator';
import { SoftwareApplicationJsonLd } from '@/components/seo/JsonLd';
import { getDiscoveryPage } from '@/lib/marketing-pages';
import { createSeoMetadata } from '@/lib/seo';

const page = getDiscoveryPage('/tools/wfh-deduction-calculator');

export const metadata: Metadata = createSeoMetadata({
  title: page.title,
  description: page.description,
  path: page.path,
});

export default function WfhDeductionCalculatorPage() {
  return (
    <>
      <SoftwareApplicationJsonLd
        name="PFinance ATO Working From Home Deduction Calculator"
        description={page.description}
        applicationCategory="FinanceApplication"
      />
      <MarketingInfoPage page={page}>
        <PublicWfhCalculator />
      </MarketingInfoPage>
    </>
  );
}
