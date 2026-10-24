import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { discoveryPages, type HubPageData } from '@/lib/marketing-pages';
import { getSiteUrl } from '@/lib/seo';

interface ExtraSpoke {
  path: string;
  navLabel: string;
  eyebrow: string;
  description: string;
}

interface MarketingHubPageProps {
  hub: HubPageData;
  extraSpokes?: ExtraSpoke[];
}

export default function MarketingHubPage({ hub, extraSpokes = [] }: MarketingHubPageProps) {
  const siteUrl = getSiteUrl().replace(/\/$/, '');
  const hubUrl = `${siteUrl}${hub.path}/`;
  const category = hub.path.slice(1) as 'features' | 'tools' | 'compare';
  const spokes = [
    ...discoveryPages.filter((page) => page.category === category).map((page) => ({
      path: `${page.path}/`,
      navLabel: page.navLabel,
      eyebrow: page.eyebrow,
      description: page.description,
    })),
    ...extraSpokes,
  ];

  return (
    <article className="py-12 sm:py-20">
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', url: `${siteUrl}/` },
          { name: hub.title, url: hubUrl },
        ]}
      />

      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <nav aria-label="Breadcrumb" className="mx-auto mb-6 max-w-4xl text-sm text-muted-foreground">
          <ol className="flex flex-wrap items-center justify-center gap-2">
            <li>
              <Link href="/" className="hover:text-foreground transition-colors">
                Home
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="text-foreground font-medium">
              {hub.eyebrow}
            </li>
          </ol>
        </nav>

        <div className="mx-auto max-w-4xl text-center">
          <Badge variant="secondary" className="mb-5">
            {hub.eyebrow}
          </Badge>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl skeu-emboss">
            {hub.heading}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl">
            {hub.body}
          </p>
        </div>

        <section className="mx-auto mt-12 max-w-5xl">
          <h2 className="text-2xl font-bold tracking-tight mb-6">
            Explore {hub.eyebrow.toLowerCase()}
          </h2>
          <div className="grid gap-6 sm:grid-cols-2">
            {spokes.map((spoke) => (
              <Link
                key={spoke.path}
                href={spoke.path}
                className="group rounded-xl border bg-card p-6 shadow-sm transition-colors hover:border-primary/50"
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                  {spoke.eyebrow}
                </p>
                <h3 className="mt-2 text-xl font-semibold group-hover:text-primary transition-colors flex items-center justify-between gap-2">
                  <span>{spoke.navLabel}</span>
                  <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1" />
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {spoke.description}
                </p>
              </Link>
            ))}
          </div>
        </section>

        <section className="mx-auto mt-16 max-w-5xl grid gap-8 lg:grid-cols-3">
          {hub.sections.map((section) => (
            <section key={section.title} className="rounded-lg border bg-muted/20 p-6">
              <h2 className="text-lg font-semibold tracking-tight">{section.title}</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                {section.body}
              </p>
            </section>
          ))}
        </section>

        <div className="mx-auto mt-16 max-w-3xl rounded-xl border bg-muted/25 p-8 text-center">
          <h2 className="text-2xl font-bold tracking-tight">
            Try it on your own numbers
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Start with our free in-browser calculators or open your personal workspace.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/personal/expenses/">
              <Button variant="terminal" size="lg">
                Open PFinance
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </Link>
            <Link href="/blog/">
              <Button variant="outline" size="lg">
                Read finance guides
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
