import type { Metadata } from 'next';
import MarketingInfoPage from '../../components/MarketingInfoPage';
import PublicMortgageOffsetCalculator from '@/app/components/mortgage-offset-calculator/PublicMortgageOffsetCalculator';
import { SoftwareApplicationJsonLd } from '@/components/seo/JsonLd';
import { getDiscoveryPage } from '@/lib/marketing-pages';
import { createSeoMetadata } from '@/lib/seo';

const page = getDiscoveryPage('/tools/mortgage-offset-calculator');

export const metadata: Metadata = createSeoMetadata({
  title: page.title,
  description: page.description,
  path: page.path,
});

export default function MortgageOffsetCalculatorPage() {
  return (
    <>
      <SoftwareApplicationJsonLd
        name="PFinance Mortgage Offset Calculator"
        description={page.description}
        applicationCategory="FinanceApplication"
      />
      <MarketingInfoPage page={page}>
        <PublicMortgageOffsetCalculator />
      </MarketingInfoPage>
    </>
  );
}
