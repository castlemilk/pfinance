import type { Metadata } from 'next';
import Link from 'next/link';
import { createSeoMetadata } from '@/lib/seo';

export const metadata: Metadata = createSeoMetadata({
  title: 'Privacy Policy',
  description: 'How PFinance handles account, finance, receipt, and product usage data.',
  path: '/privacy',
  imageAlt: 'PFinance privacy policy',
});

const sections = [
  {
    title: 'What we collect',
    body: 'PFinance may collect account details, finance records you enter, uploaded receipt or statement data, device and browser information, and product usage events needed to operate and improve the service.',
  },
  {
    title: 'How information is used',
    body: 'Data is used to provide expense tracking, income tools, budget reports, shared finance features, AI-assisted extraction, support, security, billing, and service reliability.',
  },
  {
    title: 'AI and extraction workflows',
    body: 'When you use document extraction or smart entry features, the submitted content may be processed by configured extraction services so the app can return draft transaction data for review.',
  },
  {
    title: 'Your choices',
    body: 'You can choose what to upload, edit or delete finance records, sign out of your account, and contact the PFinance team for account or data questions.',
  },
];

export default function PrivacyPage() {
  return (
    <article className="py-16 sm:py-24">
      <div className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <p className="text-sm font-medium text-primary">Privacy Policy</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
          Privacy at PFinance
        </h1>
        <p className="mt-5 text-lg leading-8 text-muted-foreground">
          This page explains the data PFinance needs to run personal finance,
          collaboration, receipt, statement, and reporting features. It is written
          for the product as currently operated and should be reviewed before any
          major billing, analytics, or AI provider changes.
        </p>

        <div className="mt-10 space-y-8">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-semibold">{section.title}</h2>
              <p className="mt-3 leading-7 text-muted-foreground">{section.body}</p>
            </section>
          ))}
        </div>

        <div className="mt-12 rounded-lg border bg-muted/25 p-6">
          <h2 className="text-lg font-semibold">Contact</h2>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            For privacy requests, product questions, or account support, contact the
            PFinance team from inside the app or through the project support channel.
          </p>
          <Link href="/terms" className="mt-4 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline">
            Read the Terms of Service
          </Link>
        </div>
      </div>
    </article>
  );
}
