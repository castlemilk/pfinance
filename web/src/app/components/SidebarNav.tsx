'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  User,
  Users,
  Menu,
  X,
  Home,
  Receipt,
  TrendingUp,
  FileText,
  Settings,
  LogOut,
  UserPlus,
  UserCog,
  BookOpen,
  ExternalLink,
  Repeat,
  Target,
  Lightbulb,
  BarChart3,
  Search,
  CreditCard,
  Crown,
  Bot,
  Landmark,
  ClipboardCheck,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthWithAdminContext';
import { financeClient } from '@/lib/financeService';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from './ThemeToggle';
import { PaletteSelector } from './PaletteSelector';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import NotificationCenter from './notifications/NotificationCenter';
import { useSubscription } from '../hooks/useSubscription';
import { GenerativeAvatar } from './GenerativeAvatar';

interface NavItem {
  title: string;
  href: string;
  icon: React.ReactNode;
  requiresAuth?: boolean;
}

const personalNavItems: NavItem[] = [
  {
    title: 'Overview',
    href: '/personal',
    icon: <Home className="w-4 h-4" />
  },
  {
    title: 'Expenses',
    href: '/personal/expenses',
    icon: <Receipt className="w-4 h-4" />
  },
  {
    title: 'Income',
    href: '/personal/income/',
    icon: <TrendingUp className="w-4 h-4" />
  },
  {
    title: 'Recurring',
    href: '/personal/recurring',
    icon: <Repeat className="w-4 h-4" />
  },
  {
    title: 'Goals',
    href: '/personal/goals',
    icon: <Target className="w-4 h-4" />
  },
  {
    title: 'Insights',
    href: '/personal/insights',
    icon: <Lightbulb className="w-4 h-4" />
  },
  {
    title: 'Assistant',
    href: '/personal/assistant',
    icon: <Bot className="w-4 h-4" />
  },
  {
    title: 'Analytics',
    href: '/personal/analytics',
    icon: <BarChart3 className="w-4 h-4" />
  },
  {
    title: 'Tax Returns',
    href: '/personal/tax',
    icon: <Landmark className="w-4 h-4" />
  },
  {
    title: 'Tax Review',
    href: '/personal/tax/review',
    icon: <ClipboardCheck className="w-4 h-4" />
  },
  {
    title: 'Reports',
    href: '/personal/reports',
    icon: <FileText className="w-4 h-4" />
  },
  {
    title: 'Settings',
    href: '/personal/settings',
    icon: <Settings className="w-4 h-4" />
  },
  {
    title: 'Billing',
    href: '/personal/billing',
    icon: <CreditCard className="w-4 h-4" />
  }
];

const sharedNavItems: NavItem[] = [
  {
    title: 'Dashboard',
    href: '/shared',
    icon: <Home className="w-4 h-4" />,
    requiresAuth: true
  },
  {
    title: 'Expenses',
    href: '/shared/expenses',
    icon: <Receipt className="w-4 h-4" />,
    requiresAuth: true
  },
  {
    title: 'Analytics',
    href: '/shared/analytics',
    icon: <BarChart3 className="w-4 h-4" />,
    requiresAuth: true
  },
  {
    title: 'Reports',
    href: '/shared/reports',
    icon: <FileText className="w-4 h-4" />,
    requiresAuth: true
  },
  {
    title: 'Group Settings',
    href: '/shared/groups',
    icon: <UserCog className="w-4 h-4" />,
    requiresAuth: true
  }
];

export default function SidebarNav() {
  const { user, logout, isImpersonating, loading } = useAuth();
  const { isPro, isFree, loading: subscriptionLoading } = useSubscription();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const suppressMobileFocusRestoreRef = useRef(false);

  // Check admin status once when user is loaded so we can show the admin link.
  useEffect(() => {
    if (loading || !user) {
      setIsAdmin(false);
      return;
    }
    let cancelled = false;
    financeClient
      .getMyAdminStatus({})
      .then((res) => {
        if (!cancelled) setIsAdmin(res.isAdmin);
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, loading]);

  const isPersonal = pathname.startsWith('/personal');
  const isShared = pathname.startsWith('/shared');

  // Auto-close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  const closeMobileMenu = useCallback(() => {
    setIsMobileMenuOpen(false);
  }, []);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const NavContent = ({ showCloseButton = false }: { showCloseButton?: boolean }) => (
    <>
      {/* Logo/Brand - Links to landing page */}
      <div className="p-4 sm:p-6 border-b">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <Image
              src="/logo.png"
              alt="PFinance Logo"
              width={40}
              height={40}
              className="rounded-lg group-hover:scale-105 transition-transform"
            />
            <span className="text-2xl font-bold group-hover:text-primary transition-colors">PFinance</span>
          </Link>
          <div className="flex items-center gap-1">
            <NotificationCenter />
            {showCloseButton && (
              <SheetClose asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="min-h-10 min-w-10 lg:hidden"
                  aria-label="Close navigation"
                >
                  <X className="w-5 h-5" />
                </Button>
              </SheetClose>
            )}
          </div>
        </div>
      </div>

      {/* Search Button - Prominent retro-styled */}
      <div className="px-4 pt-3 pb-1">
        <Button
          variant="outline"
          className="min-h-10 w-full justify-start border-primary/30 text-muted-foreground transition-[color,background-color,border-color,box-shadow] duration-150 ease-out hover:border-primary/60 hover:bg-primary/5 group motion-reduce:transition-none"
          size="sm"
          data-testid="app-search-trigger"
          onClick={() => {
            if (showCloseButton) {
              suppressMobileFocusRestoreRef.current = true;
              closeMobileMenu();
            }
            document.dispatchEvent(new Event('pfinance:open-search'));
          }}
        >
          <Search className="w-4 h-4 mr-2 text-primary/70 group-hover:text-primary transition-colors" />
          <span className="group-hover:text-foreground transition-colors">Search...</span>
          <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-primary/20 bg-primary/5 px-1.5 font-mono text-[10px] font-medium text-primary/60">
            <span className="text-xs">&#8984;</span>K
          </kbd>
        </Button>
      </div>

      {/* Main Navigation Tabs */}
      <div className="p-4">
        <div className="grid grid-cols-2 gap-1 p-1 bg-muted rounded-lg">
          <Button
            asChild
            variant={isPersonal ? 'default' : 'ghost'}
            className="min-h-10 w-full justify-center gap-1.5 px-3"
            size="sm"
          >
            <Link href="/personal">
              <User className="w-4 h-4 shrink-0" />
              <span className="text-sm whitespace-nowrap">Personal</span>
            </Link>
          </Button>
          {!loading && !user ? (
            <Button
              variant="ghost"
              className="min-h-10 w-full justify-center gap-1.5 px-3"
              size="sm"
              disabled
            >
              <Users className="w-4 h-4 shrink-0" />
              <span className="text-sm whitespace-nowrap">Shared</span>
            </Button>
          ) : (
            <Button
              asChild
              variant={isShared ? 'default' : 'ghost'}
              className="min-h-10 w-full justify-center gap-1.5 px-3"
              size="sm"
            >
              <Link href="/shared">
                <Users className="w-4 h-4 shrink-0" />
                <span className="text-sm whitespace-nowrap">Shared</span>
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Navigation Items - scrollable on mobile */}
      <nav
        aria-label="Primary navigation"
        className="p-4 space-y-1 overflow-y-auto overscroll-contain flex-1"
      >
        {isPersonal && personalNavItems.map((item) => (
          <Button
            key={item.href}
            asChild
            variant={pathname === item.href ? 'secondary' : 'ghost'}
            className="min-h-10 w-full justify-start transition-[color,background-color,border-color,box-shadow] duration-150 ease-out motion-reduce:transition-none"
            size="sm"
          >
            <Link
              href={item.href}
              onClick={showCloseButton ? closeMobileMenu : undefined}
            >
              {item.icon}
              <span className="ml-2">{item.title}</span>
            </Link>
          </Button>
        ))}

        {isPersonal && isAdmin && (
          <Button
            asChild
            variant={pathname === '/admin' ? 'secondary' : 'ghost'}
            className="min-h-10 w-full justify-start transition-[color,background-color,border-color,box-shadow] duration-150 ease-out motion-reduce:transition-none"
            size="sm"
          >
            <Link
              href="/admin"
              onClick={showCloseButton ? closeMobileMenu : undefined}
            >
              <ShieldCheck className="w-4 h-4" />
              <span className="ml-2">Admin</span>
            </Link>
          </Button>
        )}

        {isShared && sharedNavItems.map((item) => {
          // Don't filter out nav items while loading - only when we know there's no user
          if (item.requiresAuth && !loading && !user) return null;
          return (
            <Button
              key={item.href}
              asChild
              variant={pathname === item.href ? 'secondary' : 'ghost'}
              className="min-h-10 w-full justify-start transition-[color,background-color,border-color,box-shadow] duration-150 ease-out motion-reduce:transition-none"
              size="sm"
            >
              <Link
                href={item.href}
                onClick={showCloseButton ? closeMobileMenu : undefined}
              >
                {item.icon}
                <span className="ml-2">{item.title}</span>
              </Link>
            </Button>
          );
        })}
      </nav>

      {/* User Section at Bottom */}
      <div className="mt-auto p-4 border-t space-y-4">
        {/* Quick Links */}
        <div className="flex items-center gap-2 text-xs">
          <Link
            href="/"
            className="flex min-h-10 items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            Home
          </Link>
          <span className="text-muted-foreground/50">•</span>
          <Link
            href="/blog"
            className="flex min-h-10 items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <BookOpen className="w-3 h-3" />
            Blog
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <PaletteSelector />
        </div>

        {loading ? (
          // Show skeleton while auth is loading
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-2 rounded-lg bg-muted">
              <Skeleton className="w-8 h-8 rounded-full" />
              <div className="flex-1 min-w-0 space-y-1">
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
            <Skeleton className="h-8 w-full" />
          </div>
        ) : user ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Link
                href="/personal/account"
                className={cn(
                  "flex min-h-10 min-w-0 flex-1 items-center gap-3 p-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors",
                  pathname === '/personal/account' && "ring-2 ring-primary ring-offset-1 ring-offset-background"
                )}
              >
                <Avatar className={cn(
                  "w-8 h-8",
                  isImpersonating && "ring-2 ring-amber-500 ring-offset-2 ring-offset-background"
                )}>
                  {user.photoURL && (
                    <AvatarImage src={user.photoURL} alt={user.displayName || 'User'} />
                  )}
                  <AvatarFallback className="p-0 bg-transparent">
                    <GenerativeAvatar name={user.displayName || user.email || 'User'} size={32} />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {user.displayName || user.email}
                  </p>
                  {!subscriptionLoading && isPro && (
                    <Badge variant="default" className="text-xs bg-amber-500/90 hover:bg-amber-500">
                      <Crown className="w-3 h-3 mr-0.5" />
                      Pro
                    </Badge>
                  )}
                  {isImpersonating && (
                    <Badge variant="secondary" className="text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/50">
                      Test User
                    </Badge>
                  )}
                </div>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                className="min-h-10 min-w-10 shrink-0"
                aria-label="Sign out"
                onClick={() => logout()}
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
            {!subscriptionLoading && isFree && user && (
              <Button
                asChild
                variant="default"
                size="sm"
                className="min-h-10 w-full gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
              >
                <Link href="/personal/billing/">
                  <Crown className="w-4 h-4" />
                  Upgrade to Pro
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <Button
            asChild
            variant="outline"
            className="min-h-10 w-full"
            size="sm"
          >
            <Link href="/auth">
              <UserPlus className="w-4 h-4 mr-2" />
              Sign In
            </Link>
          </Button>
        )}
      </div>
    </>
  );

  return (
    <>
      <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
        {/* Mobile Header Bar - fixed top bar with hamburger menu */}
        <div className="lg:hidden fixed top-0 left-0 right-0 z-50 h-14 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b flex items-center px-4 gap-3 overflow-visible">
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="min-h-10 min-w-10 shrink-0"
              aria-label="Open navigation"
            >
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <Link href="/" className="flex min-h-10 items-center gap-2">
            <Image
              src="/logo.png"
              alt="PFinance Logo"
              width={28}
              height={28}
              className="rounded-md"
            />
            <span className="font-semibold text-lg">PFinance</span>
          </Link>
          {/* Mobile Search shortcut in header */}
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto min-h-10 min-w-10 text-muted-foreground hover:text-primary"
            aria-label="Open search"
            data-testid="app-search-trigger"
            onClick={() => {
              document.dispatchEvent(new Event('pfinance:open-search'));
            }}
          >
            <Search className="w-4 h-4" />
          </Button>
          <div className="overflow-visible">
            <NotificationCenter />
          </div>
        </div>

        <SheetContent
          side="left"
          showCloseButton={false}
          className="z-[60] w-72 max-w-[85vw] gap-0 p-0 overscroll-contain data-[state=closed]:duration-150 data-[state=open]:duration-200 motion-reduce:animate-none motion-reduce:transition-none"
          onCloseAutoFocus={(event) => {
            if (suppressMobileFocusRestoreRef.current) {
              event.preventDefault();
              suppressMobileFocusRestoreRef.current = false;
            }
          }}
        >
          <SheetTitle className="sr-only">Mobile navigation</SheetTitle>
          <SheetDescription className="sr-only">
            Navigate between personal and shared finance features.
          </SheetDescription>
          <NavContent showCloseButton={true} />
        </SheetContent>
      </Sheet>

      {/* Desktop Sidebar */}
      <div className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 lg:bg-background lg:border-r">
        <NavContent />
      </div>
    </>
  );
}
