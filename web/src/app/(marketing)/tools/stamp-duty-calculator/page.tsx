import type { Metadata } from 'next';
import MarketingInfoPage from '../../components/MarketingInfoPage';
import PublicStampDutyCalculator from '@/app/components/stamp-duty-calculator/PublicStampDutyCalculator';
import { SoftwareApplicationJsonLd } from '@/components/seo/JsonLd';
import { getDiscoveryPage } from '@/lib/marketing-pages';
import { createSeoMetadata } from '@/lib/seo';

const page = getDiscoveryPage('/tools/stamp-duty-calculator');

export const metadata: Metadata = createSeoMetadata({
  title: page.title,
  description: page.description,
  path: page.path,
});

export default function StampDutyCalculatorPage() {
  return (
    <>
      <SoftwareApplicationJsonLd
        name="PFinance Stamp Duty Calculator"
        description={page.description}
        applicationCategory="FinanceApplication"
      />
      <MarketingInfoPage page={page}>
        <PublicStampDutyCalculator />
      </MarketingInfoPage>
    </>
  );
}
