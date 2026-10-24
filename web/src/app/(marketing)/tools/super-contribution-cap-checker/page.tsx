import type { Metadata } from 'next';
import MarketingInfoPage from '../../components/MarketingInfoPage';
import PublicSuperCapsChecker from '@/app/components/super-caps-checker/PublicSuperCapsChecker';
import { SoftwareApplicationJsonLd } from '@/components/seo/JsonLd';
import { getDiscoveryPage } from '@/lib/marketing-pages';
import { createSeoMetadata } from '@/lib/seo';

const page = getDiscoveryPage('/tools/super-contribution-cap-checker');

export const metadata: Metadata = createSeoMetadata({
  title: page.title,
  description: page.description,
  path: page.path,
});

export default function SuperContributionCapCheckerPage() {
  return (
    <>
      <SoftwareApplicationJsonLd
        name="PFinance Super Contribution Cap Checker"
        description={page.description}
        applicationCategory="FinanceApplication"
      />
      <MarketingInfoPage page={page}>
        <PublicSuperCapsChecker />
      </MarketingInfoPage>
    </>
  );
}
