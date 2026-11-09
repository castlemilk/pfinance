import { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, BookOpen, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BreadcrumbJsonLd, FAQPageJsonLd } from '@/components/seo/JsonLd';
import { discoveryPages, type MarketingPageData } from '@/lib/marketing-pages';
import { getSiteUrl } from '@/lib/seo';

interface MarketingInfoPageProps {
  page: MarketingPageData;
  children?: ReactNode;
}

export default function MarketingInfoPage({ page, children }: MarketingInfoPageProps) {
  const siteUrl = getSiteUrl().replace(/\/$/, '');
  const hubUrl = `${siteUrl}${page.hubPath}/`;
  const pageUrl = `${siteUrl}${page.path}/`;
  const relatedPages = discoveryPages.filter((item) => item.path !== page.path).slice(0, 3);
  const isCalculator = page.category === 'tools';
  const callsToAction = (
    <>
      <Link href={page.primaryCtaHref} className="w-full sm:w-auto">
        <Button size="lg" variant="terminal" className="w-full sm:w-auto">
          {page.primaryCta}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </Link>
      <Link href={page.secondaryCtaHref} className="w-full sm:w-auto">
        <Button size="lg" variant="outline" className="w-full sm:w-auto">
          <BookOpen className="h-4 w-4" aria-hidden="true" />
          {page.secondaryCta}
        </Button>
      </Link>
    </>
  );

  return (
    <article>
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', url: `${siteUrl}/` },
          { name: page.hubLabel, url: hubUrl },
          { name: page.title, url: pageUrl },
        ]}
      />
      {page.faqs.length > 0 && <FAQPageJsonLd items={page.faqs} />}

      <section className={`relative overflow-hidden ${isCalculator ? 'py-8 sm:py-20' : 'py-12 sm:py-20'}`}>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <nav aria-label="Breadcrumb" className={`mx-auto max-w-4xl text-sm text-muted-foreground ${isCalculator ? 'mb-4 sm:mb-6' : 'mb-6'}`}>
            <ol className="flex flex-wrap items-center justify-center gap-2">
              <li>
                <Link href="/" className="hover:text-foreground transition-colors">
                  Home
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li>
                <Link href={`${page.hubPath}/`} className="hover:text-foreground transition-colors">
                  {page.hubLabel}
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li aria-current="page" className="text-foreground font-medium">
                {page.navLabel}
              </li>
            </ol>
          </nav>

          <div className="mx-auto max-w-4xl text-center">
            <Badge variant="secondary" className="mb-5">
              {page.eyebrow}
            </Badge>
            <h1 className={`font-bold tracking-tight skeu-emboss ${isCalculator ? 'text-3xl sm:text-5xl lg:text-6xl' : 'text-4xl sm:text-5xl lg:text-6xl'}`}>
              {page.heading}
            </h1>
            <p className={`mx-auto max-w-2xl text-muted-foreground ${isCalculator ? 'mt-4 text-base sm:mt-6 sm:text-xl' : 'mt-6 text-lg sm:text-xl'}`}>
              {page.body}
            </p>
            <div className={`mt-8 flex-col justify-center gap-3 sm:flex-row ${isCalculator ? 'hidden sm:flex' : 'flex'}`}>
              {callsToAction}
            </div>
          </div>

          {children ? (
            <div className={`mx-auto max-w-6xl ${isCalculator ? 'mt-8 sm:mt-12' : 'mt-12'}`}>
              {children}
            </div>
          ) : (
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
          )}

          {isCalculator && (
            <div className="mt-8 flex flex-col justify-center gap-3 sm:hidden">
              {callsToAction}
            </div>
          )}
        </div>
      </section>

      <section className="border-y bg-muted/25 py-12">
        <div className="container mx-auto grid gap-4 px-4 sm:px-6 md:grid-cols-3 lg:px-8">
          {page.highlights.map((highlight) => (
            <div
              key={highlight}
              className="flex items-start gap-3 rounded-lg border bg-background p-5 shadow-sm"
            >
              <span
                aria-hidden="true"
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
              >
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
              <p className="text-sm font-medium leading-6">{highlight}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="py-16 sm:py-20">
        <div className="container mx-auto grid gap-6 px-4 sm:px-6 lg:grid-cols-3 lg:px-8">
          {page.sections.map((section, index) => (
            <section
              key={section.title}
              className="flex flex-col rounded-xl border bg-card/50 p-6"
            >
              <span
                aria-hidden="true"
                className="text-xs font-semibold uppercase tracking-widest text-primary-text"
              >
                {String(index + 1).padStart(2, '0')}
              </span>
              <h2 className="mt-2 text-xl font-semibold tracking-tight">{section.title}</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                {section.body}
              </p>
            </section>
          ))}
        </div>
      </section>

      {page.faqs.length > 0 && (
        <section className="border-t bg-muted/15 py-16 sm:py-20">
          <div className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Frequently asked questions
            </h2>
            <dl className="mt-8 space-y-6">
              {page.faqs.map((faq) => (
                <div key={faq.question} className="rounded-lg border bg-background p-6">
                  <dt className="text-base font-semibold text-foreground">
                    {faq.question}
                  </dt>
                  <dd className="mt-2 text-sm leading-7 text-muted-foreground">
                    {faq.answer}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      )}

      <section className="border-t py-12">
        <div className="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">Explore related tools and workflows</h2>
            <Link
              href={`${page.hubPath}/`}
              className="text-sm font-medium text-primary-text underline-offset-4 hover:underline"
            >
              View all {page.hubLabel.toLowerCase()}
            </Link>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {relatedPages.map((related) => (
              <Link
                key={related.path}
                href={`${related.path}/`}
                className="rounded-lg border bg-background p-4 transition-colors hover:border-primary/50"
              >
                <p className="text-xs font-medium text-primary-text">{related.eyebrow}</p>
                <p className="mt-1 font-semibold">{related.navLabel}</p>
                <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                  {related.description}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </article>
  );
}
