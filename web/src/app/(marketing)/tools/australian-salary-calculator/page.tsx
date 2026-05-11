import type { Metadata } from 'next';
import MarketingInfoPage from '../../components/MarketingInfoPage';
import { getDiscoveryPage } from '@/lib/marketing-pages';
import { createSeoMetadata } from '@/lib/seo';

const page = getDiscoveryPage('/tools/australian-salary-calculator');

export const metadata: Metadata = createSeoMetadata({
  title: page.title,
  description: page.description,
  path: page.path,
});

export default function AustralianSalaryCalculatorPage() {
  return <MarketingInfoPage page={page} />;
}
