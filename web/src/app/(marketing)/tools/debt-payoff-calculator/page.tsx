import type { Metadata } from 'next';
import MarketingInfoPage from '../../components/MarketingInfoPage';
import PublicDebtPayoffCalculator from '@/app/components/debt-payoff-calculator/PublicDebtPayoffCalculator';
import { SoftwareApplicationJsonLd } from '@/components/seo/JsonLd';
import { getDiscoveryPage } from '@/lib/marketing-pages';
import { createSeoMetadata } from '@/lib/seo';

const page = getDiscoveryPage('/tools/debt-payoff-calculator');

export const metadata: Metadata = createSeoMetadata({
  title: page.title,
  description: page.description,
  path: page.path,
});

export default function DebtPayoffCalculatorPage() {
  return (
    <>
      <SoftwareApplicationJsonLd
        name="PFinance Debt Payoff Calculator"
        description={page.description}
        applicationCategory="FinanceApplication"
      />
      <MarketingInfoPage page={page}>
        <PublicDebtPayoffCalculator />
      </MarketingInfoPage>
    </>
  );
}
