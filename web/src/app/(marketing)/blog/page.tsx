import { Metadata } from 'next';
import Link from 'next/link';
import { getAllPosts, getFeaturedPosts, getAllCategories } from '@/lib/blog';
import BlogHeader from '@/components/blog/BlogHeader';
import BlogCard from '@/components/blog/BlogCard';
import { Badge } from '@/components/ui/badge';
import { BlogJsonLd, BreadcrumbJsonLd } from '@/components/seo/JsonLd';
import { createSeoMetadata, getSiteUrl } from '@/lib/seo';

export const metadata: Metadata = createSeoMetadata({
  title: 'Blog - Personal Finance Tips & Guides',
  description: 'Learn how to manage your money better with guides on budgeting, receipts, income, household costs, and tax-ready records.',
  path: '/blog',
  imageAlt: 'PFinance personal finance blog',
});

export default function BlogPage() {
  const allPosts = getAllPosts();
  const featuredPosts = getFeaturedPosts().slice(0, 2);
  const featuredSlugs = new Set(featuredPosts.map((post) => post.slug));
  const regularPosts = allPosts.filter((post) => !featuredSlugs.has(post.slug));
  const categories = getAllCategories();
  const siteUrl = getSiteUrl().replace(/\/$/, '');

  // If no posts yet, show a coming soon message
  if (allPosts.length === 0) {
    return (
      <>
        <BlogJsonLd url={`${siteUrl}/blog/`} />
        <BreadcrumbJsonLd
          items={[
            { name: 'Home', url: `${siteUrl}/` },
            { name: 'Blog', url: `${siteUrl}/blog/` },
          ]}
        />
        <BlogHeader />
        <section className="py-16">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center py-16 bg-muted/30 rounded-xl">
              <span className="text-6xl mb-4 block">📝</span>
              <h2 className="text-2xl font-bold mb-2">Coming Soon</h2>
              <p className="text-muted-foreground">
                We&apos;re working on some great content. Check back soon!
              </p>
            </div>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <BlogJsonLd url={`${siteUrl}/blog/`} />
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', url: `${siteUrl}/` },
          { name: 'Blog', url: `${siteUrl}/blog/` },
        ]}
      />
      <BlogHeader
        title="Australian Personal & Household Finance Guides"
        description="Practical guides on ATO tax deductions, working from home substantiation, shared household budgeting, salary sacrifice, and expense tracking."
      />

      <section className="py-16">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          {/* Topics & Interactive Tools Strip */}
          <div className="mb-12 flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-muted/20 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mr-1">
                Topics:
              </span>
              {categories.map((category) => (
                <Badge key={category} variant="secondary" className="text-xs">
                  {category}
                </Badge>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Link
                href="/tools/australian-salary-calculator/"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Salary Calculator
              </Link>
              <span aria-hidden="true" className="text-muted-foreground">·</span>
              <Link
                href="/tools/budget-calculator/"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Budget Calculator
              </Link>
              <span aria-hidden="true" className="text-muted-foreground">·</span>
              <Link
                href="/tools/super-calculator/"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Super Calculator
              </Link>
              <span aria-hidden="true" className="text-muted-foreground">·</span>
              <Link
                href="/tools/wfh-deduction-calculator/"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                WFH Deduction Calculator
              </Link>
              <span aria-hidden="true" className="text-muted-foreground">·</span>
              <Link
                href="/tools/mortgage-offset-calculator/"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Mortgage Offset Calculator
              </Link>
              <span aria-hidden="true" className="text-muted-foreground">·</span>
              <Link
                href="/tools/hecs-help-calculator/"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                HECS-HELP Calculator
              </Link>
              <span aria-hidden="true" className="text-muted-foreground">·</span>
              <Link
                href="/tools/debt-payoff-calculator/"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Debt Payoff Calculator
              </Link>
              <span aria-hidden="true" className="text-muted-foreground">·</span>
              <Link
                href="/tools/insurance-needs-calculator/"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Insurance Needs Calculator
              </Link>
              <span aria-hidden="true" className="text-muted-foreground">·</span>
              <Link
                href="/tools/cgt-calculator/"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                CGT Calculator
              </Link>
              <span aria-hidden="true" className="text-muted-foreground">·</span>
              <Link
                href="/tools/borrowing-power-calculator/"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Borrowing Power
              </Link>
              <span aria-hidden="true" className="text-muted-foreground">·</span>
              <Link
                href="/tools/investment-risk-profile/"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Risk Profile Quiz
              </Link>
              <span aria-hidden="true" className="text-muted-foreground">·</span>
              <Link
                href="/features/tax-deductions/"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Tax Deduction Tracker
              </Link>
            </div>
          </div>

          {/* Featured Posts */}
          {featuredPosts.length > 0 && (
            <div className="mb-16">
              <h2 className="text-2xl font-bold mb-6">Featured Guides</h2>
              <div className="grid md:grid-cols-2 gap-6">
                {featuredPosts.map((post) => (
                  <BlogCard key={post.slug} post={post} featured />
                ))}
              </div>
            </div>
          )}

          {/* All Posts */}
          <div>
            <h2 className="text-2xl font-bold mb-6">All Articles ({allPosts.length})</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {(featuredPosts.length > 0 ? regularPosts : allPosts).map((post) => (
                <BlogCard key={post.slug} post={post} />
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
