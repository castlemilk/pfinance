import type { Metadata } from 'next';
import MarketingInfoPage from '../../components/MarketingInfoPage';
import PublicBorrowingPowerCalculator from '@/app/components/borrowing-power-calculator/PublicBorrowingPowerCalculator';
import { SoftwareApplicationJsonLd } from '@/components/seo/JsonLd';
import { getDiscoveryPage } from '@/lib/marketing-pages';
import { createSeoMetadata } from '@/lib/seo';

const page = getDiscoveryPage('/tools/borrowing-power-calculator');

export const metadata: Metadata = createSeoMetadata({
  title: page.title,
  description: page.description,
  path: page.path,
});

export default function BorrowingPowerCalculatorPage() {
  return (
    <>
      <SoftwareApplicationJsonLd
        name="PFinance Borrowing Power Calculator"
        description={page.description}
        applicationCategory="FinanceApplication"
      />
      <MarketingInfoPage page={page}>
        <PublicBorrowingPowerCalculator />
      </MarketingInfoPage>
    </>
  );
}
