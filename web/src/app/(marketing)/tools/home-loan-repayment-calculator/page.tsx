import type { Metadata } from 'next';
import MarketingInfoPage from '../../components/MarketingInfoPage';
import PublicHomeLoanRepaymentCalculator from '@/app/components/home-loan-repayment-calculator/PublicHomeLoanRepaymentCalculator';
import { SoftwareApplicationJsonLd } from '@/components/seo/JsonLd';
import { getDiscoveryPage } from '@/lib/marketing-pages';
import { createSeoMetadata } from '@/lib/seo';

const page = getDiscoveryPage('/tools/home-loan-repayment-calculator');

export const metadata: Metadata = createSeoMetadata({
  title: page.title,
  description: page.description,
  path: page.path,
});

export default function HomeLoanRepaymentCalculatorPage() {
  return (
    <>
      <SoftwareApplicationJsonLd
        name="PFinance Home Loan Repayment Calculator"
        description={page.description}
        applicationCategory="FinanceApplication"
      />
      <MarketingInfoPage page={page}>
        <PublicHomeLoanRepaymentCalculator />
      </MarketingInfoPage>
    </>
  );
}
