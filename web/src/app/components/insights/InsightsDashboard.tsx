'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthWithAdminContext';
import { financeClient } from '@/lib/financeService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import InsightCard from './InsightCard';
import {
  SpendingInsight,
  InsightType,
} from '@/gen/pfinance/v1/types_pb';
import {
  Sparkles,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Lightbulb,
  ChevronLeft,
  ChevronRight,
  Calendar,
} from 'lucide-react';

type Period = 'week' | 'month' | 'quarter' | 'year';

interface InsightsDashboardProps {
  compact?: boolean;
  limit?: number;
}

export default function InsightsDashboard({ compact = false, limit }: InsightsDashboardProps) {
  const { user } = useAuth();
  const [insights, setInsights] = useState<SpendingInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('month');
  const [carouselIndex, setCarouselIndex] = useState(0);

  const userId = user?.uid || 'demo-user';
  const isAuthenticated = !!user;

  const fetchInsights = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (isAuthenticated) {
        const response = await financeClient.getSpendingInsights({
          userId,
          period,
          limit: limit || 10,
        });

        setInsights(response.insights);
      } else {
        // Demo mode: Generate some sample insights
        setInsights(generateDemoInsights(period));
      }
    } catch (e) {
      console.error('Failed to fetch insights:', e);
      setError('Failed to load insights');
      // Fall back to demo insights
      setInsights(generateDemoInsights(period));
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, userId, period, limit]);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  const handleRefresh = () => {
    fetchInsights();
  };

  const nextCarousel = () => {
    setCarouselIndex((prev) => (prev + 1) % Math.max(1, insights.length));
  };

  const prevCarousel = () => {
    setCarouselIndex((prev) => (prev - 1 + insights.length) % Math.max(1, insights.length));
  };

  // Calculate summary stats
  const positiveInsights = insights.filter(i => i.isPositive).length;
  const attentionInsights = insights.filter(i => !i.isPositive).length;
  const tipsCount = insights.filter(i => i.type === InsightType.SAVINGS_TIP).length;

  if (compact) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Insights
            </CardTitle>
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger className="w-[100px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Week</SelectItem>
                <SelectItem value="month">Month</SelectItem>
                <SelectItem value="quarter">Quarter</SelectItem>
                <SelectItem value="year">Year</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : insights.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No insights available for this period.
            </p>
          ) : (
            <>
              {insights.slice(0, limit || 3).map((insight, index) => (
                <InsightCard key={insight.id || index} insight={insight} compact />
              ))}
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            Spending Insights
          </h2>
          <p className="text-muted-foreground">
            AI-powered analysis of your spending patterns
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-[140px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="quarter">This Quarter</SelectItem>
              <SelectItem value="year">This Year</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="icon" onClick={handleRefresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <TrendingDown className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <div className="text-2xl font-bold">{positiveInsights}</div>
              <div className="text-sm text-muted-foreground">Positive</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-500/10">
              <TrendingUp className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <div className="text-2xl font-bold">{attentionInsights}</div>
              <div className="text-sm text-muted-foreground">Attention</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/10">
              <Lightbulb className="h-5 w-5 text-yellow-500" />
            </div>
            <div>
              <div className="text-2xl font-bold">{tipsCount}</div>
              <div className="text-sm text-muted-foreground">Tips</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Carousel for Featured Insight */}
      {insights.length > 0 && (
        <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <Badge variant="outline" className="text-primary border-primary/30">
                Featured Insight
              </Badge>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={prevCarousel} disabled={insights.length <= 1}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">
                  {carouselIndex + 1} / {insights.length}
                </span>
                <Button variant="ghost" size="icon" onClick={nextCarousel} disabled={insights.length <= 1}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <InsightCard insight={insights[carouselIndex]} />
          </CardContent>
        </Card>
      )}

      {/* All Insights */}
      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={handleRefresh}>Try Again</Button>
          </CardContent>
        </Card>
      ) : insights.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Sparkles className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Insights Yet</h3>
            <p className="text-muted-foreground">
              Add more expenses and check back later to see AI-powered insights about your spending patterns.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {insights.map((insight, index) => (
            <InsightCard key={insight.id || index} insight={insight} />
          ))}
        </div>
      )}
    </div>
  );
}

// Helper to generate demo insights
function generateDemoInsights(period: Period): SpendingInsight[] {
  const periodLabel = period === 'week' ? 'this week' : period === 'month' ? 'this month' : period === 'quarter' ? 'this quarter' : 'this year';

  return [
    {
      id: '1',
      type: InsightType.SPENDING_DECREASE,
      title: `Food spending down 15% ${periodLabel}`,
      description: 'Great job! You\'ve reduced your food spending compared to last period.',
      category: 'FOOD',
      amount: 450,
      changePercent: -15,
      period: periodLabel,
      icon: '📉',
      isPositive: true,
      createdAt: undefined,
    } as SpendingInsight,
    {
      id: '2',
      type: InsightType.SPENDING_INCREASE,
      title: `Entertainment spending up 25% ${periodLabel}`,
      description: 'Your entertainment spending has increased. Consider setting a budget.',
      category: 'ENTERTAINMENT',
      amount: 320,
      changePercent: 25,
      period: periodLabel,
      icon: '📈',
      isPositive: false,
      createdAt: undefined,
    } as SpendingInsight,
    {
      id: '3',
      type: InsightType.SAVINGS_TIP,
      title: 'Savings tip',
      description: 'Consider reducing Entertainment spending to meet your savings goals. This category accounts for 18% of your spending.',
      category: 'ENTERTAINMENT',
      amount: 0,
      changePercent: 0,
      period: periodLabel,
      icon: '💡',
      isPositive: true,
      createdAt: undefined,
    } as SpendingInsight,
    {
      id: '4',
      type: InsightType.CATEGORY_TREND,
      title: `Transportation costs stable`,
      description: 'Your transportation spending has remained consistent with last period.',
      category: 'TRANSPORTATION',
      amount: 280,
      changePercent: 2,
      period: periodLabel,
      icon: '🚗',
      isPositive: true,
      createdAt: undefined,
    } as SpendingInsight,
  ];
}
