import type { Metadata } from 'next';
import MarketingInfoPage from '../../components/MarketingInfoPage';
import PublicCgtCalculator from '@/app/components/cgt-calculator/PublicCgtCalculator';
import { SoftwareApplicationJsonLd } from '@/components/seo/JsonLd';
import { getDiscoveryPage } from '@/lib/marketing-pages';
import { createSeoMetadata } from '@/lib/seo';

const page = getDiscoveryPage('/tools/cgt-calculator');

export const metadata: Metadata = createSeoMetadata({
  title: page.title,
  description: page.description,
  path: page.path,
});

export default function CgtCalculatorPage() {
  return (
    <>
      <SoftwareApplicationJsonLd
        name="PFinance CGT Calculator"
        description={page.description}
        applicationCategory="FinanceApplication"
      />
      <MarketingInfoPage page={page}>
        <PublicCgtCalculator />
      </MarketingInfoPage>
    </>
  );
}
