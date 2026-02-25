import Link from 'next/link';
import Image from 'next/image';
import { Github, Twitter, Linkedin } from 'lucide-react';

const footerLinks = {
  product: [
    { label: 'Features', href: '/#features' },
    { label: 'Pricing', href: '/#pricing' },
    { label: 'Dashboard', href: '/personal/income/' },
  ],
  resources: [
    { label: 'Blog', href: '/blog' },
    { label: 'Documentation', href: '/blog' },
    { label: 'Help Center', href: '/blog' },
  ],
  legal: [
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Terms of Service', href: '/terms' },
  ],
};

const socialLinks = [
  { icon: Github, href: 'https://github.com', label: 'GitHub' },
  { icon: Twitter, href: 'https://twitter.com', label: 'Twitter' },
  { icon: Linkedin, href: 'https://linkedin.com', label: 'LinkedIn' },
];

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
              Take control of your finances with intelligent tracking, beautiful insights, and collaborative tools.
            </p>
            {/* Social Links - embossed circular buttons */}
            <div className="flex items-center gap-3">
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground transition-all duration-200"
                  style={{
                    background: 'linear-gradient(180deg, color-mix(in oklch, var(--muted) 100%, white 8%) 0%, var(--muted) 100%)',
                    boxShadow: 'inset 0 1px 0 color-mix(in oklch, white 10%, transparent), 0 2px 4px rgba(0,0,0,0.06)',
                  }}
                  aria-label={social.label}
                >
                  <social.icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Product Links */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-4 skeu-emboss">Product</h3>
            <ul className="space-y-3">
              {footerLinks.product.map((link) => (
                <li key={link.label}>
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
                <li key={link.label}>
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
                <li key={link.label}>
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
