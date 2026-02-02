import { Metadata } from 'next';
import Hero from './components/Hero';
import Features from './components/Features';
import Stats from './components/Stats';
import Testimonials from './components/Testimonials';
import Pricing from './components/Pricing';
import CTASection from './components/CTASection';
import {
  OrganizationJsonLd,
  WebsiteJsonLd,
  SoftwareApplicationJsonLd,
} from '@/components/seo/JsonLd';

export const metadata: Metadata = {
  title: 'PFinance - Take Control of Your Personal Finances',
  description: 'Track expenses, manage budgets, and collaborate with your household. Beautiful visualizations, AI-powered insights, and multi-user support.',
  openGraph: {
    title: 'PFinance - Take Control of Your Personal Finances',
    description: 'Track expenses, manage budgets, and collaborate with your household. Beautiful visualizations, AI-powered insights, and multi-user support.',
    type: 'website',
  },
};

export default function LandingPage() {
  return (
    <>
      <OrganizationJsonLd />
      <WebsiteJsonLd />
      <SoftwareApplicationJsonLd />
      <Hero />
      <Features />
      <Stats />
      <Testimonials />
      <Pricing />
      <CTASection />
    </>
  );
}
