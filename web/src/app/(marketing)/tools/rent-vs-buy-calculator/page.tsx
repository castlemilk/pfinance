import type { Metadata } from 'next';
import MarketingInfoPage from '../../components/MarketingInfoPage';
import PublicRentVsBuy from '@/app/components/rent-vs-buy/PublicRentVsBuy';
import { SoftwareApplicationJsonLd } from '@/components/seo/JsonLd';
import { getDiscoveryPage } from '@/lib/marketing-pages';
import { createSeoMetadata } from '@/lib/seo';

const page = getDiscoveryPage('/tools/rent-vs-buy-calculator');

export const metadata: Metadata = createSeoMetadata({
  title: page.title,
  description: page.description,
  path: page.path,
});

export default function RentVsBuyCalculatorPage() {
  return (
    <>
      <SoftwareApplicationJsonLd
        name="PFinance Rent vs Buy Calculator"
        description={page.description}
        applicationCategory="FinanceApplication"
      />
      <MarketingInfoPage page={page}>
        <PublicRentVsBuy />
      </MarketingInfoPage>
    </>
  );
}
