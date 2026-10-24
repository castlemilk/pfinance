import type { Metadata } from 'next';
import MarketingInfoPage from '../../components/MarketingInfoPage';
import PublicRiskProfiler from '@/app/components/risk-profiler/PublicRiskProfiler';
import { SoftwareApplicationJsonLd } from '@/components/seo/JsonLd';
import { getDiscoveryPage } from '@/lib/marketing-pages';
import { createSeoMetadata } from '@/lib/seo';

const page = getDiscoveryPage('/tools/investment-risk-profile');

export const metadata: Metadata = createSeoMetadata({
  title: page.title,
  description: page.description,
  path: page.path,
});

export default function InvestmentRiskProfilePage() {
  return (
    <>
      <SoftwareApplicationJsonLd
        name="PFinance Investment Risk Profiler"
        description={page.description}
        applicationCategory="FinanceApplication"
      />
      <MarketingInfoPage page={page}>
        <PublicRiskProfiler />
      </MarketingInfoPage>
    </>
  );
}
