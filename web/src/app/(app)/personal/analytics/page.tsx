'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ProFeatureGate } from '../../../components/ProFeatureGate';
import {
  LazySpendingHeatmap,
  LazySpendingTrendChart,
  LazyCategoryRadarChart,
  LazyAnomalyScatterPlot,
  LazyCashFlowForecast,
  LazyWaterfallChart,
} from '../../../components/charts';
import {
  useHeatmapData,
  useSpendingTrends,
  useCategoryComparison,
  useAnomalies,
  useCashFlowForecast,
  useWaterfallData,
} from '../../../metrics/hooks/useAnalyticsData';
import { useExtractionMetrics } from '../../../metrics/hooks/useExtractionMetrics';
import { UpgradePrompt } from '../../../components/ProFeatureGate';
import { AlertCircle, FileSearch } from 'lucide-react';
import { useFinance } from '../../../context/FinanceContext';

function isSubscriptionError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('pro subscription') ||
    lower.includes('pro tier') ||
    lower.includes('requires a pro');
}

function ErrorBanner({ message }: { message: string }) {
  if (isSubscriptionError(message)) {
    return <UpgradePrompt feature="Advanced Analytics" />;
  }

  return (
    <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
      <AlertCircle className="h-4 w-4 shrink-0" />
      {message}
    </div>
  );
}

function LoadingSkeleton() {
  return <Skeleton className="h-[400px] w-full" />;
}

// ============================================================================
// Tab: Heatmap
// ============================================================================

function HeatmapTab() {
  const router = useRouter();
  const { expenses } = useFinance();
  const [range, setRange] = useState<'3m' | '6m' | '1y'>('6m');

  const handleDayClick = useCallback((date: string) => {
    router.push(`/personal/expenses?date=${date}`);
  }, [router]);

  const { startDate, endDate } = useMemo(() => {
    const end = new Date();
    const start = new Date();
    if (range === '3m') start.setMonth(start.getMonth() - 3);
    else if (range === '6m') start.setMonth(start.getMonth() - 6);
    else start.setFullYear(start.getFullYear() - 1);
    return { startDate: start, endDate: end };
  }, [range]);

  const { data, loading, error } = useHeatmapData(startDate, endDate);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Spending Heatmap</CardTitle>
          <CardDescription>Daily spending intensity over time</CardDescription>
        </div>
        <Select value={range} onValueChange={(v) => setRange(v as typeof range)}>
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="3m">3 months</SelectItem>
            <SelectItem value="6m">6 months</SelectItem>
            <SelectItem value="1y">1 year</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {error && <ErrorBanner message={error} />}
        {loading && <LoadingSkeleton />}
        {data && (
          <div className="h-[500px]">
            <LazySpendingHeatmap data={data} onDayClick={handleDayClick} expenses={expenses} />
          </div>
        )}
        {!loading && !error && !data && (
          <div className="h-[500px] flex items-center justify-center text-muted-foreground text-sm">
            No spending data available for this period.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Tab: Trends
// ============================================================================

function TrendsTab() {
  const [granularity, setGranularity] = useState<'day' | 'week' | 'month'>('week');
  const [periods, setPeriods] = useState(12);

  const { expenseSeries, incomeSeries, trendSlope, trendRSquared, loading, error } =
    useSpendingTrends(granularity, periods);

  const chartData = useMemo(
    () =>
      expenseSeries.map((pt) => ({
        date: pt.date,
        value: pt.valueCents !== BigInt(0) ? Number(pt.valueCents) / 100 : pt.value,
        label: pt.label,
      })),
    [expenseSeries]
  );

  const incomeData = useMemo(
    () =>
      incomeSeries.map((pt) => ({
        date: pt.date,
        value: pt.valueCents !== BigInt(0) ? Number(pt.valueCents) / 100 : pt.value,
        label: pt.label,
      })),
    [incomeSeries]
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Spending Trends</CardTitle>
          <CardDescription>Track spending patterns over time</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Select value={granularity} onValueChange={(v) => setGranularity(v as typeof granularity)}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Daily</SelectItem>
              <SelectItem value="week">Weekly</SelectItem>
              <SelectItem value="month">Monthly</SelectItem>
            </SelectContent>
          </Select>
          <Select value={String(periods)} onValueChange={(v) => setPeriods(Number(v))}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="6">6 periods</SelectItem>
              <SelectItem value="12">12 periods</SelectItem>
              <SelectItem value="24">24 periods</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {error && <ErrorBanner message={error} />}
        {loading && <LoadingSkeleton />}
        {!loading && !error && chartData.length > 0 && (
          <div className="h-[400px]">
            <LazySpendingTrendChart
              expenseSeries={chartData}
              incomeSeries={incomeData}
              trendSlope={trendSlope}
              trendRSquared={trendRSquared}
            />
          </div>
        )}
        {!loading && !error && chartData.length === 0 && (
          <div className="h-[400px] flex items-center justify-center text-muted-foreground text-sm">
            No trend data available.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Tab: Categories
// ============================================================================

function CategoriesTab() {
  const [includeBudgets, setIncludeBudgets] = useState(true);
  const { data, loading, error } = useCategoryComparison(includeBudgets);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Category Comparison</CardTitle>
          <CardDescription>Compare spending across categories vs previous period</CardDescription>
        </div>
        <button
          onClick={() => setIncludeBudgets(!includeBudgets)}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {includeBudgets ? 'Hide budgets' : 'Show budgets'}
        </button>
      </CardHeader>
      <CardContent>
        {error && <ErrorBanner message={error} />}
        {loading && <LoadingSkeleton />}
        {!loading && !error && data && data.length > 0 && (
          <div className="h-[400px]">
            <LazyCategoryRadarChart data={data} />
          </div>
        )}
        {!loading && !error && (!data || data.length === 0) && (
          <div className="h-[400px] flex items-center justify-center text-muted-foreground text-sm">
            No category data available.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Tab: Anomalies
// ============================================================================

function AnomaliesTab() {
  const [sensitivity, setSensitivity] = useState(0.5);
  const { data, totalAnomalousSpend, loading, error } = useAnomalies(90, sensitivity);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Spending Anomalies</CardTitle>
            <CardDescription>Detect unusual transactions in the last 90 days</CardDescription>
          </div>
          {data && data.length > 0 && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{data.length} anomalies</Badge>
              <Badge variant="outline">${totalAnomalousSpend.toFixed(2)} total</Badge>
            </div>
          )}
        </div>
        <div className="flex items-center gap-4 pt-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">Sensitivity:</span>
          <Slider
            value={[sensitivity]}
            onValueChange={(v) => setSensitivity(v[0])}
            min={0.1}
            max={1.0}
            step={0.1}
            className="w-48"
          />
          <span className="text-sm font-mono w-8">{sensitivity.toFixed(1)}</span>
        </div>
      </CardHeader>
      <CardContent>
        {error && <ErrorBanner message={error} />}
        {loading && <LoadingSkeleton />}
        {!loading && !error && data && data.length > 0 && (
          <div className="h-[400px]">
            <LazyAnomalyScatterPlot data={data} />
          </div>
        )}
        {!loading && !error && (!data || data.length === 0) && (
          <div className="h-[400px] flex items-center justify-center text-muted-foreground text-sm">
            No anomalies detected. Your spending looks normal!
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Tab: Forecast
// ============================================================================

function ForecastTab() {
  const [forecastDays, setForecastDays] = useState(30);
  const { incomeForecast, expenseForecast, netForecast, loading, error } =
    useCashFlowForecast(forecastDays);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Cash Flow Forecast</CardTitle>
          <CardDescription>Predict future income and expenses</CardDescription>
        </div>
        <Select value={String(forecastDays)} onValueChange={(v) => setForecastDays(Number(v))}>
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="14">2 weeks</SelectItem>
            <SelectItem value="30">1 month</SelectItem>
            <SelectItem value="90">3 months</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {error && <ErrorBanner message={error} />}
        {loading && <LoadingSkeleton />}
        {!loading && !error && expenseForecast && (
          <div className="h-[400px]">
            <LazyCashFlowForecast
              incomeForecast={incomeForecast ?? []}
              expenseForecast={expenseForecast ?? []}
              netForecast={netForecast ?? []}
            />
          </div>
        )}
        {!loading && !error && !expenseForecast && (
          <div className="h-[400px] flex items-center justify-center text-muted-foreground text-sm">
            No forecast data available.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Tab: Flow (Waterfall)
// ============================================================================

function FlowTab() {
  const [period, setPeriod] = useState(30);
  const { data, loading, error } = useWaterfallData(period);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Money Flow</CardTitle>
          <CardDescription>Visualize income through expenses to savings</CardDescription>
        </div>
        <Select value={String(period)} onValueChange={(v) => setPeriod(Number(v))}>
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30">Month</SelectItem>
            <SelectItem value="90">Quarter</SelectItem>
            <SelectItem value="365">Year</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {error && <ErrorBanner message={error} />}
        {loading && <LoadingSkeleton />}
        {!loading && !error && data && data.length > 0 && (
          <div className="h-[400px]">
            <LazyWaterfallChart data={data} />
          </div>
        )}
        {!loading && !error && (!data || data.length === 0) && (
          <div className="h-[400px] flex items-center justify-center text-muted-foreground text-sm">
            No flow data available.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Tab: Extraction Quality
// ============================================================================

function ExtractionTab() {
  const [days, setDays] = useState(30);
  const { data, loading, error } = useExtractionMetrics(days);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Extraction Quality</CardTitle>
          <CardDescription>ML extraction accuracy and correction metrics</CardDescription>
        </div>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 days</SelectItem>
            <SelectItem value="30">30 days</SelectItem>
            <SelectItem value="90">90 days</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {error && <ErrorBanner message={error} />}
        {loading && <LoadingSkeleton />}
        {!loading && !error && data && (
          <div className="space-y-6">
            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg border bg-card">
                <div className="text-sm text-muted-foreground">Extractions</div>
                <div className="text-2xl font-bold">{data.totalExtractions}</div>
              </div>
              <div className="p-4 rounded-lg border bg-card">
                <div className="text-sm text-muted-foreground">Transactions</div>
                <div className="text-2xl font-bold">{data.totalTransactions}</div>
              </div>
              <div className="p-4 rounded-lg border bg-card">
                <div className="text-sm text-muted-foreground">Avg Confidence</div>
                <div className="text-2xl font-bold">
                  {(data.averageConfidence * 100).toFixed(1)}%
                </div>
              </div>
              <div className="p-4 rounded-lg border bg-card">
                <div className="text-sm text-muted-foreground">Correction Rate</div>
                <div className="text-2xl font-bold">
                  {(data.correctionRate * 100).toFixed(1)}%
                </div>
              </div>
            </div>

            {/* Corrections by Field */}
            {Object.keys(data.correctionsByField).length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-3">Corrections by Field</h4>
                <div className="space-y-2">
                  {Object.entries(data.correctionsByField)
                    .sort(([, a], [, b]) => b - a)
                    .map(([field, count]) => {
                      const maxCount = Math.max(...Object.values(data.correctionsByField));
                      const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
                      return (
                        <div key={field} className="flex items-center gap-3">
                          <span className="text-sm text-muted-foreground w-28 truncate">
                            {field.replace('CORRECTION_FIELD_TYPE_', '').toLowerCase()}
                          </span>
                          <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-sm font-mono w-8 text-right">{count}</span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Corrections by Category */}
            {Object.keys(data.correctionsByCategory).length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-3">Corrections by Category</h4>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(data.correctionsByCategory)
                    .sort(([, a], [, b]) => b - a)
                    .map(([category, count]) => (
                      <Badge key={category} variant="secondary">
                        {category.replace('EXPENSE_CATEGORY_', '').toLowerCase()}: {count}
                      </Badge>
                    ))}
                </div>
              </div>
            )}

            {/* Recent Events */}
            {data.recentEvents.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-3">Recent Extractions</h4>
                <div className="space-y-2">
                  {data.recentEvents.slice(0, 10).map((event) => (
                    <div
                      key={event.id}
                      className="flex items-center justify-between p-3 rounded-lg border text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <FileSearch className="h-4 w-4 text-muted-foreground" />
                        <span>{event.transactionCount} transactions</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={event.overallConfidence >= 0.8 ? 'default' : 'secondary'}>
                          {(event.overallConfidence * 100).toFixed(0)}%
                        </Badge>
                        <span className="text-muted-foreground">
                          {event.processingTimeMs}ms
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.totalExtractions === 0 && (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                No extraction data yet. Extract a receipt or bank statement to see metrics.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Analytics Page
// ============================================================================

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Advanced Analytics</h2>
        <p className="text-muted-foreground">
          Deep insights into your spending patterns, anomalies, and forecasts
        </p>
      </div>

      <ProFeatureGate feature="Advanced Analytics" mode="blur">
        <Tabs defaultValue="heatmap" className="space-y-4">
          <TabsList>
            <TabsTrigger value="heatmap">Heatmap</TabsTrigger>
            <TabsTrigger value="trends">Trends</TabsTrigger>
            <TabsTrigger value="categories">Categories</TabsTrigger>
            <TabsTrigger value="anomalies">Anomalies</TabsTrigger>
            <TabsTrigger value="forecast">Forecast</TabsTrigger>
            <TabsTrigger value="flow">Flow</TabsTrigger>
            <TabsTrigger value="extraction">Extraction</TabsTrigger>
          </TabsList>

          <TabsContent value="heatmap">
            <HeatmapTab />
          </TabsContent>
          <TabsContent value="trends">
            <TrendsTab />
          </TabsContent>
          <TabsContent value="categories">
            <CategoriesTab />
          </TabsContent>
          <TabsContent value="anomalies">
            <AnomaliesTab />
          </TabsContent>
          <TabsContent value="forecast">
            <ForecastTab />
          </TabsContent>
          <TabsContent value="flow">
            <FlowTab />
          </TabsContent>
          <TabsContent value="extraction">
            <ExtractionTab />
          </TabsContent>
        </Tabs>
      </ProFeatureGate>
    </div>
  );
}
