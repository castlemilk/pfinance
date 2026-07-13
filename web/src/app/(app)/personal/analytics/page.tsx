import { AnalyticsWorkspace } from '@/app/components/analytics/AnalyticsWorkspace';

export default function AnalyticsPage() {
  return <AnalyticsWorkspace scope={{ kind: 'personal' }} />;
}
