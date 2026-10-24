import type { Metadata } from 'next';
import MarketingHubPage from '../components/MarketingHubPage';
import { getHubPage } from '@/lib/marketing-pages';
import { createSeoMetadata } from '@/lib/seo';

const hub = getHubPage('/compare');

export const metadata: Metadata = createSeoMetadata({
  title: hub.title,
  description: hub.description,
  path: hub.path,
});

export default function CompareHubPage() {
  return <MarketingHubPage hub={hub} />;
}
