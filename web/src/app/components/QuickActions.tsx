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
    icon: <TrendingUp className="h-6 w-6" />,
    color: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
  },
  {
    title: 'Add Expense',
    description: 'Log your spending',
    href: '/personal/expenses',
    icon: <Receipt className="h-6 w-6" />,
    color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
  },
  {
    title: 'View Reports',
    description: 'Analyze your finances',
    href: '/personal/reports',
    icon: <FileText className="h-6 w-6" />,
    color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
  },
  {
    title: 'Settings',
    description: 'Manage preferences',
    href: '/personal/settings',
    icon: <Settings className="h-6 w-6" />,
    color: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
  },
];

export default function QuickActions() {
  return (
    <div className="grid grid-cols-2 gap-4">
      {quickActions.map((action) => (
        <Link key={action.href} href={action.href}>
          <Card className="h-full transition-all hover:shadow-md hover:border-primary/50 cursor-pointer group">
            <CardContent className="pt-6 pb-6">
              <div className="flex flex-col items-center text-center space-y-3">
                <div className={`p-3 rounded-xl ${action.color} transition-transform group-hover:scale-110`}>
                  {action.icon}
                </div>
                <div>
                  <p className="font-semibold">{action.title}</p>
                  <p className="text-sm text-muted-foreground">{action.description}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
