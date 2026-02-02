'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';

interface BreadcrumbItem {
  label: string;
  href: string;
}

const routeLabels: Record<string, string> = {
  personal: 'Personal',
  shared: 'Shared',
  expenses: 'Expenses',
  income: 'Income',
  reports: 'Reports',
  settings: 'Settings',
  groups: 'Groups',
  join: 'Join Group',
};

export default function Breadcrumbs() {
  const pathname = usePathname();

  // Don't show breadcrumbs on root app pages
  if (!pathname || pathname === '/') {
    return null;
  }

  const segments = pathname.split('/').filter(Boolean);

  // Don't show breadcrumbs if we're at a top-level page (e.g., /personal)
  if (segments.length <= 1) {
    return null;
  }

  const breadcrumbs: BreadcrumbItem[] = [];
  let currentPath = '';

  segments.forEach((segment, index) => {
    currentPath += `/${segment}`;
    const label = routeLabels[segment] || segment.charAt(0).toUpperCase() + segment.slice(1);

    breadcrumbs.push({
      label,
      href: currentPath,
    });
  });

  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <li>
          <Link
            href={`/${segments[0]}`}
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <Home className="h-4 w-4" />
            <span className="sr-only">Home</span>
          </Link>
        </li>
        {breadcrumbs.slice(1).map((crumb, index) => (
          <li key={crumb.href} className="flex items-center gap-1.5">
            <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
            {index === breadcrumbs.length - 2 ? (
              <span className="font-medium text-foreground">{crumb.label}</span>
            ) : (
              <Link
                href={crumb.href}
                className="hover:text-foreground transition-colors"
              >
                {crumb.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
