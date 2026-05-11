import type { Metadata } from 'next';
import Link from 'next/link';
import { createSeoMetadata } from '@/lib/seo';

export const metadata: Metadata = createSeoMetadata({
  title: 'Terms of Service',
  description: 'Terms for using PFinance personal finance, shared budgeting, receipt, statement, and reporting features.',
  path: '/terms',
  imageAlt: 'PFinance terms of service',
});

const sections = [
  {
    title: 'Use of the service',
    body: 'PFinance provides software for tracking money, organizing records, and reviewing estimates. You are responsible for the accuracy of data you enter or import.',
  },
  {
    title: 'Financial and tax information',
    body: 'Calculators, AI classifications, reports, and tax-related views are informational estimates only. They are not financial, legal, or tax advice.',
  },
  {
    title: 'Accounts and collaboration',
    body: 'When you use shared finance features, only invite people you trust to see or contribute to the relevant household or group records.',
  },
  {
    title: 'Responsible uploads',
    body: 'Only upload receipts, statements, and files you have permission to process. Review extracted transactions before saving them to your records.',
  },
];

export default function TermsPage() {
  return (
    <article className="py-16 sm:py-24">
      <div className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <p className="text-sm font-medium text-primary">Terms of Service</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
          Terms for using PFinance
        </h1>
        <p className="mt-5 text-lg leading-8 text-muted-foreground">
          These terms describe the practical rules for using PFinance. They keep
          the product positioned as finance software, not a replacement for
          professional advice.
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
          <h2 className="text-lg font-semibold">Privacy</h2>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            PFinance needs account and finance data to provide the service. The
            privacy policy explains those data practices in more detail.
          </p>
          <Link href="/privacy" className="mt-4 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline">
            Read the Privacy Policy
          </Link>
        </div>
      </div>
    </article>
  );
}
