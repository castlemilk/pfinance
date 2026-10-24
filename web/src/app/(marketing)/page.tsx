import { Metadata } from 'next';
import Hero from './components/Hero';
import Features from './components/Features';
import Pricing from './components/Pricing';
import CTASection from './components/CTASection';
import {
  OrganizationJsonLd,
  WebsiteJsonLd,
  SoftwareApplicationJsonLd,
  HowToJsonLd,
} from '@/components/seo/JsonLd';
import { createSeoMetadata } from '@/lib/seo';

export const metadata: Metadata = createSeoMetadata({
  title: 'Personal Finance for Australian Households',
  description: 'Track expenses, budgets, tax deductions, and shared household spending — with an AI assistant, receipt scanning, and free ATO-aware calculators built for Australia.',
  path: '/',
  imageAlt: 'PFinance dashboard and personal finance tools',
});

export default function LandingPage() {
  return (
    <>
      <OrganizationJsonLd />
      <WebsiteJsonLd />
      <SoftwareApplicationJsonLd />
      <HowToJsonLd />
      <Hero />
      <Features />
      <Pricing />
      <CTASection />
    </>
  );
}
