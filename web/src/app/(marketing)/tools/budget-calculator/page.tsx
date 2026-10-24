import type { Metadata } from 'next';
import MarketingInfoPage from '../../components/MarketingInfoPage';
import PublicBudgetCalculator from '@/app/components/budget-calculator/PublicBudgetCalculator';
import { SoftwareApplicationJsonLd } from '@/components/seo/JsonLd';
import { getDiscoveryPage } from '@/lib/marketing-pages';
import { createSeoMetadata } from '@/lib/seo';

const page = getDiscoveryPage('/tools/budget-calculator');

export const metadata: Metadata = createSeoMetadata({
  title: page.title,
  description: page.description,
  path: page.path,
});

export default function BudgetCalculatorPage() {
  return (
    <>
      <SoftwareApplicationJsonLd
        name="PFinance Household Budget Calculator"
        description={page.description}
        applicationCategory="FinanceApplication"
      />
      <MarketingInfoPage page={page}>
        <PublicBudgetCalculator />
      </MarketingInfoPage>
    </>
  );
}
