import type { Metadata } from 'next';
import MarketingInfoPage from '../../components/MarketingInfoPage';
import { getDiscoveryPage } from '@/lib/marketing-pages';
import { createSeoMetadata } from '@/lib/seo';

const page = getDiscoveryPage('/features/receipt-scanner');

export const metadata: Metadata = createSeoMetadata({
  title: page.title,
  description: page.description,
  path: page.path,
});

export default function ReceiptScannerPage() {
  return <MarketingInfoPage page={page} />;
}
