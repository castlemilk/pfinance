'use client';

import { useState } from 'react';
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
  Repeat
} from 'lucide-react';
import { useAuth } from '../context/AuthWithAdminContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from './ThemeToggle';
import { PaletteSelector } from './PaletteSelector';
import { Skeleton } from '@/components/ui/skeleton';

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
    title: 'Reports',
    href: '/personal/reports',
    icon: <FileText className="w-4 h-4" />
  },
  {
    title: 'Settings',
    href: '/personal/settings',
    icon: <Settings className="w-4 h-4" />
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
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  const isPersonal = pathname.startsWith('/personal');
  const isShared = pathname.startsWith('/shared');

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
      <div className="p-6 border-b">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <Image
              src="/logo.png"
              alt="PFinance Logo"
              width={40}
              height={40}
              className="rounded-lg group-hover:scale-105 transition-transform"
            />
            <h1 className="text-2xl font-bold group-hover:text-primary transition-colors">PFinance</h1>
          </Link>
          {showCloseButton && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsMobileMenuOpen(false)}
              className="lg:hidden"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <div className="p-4">
        <div className="grid grid-cols-2 gap-1 p-1 bg-muted rounded-lg">
          <Link href="/personal">
            <Button
              variant={isPersonal ? 'default' : 'ghost'}
              className="w-full justify-center gap-1.5 px-2"
              size="sm"
            >
              <User className="w-4 h-4 shrink-0" />
              <span className="truncate">Personal</span>
            </Button>
          </Link>
          <Link href="/shared">
            <Button
              variant={isShared ? 'default' : 'ghost'}
              className="w-full justify-center gap-1.5 px-2"
              size="sm"
              disabled={!loading && !user}
            >
              <Users className="w-4 h-4 shrink-0" />
              <span className="truncate">Shared</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Navigation Items */}
      <nav className="p-4 space-y-1">
        {isPersonal && personalNavItems.map((item) => (
          <Link key={item.href} href={item.href}>
            <Button
              variant={pathname === item.href ? 'secondary' : 'ghost'}
              className="w-full justify-start"
              size="sm"
            >
              {item.icon}
              <span className="ml-2">{item.title}</span>
            </Button>
          </Link>
        ))}
        
        {isShared && sharedNavItems.map((item) => {
          // Don't filter out nav items while loading - only when we know there's no user
          if (item.requiresAuth && !loading && !user) return null;
          return (
            <Link key={item.href} href={item.href}>
              <Button
                variant={pathname === item.href ? 'secondary' : 'ghost'}
                className="w-full justify-start"
                size="sm"
              >
                {item.icon}
                <span className="ml-2">{item.title}</span>
              </Button>
            </Link>
          );
        })}
      </nav>

      {/* User Section at Bottom */}
      <div className="mt-auto p-4 border-t space-y-4">
        {/* Quick Links */}
        <div className="flex items-center gap-2 text-xs">
          <Link
            href="/"
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            Home
          </Link>
          <span className="text-muted-foreground/50">•</span>
          <Link
            href="/blog"
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
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
            <div className="flex items-center gap-3 p-2 rounded-lg bg-muted">
              <Avatar className={cn(
                "w-8 h-8",
                isImpersonating && "ring-2 ring-amber-500 ring-offset-2 ring-offset-background"
              )}>
                {user.photoURL && (
                  <AvatarImage src={user.photoURL} alt={user.displayName || 'User'} />
                )}
                <AvatarFallback className="text-sm">
                  {getInitials(user.displayName || user.email || 'U')}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {user.displayName || user.email}
                </p>
                {isImpersonating && (
                  <Badge variant="secondary" className="text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/50">
                    Test User
                  </Badge>
                )}
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={logout}
              className="w-full"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        ) : (
          <Link href="/auth">
            <Button variant="outline" className="w-full" size="sm">
              <UserPlus className="w-4 h-4 mr-2" />
              Sign In
            </Button>
          </Link>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Mobile Menu Button - only visible when sidebar is closed */}
      {!isMobileMenuOpen && (
        <div className="lg:hidden fixed top-4 left-4 z-50">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setIsMobileMenuOpen(true)}
          >
            <Menu className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Mobile Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 bg-background border-r transform transition-transform duration-200 ease-in-out lg:hidden",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="h-full flex flex-col">
          <NavContent showCloseButton={true} />
        </div>
      </div>

      {/* Mobile Backdrop */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Desktop Sidebar */}
      <div className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 lg:bg-background lg:border-r">
        <NavContent />
      </div>
    </>
  );
}