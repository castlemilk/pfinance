'use client';

import { useState } from 'react';
import Link from 'next/link';
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
  UsersIcon,
  UserCog
} from 'lucide-react';
import { useAuth } from '../context/AuthWithAdminContext';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from './ThemeToggle';

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
    href: '/personal/income',
    icon: <TrendingUp className="w-4 h-4" />
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
  const { user, logout, isImpersonating } = useAuth();
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

  const NavContent = () => (
    <>
      {/* Logo/Brand */}
      <div className="p-6 border-b">
        <h1 className="text-2xl font-bold">PFinance</h1>
      </div>

      {/* Main Navigation Tabs */}
      <div className="p-4">
        <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-lg">
          <Link href="/personal">
            <Button 
              variant={isPersonal ? 'default' : 'ghost'} 
              className="w-full justify-start"
              size="sm"
            >
              <User className="w-4 h-4 mr-2" />
              Personal
            </Button>
          </Link>
          <Link href="/shared">
            <Button 
              variant={isShared ? 'default' : 'ghost'} 
              className="w-full justify-start"
              size="sm"
              disabled={!user}
            >
              <Users className="w-4 h-4 mr-2" />
              Shared
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
          if (item.requiresAuth && !user) return null;
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
        <ThemeToggle />
        
        {user ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-2 rounded-lg bg-muted">
              <Avatar className={cn(
                "w-8 h-8",
                isImpersonating && "ring-2 ring-amber-500 ring-offset-2 ring-offset-background"
              )}>
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
      {/* Mobile Menu Button */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          {isMobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </Button>
      </div>

      {/* Mobile Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 bg-background border-r transform transition-transform duration-200 ease-in-out lg:hidden",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="h-full flex flex-col">
          <NavContent />
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