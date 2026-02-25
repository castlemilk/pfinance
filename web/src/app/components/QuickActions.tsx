'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import {
  TrendingUp,
  Receipt,
  FileText,
  Settings,
} from 'lucide-react';

interface QuickAction {
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  color: string;
}

const quickActions: QuickAction[] = [
  {
    title: 'Add Income',
    description: 'Track salary and earnings',
    href: '/personal/income/',
    icon: <TrendingUp className="h-5 w-5 sm:h-6 sm:w-6" />,
    color: 'bg-[#87A96B]/10 text-[#87A96B]',
  },
  {
    title: 'Add Expense',
    description: 'Log your spending',
    href: '/personal/expenses',
    icon: <Receipt className="h-5 w-5 sm:h-6 sm:w-6" />,
    color: 'bg-[#FFA94D]/10 text-[#FFA94D]',
  },
  {
    title: 'View Reports',
    description: 'Analyze your finances',
    href: '/personal/reports',
    icon: <FileText className="h-5 w-5 sm:h-6 sm:w-6" />,
    color: 'bg-[#C4A35A]/10 text-[#C4A35A]',
  },
  {
    title: 'Settings',
    description: 'Manage preferences',
    href: '/personal/settings',
    icon: <Settings className="h-5 w-5 sm:h-6 sm:w-6" />,
    color: 'bg-[#8B8378]/10 text-[#8B8378]',
  },
];

export default function QuickActions() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
      {quickActions.map((action) => (
        <Link key={action.href} href={action.href}>
          <Card className="h-full transition-all hover:shadow-md active:scale-[0.98] hover:border-primary/50 cursor-pointer group">
            <CardContent className="pt-4 pb-4 sm:pt-6 sm:pb-6">
              <div className="flex flex-col items-center text-center space-y-2 sm:space-y-3">
                <div className={`p-2.5 sm:p-3 rounded-xl ${action.color} transition-transform group-hover:scale-110`}>
                  {action.icon}
                </div>
                <div>
                  <p className="font-semibold text-sm sm:text-base">{action.title}</p>
                  <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">{action.description}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
