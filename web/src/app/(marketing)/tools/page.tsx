import type { Metadata } from 'next';
import MarketingHubPage from '../components/MarketingHubPage';
import { getHubPage } from '@/lib/marketing-pages';
import { createSeoMetadata } from '@/lib/seo';

const hub = getHubPage('/tools');

export const metadata: Metadata = createSeoMetadata({
  title: hub.title,
  description: hub.description,
  path: hub.path,
});

export default function ToolsHubPage() {
  return (
    <MarketingHubPage
      hub={hub}
      extraSpokes={[
        {
          path: '/tools/super-calculator/',
          navLabel: 'Super Calculator & Estimator',
          eyebrow: 'Superannuation',
          description: 'Project your superannuation balance using your starting balance, average annual contributions, assumed return, and time horizon.',
        },
      ]}
    />
  );
}
