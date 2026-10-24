import Link from 'next/link';
import Image from 'next/image';
import { discoveryPages } from '@/lib/marketing-pages';

const featureLinks = discoveryPages
  .filter((page) => page.category === 'features')
  .map((page) => ({ label: page.navLabel, href: `${page.path}/` }));

const toolAndCompareLinks = discoveryPages
  .filter((page) => page.category === 'tools' || page.category === 'compare')
  .map((page) => ({ label: page.navLabel, href: `${page.path}/` }));

export const footerLinks = {
  product: [
    { label: 'All Features', href: '/features/' },
    ...featureLinks,
    { label: 'Pricing', href: '/#pricing' },
  ],
  resources: [
    { label: 'Free Calculators', href: '/tools/' },
    ...toolAndCompareLinks.filter((link) => link.href.startsWith('/tools/')),
    { label: 'Super Calculator & Estimator', href: '/tools/super-calculator/' },
    { label: 'Comparisons', href: '/compare/' },
    ...toolAndCompareLinks.filter((link) => link.href.startsWith('/compare/')),
    { label: 'Blog', href: '/blog/' },
  ],
  legal: [
    { label: 'Privacy Policy', href: '/privacy/' },
    { label: 'Terms of Service', href: '/terms/' },
  ],
};

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer role="contentinfo" className="relative skeu-surface">
      {/* Recessed divider at top */}
      <div className="skeu-divider" />

      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(180deg, color-mix(in oklch, var(--background) 95%, var(--muted)) 0%, var(--background) 100%)',
        }}
      />

      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 lg:gap-12">
          {/* Brand Column */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <Image
                src="/logo.png"
                alt="PFinance Logo"
                width={32}
                height={32}
                className="rounded-lg"
              />
              <span className="text-lg font-bold skeu-emboss">
                <span className="text-foreground">P</span>
                <span className="text-primary">Finance</span>
              </span>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              Expense tracking, budgets, tax deductions, and shared household finance — built for Australia.
            </p>
          </div>

          {/* Product Links */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-4 skeu-emboss">Product</h3>
            <ul className="space-y-3">
              {footerLinks.product.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources Links */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-4 skeu-emboss">Resources</h3>
            <ul className="space-y-3">
              {footerLinks.resources.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal Links */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-4 skeu-emboss">Legal</h3>
            <ul className="space-y-3">
              {footerLinks.legal.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Bar with recessed divider */}
        <div className="mt-12 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="skeu-divider absolute left-0 right-0" style={{ top: 'auto', marginTop: '-2rem' }} />
          <p className="text-sm text-muted-foreground">
            &copy; {currentYear} PFinance. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground/60">
            Built with Next.js, TypeScript & shadcn/ui
          </p>
        </div>
      </div>
    </footer>
  );
}
