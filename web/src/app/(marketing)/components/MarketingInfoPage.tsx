import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { MarketingPageData } from '@/lib/marketing-pages';

interface MarketingInfoPageProps {
  page: MarketingPageData;
}

export default function MarketingInfoPage({ page }: MarketingInfoPageProps) {
  return (
    <article>
      <section className="relative overflow-hidden py-16 sm:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <Badge variant="secondary" className="mb-5">
              {page.eyebrow}
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl skeu-emboss">
              {page.heading}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl">
              {page.body}
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/personal/expenses">
                <Button size="lg" variant="terminal" className="w-full sm:w-auto">
                  {page.primaryCta}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </Link>
              <Link href="/blog">
                <Button size="lg" variant="outline" className="w-full sm:w-auto">
                  <BookOpen className="h-4 w-4" aria-hidden="true" />
                  {page.secondaryCta}
                </Button>
              </Link>
            </div>
          </div>

          <div className="mx-auto mt-12 max-w-5xl overflow-hidden rounded-lg border bg-background shadow-sm">
            <Image
              src="/og-image.png"
              alt="PFinance product preview"
              width={1200}
              height={630}
              priority
              className="aspect-[1200/630] w-full object-cover"
            />
          </div>
        </div>
      </section>

      <section className="border-y bg-muted/25 py-12">
        <div className="container mx-auto grid gap-4 px-4 sm:px-6 md:grid-cols-3 lg:px-8">
          {page.highlights.map((highlight) => (
            <div key={highlight} className="rounded-lg border bg-background p-5 shadow-sm">
              <p className="text-sm font-semibold">{highlight}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="py-16 sm:py-20">
        <div className="container mx-auto grid gap-8 px-4 sm:px-6 lg:grid-cols-3 lg:px-8">
          {page.sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-xl font-semibold tracking-tight">{section.title}</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                {section.body}
              </p>
            </section>
          ))}
        </div>
      </section>
    </article>
  );
}
