import type { Metadata } from 'next';
import MarketingInfoPage from '../../components/MarketingInfoPage';
import PublicHecsHelpCalculator from '@/app/components/hecs-help-calculator/PublicHecsHelpCalculator';
import { SoftwareApplicationJsonLd } from '@/components/seo/JsonLd';
import { getDiscoveryPage } from '@/lib/marketing-pages';
import { createSeoMetadata } from '@/lib/seo';

const page = getDiscoveryPage('/tools/hecs-help-calculator');

export const metadata: Metadata = createSeoMetadata({
  title: page.title,
  description: page.description,
  path: page.path,
});

export default function HecsHelpCalculatorPage() {
  return (
    <>
      <SoftwareApplicationJsonLd
        name="PFinance HECS-HELP Repayment Calculator"
        description={page.description}
        applicationCategory="FinanceApplication"
      />
      <MarketingInfoPage page={page}>
        <PublicHecsHelpCalculator />
      </MarketingInfoPage>
    </>
  );
}
