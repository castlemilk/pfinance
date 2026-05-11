import type { Metadata } from 'next';
import MarketingInfoPage from '../../components/MarketingInfoPage';
import { getDiscoveryPage } from '@/lib/marketing-pages';
import { createSeoMetadata } from '@/lib/seo';

const page = getDiscoveryPage('/features/tax-deductions');

export const metadata: Metadata = createSeoMetadata({
  title: page.title,
  description: page.description,
  path: page.path,
});

export default function TaxDeductionsPage() {
  return <MarketingInfoPage page={page} />;
}
