'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { useAuth } from '../context/AuthWithAdminContext';
import {
  X,
  Check,
  Circle,
  Calculator,
  Receipt,
  Target,
  PieChart,
  ChevronRight,
} from 'lucide-react';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
}

const onboardingSteps: OnboardingStep[] = [
  {
    id: 'calculate-income',
    title: 'Calculate your take-home pay',
    description: 'Know exactly what lands in your account',
    href: '/personal/income/',
    icon: <Calculator className="h-5 w-5" />,
  },
  {
    id: 'add-expense',
    title: 'Add your first expense',
    description: 'Start tracking where your money goes',
    href: '/personal/expenses',
    icon: <Receipt className="h-5 w-5" />,
  },
  {
    id: 'set-budget',
    title: 'Set a budget goal',
    description: 'Define spending limits by category',
    href: '/personal/expenses',
    icon: <Target className="h-5 w-5" />,
  },
  {
    id: 'review-summary',
    title: 'Review your financial summary',
    description: 'See the complete picture',
    href: '/personal',
    icon: <PieChart className="h-5 w-5" />,
  },
];

const STORAGE_KEY_PREFIX = 'pfinance-onboarding';

interface OnboardingState {
  completedSteps: string[];
  dismissed: boolean;
}

export default function OnboardingChecklist() {
  const { user } = useAuth();
  const [state, setState] = useState<OnboardingState>({
    completedSteps: [],
    dismissed: false,
  });
  const [isLoaded, setIsLoaded] = useState(false);

  const storageKey = user ? `${STORAGE_KEY_PREFIX}-${user.uid}` : STORAGE_KEY_PREFIX;

  // Load state from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setState(parsed);
      } catch {
        // Invalid JSON, use default state
      }
    }
    setIsLoaded(true);
  }, [storageKey]);

  // Save state to localStorage
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(storageKey, JSON.stringify(state));
    }
  }, [state, storageKey, isLoaded]);

  const handleDismiss = () => {
    setState((prev) => ({ ...prev, dismissed: true }));
  };

  const handleStepClick = (stepId: string) => {
    if (!state.completedSteps.includes(stepId)) {
      setState((prev) => ({
        ...prev,
        completedSteps: [...prev.completedSteps, stepId],
      }));
    }
  };

  // Don't render until loaded from localStorage to avoid hydration mismatch
  if (!isLoaded) {
    return null;
  }

  // Don't render if dismissed
  if (state.dismissed) {
    return null;
  }

  const completedCount = state.completedSteps.length;
  const totalSteps = onboardingSteps.length;
  const progress = (completedCount / totalSteps) * 100;

  // Don't show if all steps completed
  if (completedCount === totalSteps) {
    return null;
  }

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Getting Started</CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={handleDismiss}
            aria-label="Dismiss onboarding checklist"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <p className="text-sm text-muted-foreground">
            {completedCount} of {totalSteps} completed
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {onboardingSteps.map((step) => {
          const isCompleted = state.completedSteps.includes(step.id);
          return (
            <Link
              key={step.id}
              href={step.href}
              onClick={() => handleStepClick(step.id)}
              className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                isCompleted
                  ? 'bg-muted/50 text-muted-foreground'
                  : 'hover:bg-muted/50'
              }`}
            >
              <div
                className={`flex-shrink-0 ${
                  isCompleted ? 'text-green-500' : 'text-muted-foreground'
                }`}
              >
                {isCompleted ? (
                  <Check className="h-5 w-5" />
                ) : (
                  <Circle className="h-5 w-5" />
                )}
              </div>
              <div
                className={`p-2 rounded-lg ${
                  isCompleted
                    ? 'bg-muted text-muted-foreground'
                    : 'bg-primary/10 text-primary'
                }`}
              >
                {step.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className={`font-medium ${
                    isCompleted ? 'line-through' : ''
                  }`}
                >
                  {step.title}
                </p>
                <p className="text-sm text-muted-foreground truncate">
                  {step.description}
                </p>
              </div>
              {!isCompleted && (
                <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              )}
            </Link>
          );
        })}
        <div className="pt-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground hover:text-foreground"
            onClick={handleDismiss}
          >
            Skip for now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
