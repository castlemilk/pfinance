import type { Metadata } from 'next';
import MarketingInfoPage from '../../components/MarketingInfoPage';
import { SalaryCalculator } from '@/app/components/SalaryCalculator';
import { SoftwareApplicationJsonLd } from '@/components/seo/JsonLd';
import { getDiscoveryPage } from '@/lib/marketing-pages';
import { createSeoMetadata } from '@/lib/seo';

const page = getDiscoveryPage('/tools/australian-salary-calculator');

export const metadata: Metadata = createSeoMetadata({
  title: page.title,
  description: page.description,
  path: page.path,
});

export default function AustralianSalaryCalculatorPage() {
  return (
    <>
      <SoftwareApplicationJsonLd
        name="PFinance Australian Salary Calculator"
        description={page.description}
        applicationCategory="FinanceApplication"
      />
      <MarketingInfoPage page={page}>
        <div className="text-left">
          <SalaryCalculator />
        </div>
      </MarketingInfoPage>
    </>
  );
}
