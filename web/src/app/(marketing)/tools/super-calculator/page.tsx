import type { Metadata } from 'next';
import SuperCalculator from '@/app/components/super-calculator/SuperCalculator';
import { createSeoMetadata } from '@/lib/seo';

export const metadata: Metadata = createSeoMetadata({
  title: 'Super Calculator and Growth Estimator',
  description: 'Project your super balance using your starting balance, average annual contributions, assumed return and time horizon. Explore an illustrative year-by-year estimate.',
  path: '/tools/super-calculator',
});

export default function SuperCalculatorPage() {
  return <div className="container mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16"><h1 className="mb-3 text-3xl font-bold tracking-tight sm:text-4xl">Super calculator &amp; estimator</h1><p className="mb-8 max-w-2xl text-muted-foreground">Make the assumptions yours. See contributions and investment growth separately, with no sign-in required.</p><SuperCalculator /></div>;
}
