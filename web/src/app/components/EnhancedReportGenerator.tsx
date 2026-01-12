'use client';

import { useState, useMemo } from 'react';
import { useFinance } from '../context/FinanceContext';
import { useMultiUserFinance } from '../context/MultiUserFinanceContext';
import { useAuth } from '../context/AuthWithAdminContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
// import { Textarea } from '@/components/ui/textarea';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  FileText, 
  Download, 
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  BarChart3,
  PieChart,
  // Calendar,
  // Share2,
  // Mail,
  Settings
} from 'lucide-react';

// Import enhanced utilities
import { 
  EnhancedReportGenerator as ReportGeneratorClass, 
  EnhancedReportData, 
  ExportFormat, 
  ReportTemplate,
  ChartData 
} from '../utils/enhancedReportGenerator';

// Report configuration
interface ReportConfig {
  title: string;
  subtitle?: string;
  template: ReportTemplate;
  period: 'week' | 'month' | 'quarter' | 'year' | 'custom';
  customStartDate?: string;
  customEndDate?: string;
  includeCharts: boolean;
  includeInsights: boolean;
  includeRecommendations: boolean;
  format: ExportFormat;
  emailRecipients?: string[];
  scheduleRecurring?: boolean;
  recurringFrequency?: 'weekly' | 'monthly' | 'quarterly';
}

// Insight generation
interface FinancialInsights {
  spendingTrends: Array<{ category: string; trend: 'up' | 'down' | 'stable'; percentage: number }>;
  savingsOpportunities: string[];
  budgetWarnings: string[];
  goalProgress: Array<{ goal: string; progress: number; onTrack: boolean }>;
  recommendations: string[];
}

export default function EnhancedReportGenerator() {
  const { user } = useAuth();
  const { 
    getTotalIncome, 
    getNetIncome, 
    getTotalExpenses, 
    getExpenseSummary,
    incomes,
    expenses
  } = useFinance();
  const { 
    activeGroup, 
    groupExpenses, 
    getUserOwedAmount, 
    getUserOwesAmount 
  } = useMultiUserFinance();

  const [config, setConfig] = useState<ReportConfig>({
    title: 'Monthly Financial Report',
    template: 'standard',
    period: 'month',
    includeCharts: true,
    includeInsights: true,
    includeRecommendations: true,
    format: 'pdf'
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [reportPreview, setReportPreview] = useState<EnhancedReportData | null>(null);
  // const [chartData, setChartData] = useState<ChartData | null>(null);
  const [insights, setInsights] = useState<FinancialInsights | null>(null);

  // Calculate date range
  const dateRange = useMemo(() => {
    const now = new Date();
    let start: Date;
    let end = new Date(now);

    switch (config.period) {
      case 'week':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'quarter':
        const quarterStart = Math.floor(now.getMonth() / 3) * 3;
        start = new Date(now.getFullYear(), quarterStart, 1);
        break;
      case 'year':
        start = new Date(now.getFullYear(), 0, 1);
        break;
      case 'custom':
        start = config.customStartDate ? new Date(config.customStartDate) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        end = config.customEndDate ? new Date(config.customEndDate) : now;
        break;
      default:
        start = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    return { start, end };
  }, [config.period, config.customStartDate, config.customEndDate]);

  // Generate comprehensive report data
  const generateReportData = useMemo((): EnhancedReportData => {
    const totalIncome = getTotalIncome('monthly');
    // const netIncome = getNetIncome('monthly');
    const totalExpenses = getTotalExpenses();
    const expenseSummary = getExpenseSummary();
    
    // Calculate monthly averages and trends
    const monthsDiff = Math.max(1, Math.ceil((dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24 * 30)));
    const monthlyIncomeAvg = totalIncome;
    const monthlyExpensesAvg = totalExpenses / 12;
    const monthlySavingsAvg = monthlyIncomeAvg - monthlyExpensesAvg;

    // Filter data by date range
    const filteredIncomes = incomes.filter(income => 
      income.date >= dateRange.start && income.date <= dateRange.end
    );

    const filteredExpenses = expenses.filter(expense => 
      expense.date >= dateRange.start && expense.date <= dateRange.end
    );

    // Calculate percentage breakdowns
    const incomeBreakdown = filteredIncomes.map(income => ({
      source: income.source,
      amount: income.amount,
      frequency: income.frequency,
      percentage: totalIncome > 0 ? (income.amount / totalIncome) * 100 : 0,
      trend: 'stable' as const // Would calculate from historical data
    }));

    const expenseBreakdown = expenseSummary.map(expense => ({
      ...expense,
      trend: 'stable' as const // Would calculate from historical data
    }));

    // Generate insights
    const topExpenseCategory = expenseBreakdown.length > 0 
      ? expenseBreakdown.reduce((prev, current) => prev.totalAmount > current.totalAmount ? prev : current).category
      : 'Other';

    const spendingTrend = monthlyExpensesAvg > monthlyIncomeAvg * 0.8 ? 'increasing' : 
                         monthlyExpensesAvg < monthlyIncomeAvg * 0.5 ? 'decreasing' : 'stable';

    const recommendations = generateRecommendations(
      totalIncome, 
      totalExpenses, 
      expenseBreakdown, 
      monthlySavingsAvg
    );

    const data: EnhancedReportData = {
      title: config.title,
      subtitle: config.subtitle,
      period: dateRange,
      income: {
        total: totalIncome * monthsDiff,
        monthlyAverage: monthlyIncomeAvg,
        breakdown: incomeBreakdown,
        trends: {
          previousPeriod: totalIncome * 0.95, // Mock data - would come from historical analysis
          growthRate: 5 // Mock 5% growth
        }
      },
      expenses: {
        total: totalExpenses,
        monthlyAverage: monthlyExpensesAvg,
        breakdown: expenseBreakdown,
        trends: {
          previousPeriod: totalExpenses * 0.98,
          changeRate: 2 // Mock 2% increase
        }
      },
      savings: {
        amount: monthlySavingsAvg * monthsDiff,
        rate: totalIncome > 0 ? (monthlySavingsAvg / monthlyIncomeAvg) * 100 : 0,
        monthlyAverage: monthlySavingsAvg,
        goalProgress: {
          target: monthlyIncomeAvg * 0.2 * 12, // 20% savings goal
          achieved: monthlySavingsAvg * 12,
          percentage: totalIncome > 0 ? (monthlySavingsAvg / (monthlyIncomeAvg * 0.2)) * 100 : 0
        }
      },
      insights: {
        topExpenseCategory,
        savingsRate: totalIncome > 0 ? (monthlySavingsAvg / monthlyIncomeAvg) * 100 : 0,
        spendingTrend,
        recommendations
      },
      metadata: {
        generatedAt: new Date(),
        reportId: `RPT-${Date.now()}`,
        version: '2.0',
        dataPoints: filteredIncomes.length + filteredExpenses.length
      }
    };

    // Add group data if applicable
    if (activeGroup && user) {
      const totalGroupExpenses = groupExpenses.reduce((sum, expense) => sum + expense.amount, 0);
      const userOwed = getUserOwedAmount(activeGroup.id, user.uid);
      const userOwes = getUserOwesAmount(activeGroup.id, user.uid);

      data.groupData = {
        name: activeGroup.name,
        members: activeGroup.members.length,
        totalGroupExpenses,
        userOwed,
        userOwes,
        netBalance: userOwed - userOwes,
        expenseBreakdown: [] // Would categorize group expenses
      };
    }

    return data;
  }, [
    config,
    dateRange,
    getTotalIncome,
    getNetIncome,
    getTotalExpenses,
    getExpenseSummary,
    incomes,
    expenses,
    activeGroup,
    groupExpenses,
    getUserOwedAmount,
    getUserOwesAmount,
    user
  ]);

  // Generate insights
  const generateInsights = (reportData: EnhancedReportData): FinancialInsights => {
    const spendingTrends = reportData.expenses.breakdown.map(expense => ({
      category: expense.category,
      trend: expense.trend || 'stable',
      percentage: expense.percentage
    }));

    const savingsRate = reportData.savings.rate;
    const savingsOpportunities = [];
    const budgetWarnings = [];
    const goalProgress = [];

    // Savings opportunities
    if (savingsRate < 10) {
      savingsOpportunities.push('Consider increasing your savings rate to at least 10% of income');
    }
    
    const topExpenseCategory = spendingTrends.reduce((prev, current) => 
      prev.percentage > current.percentage ? prev : current
    );
    
    if (topExpenseCategory.percentage > 40) {
      savingsOpportunities.push(`${topExpenseCategory.category} represents ${topExpenseCategory.percentage.toFixed(1)}% of expenses - consider reducing this category`);
    }

    // Budget warnings
    if (reportData.expenses.total > reportData.income.total) {
      budgetWarnings.push('⚠️ Expenses exceed income - immediate budget adjustment needed');
    }

    if (savingsRate < 5) {
      budgetWarnings.push('⚠️ Very low savings rate - financial emergency preparedness at risk');
    }

    // Goal progress
    if (reportData.savings.goalProgress) {
      goalProgress.push({
        goal: 'Emergency Fund (20% savings rate)',
        progress: reportData.savings.goalProgress.percentage,
        onTrack: reportData.savings.goalProgress.percentage >= 80
      });
    }

    return {
      spendingTrends,
      savingsOpportunities,
      budgetWarnings,
      goalProgress,
      recommendations: reportData.insights.recommendations
    };
  };

  // Generate recommendations
  const generateRecommendations = (
    income: number, 
    expenses: number, 
    expenseBreakdown: any[], 
    savings: number
  ): string[] => {
    const recommendations = [];
    const savingsRate = income > 0 ? (savings / income) * 100 : 0;

    if (savingsRate < 10) {
      recommendations.push('Increase your savings rate to at least 10-20% of income for financial security');
    }

    if (expenseBreakdown.length > 0) {
      const topExpense = expenseBreakdown.reduce((prev, current) => 
        prev.totalAmount > current.totalAmount ? prev : current
      );
      
      if (topExpense.percentage > 30) {
        recommendations.push(`Consider reducing ${topExpense.category} expenses, which represent ${topExpense.percentage.toFixed(1)}% of your total spending`);
      }
    }

    if (expenses > income) {
      recommendations.push('Create a debt reduction plan and eliminate unnecessary expenses immediately');
    } else if (savingsRate > 20) {
      recommendations.push('Excellent savings rate! Consider investing surplus funds for long-term growth');
    }

    recommendations.push('Review and categorize all transactions monthly to maintain accurate financial tracking');

    return recommendations;
  };

  // Generate and download report
  const generateReport = async () => {
    setIsGenerating(true);
    try {
      const reportData = generateReportData;
      const generator = new ReportGeneratorClass(reportData, config.template, config.includeCharts);
      
      let blob: Blob;
      let filename: string;
      
      switch (config.format) {
        case 'pdf':
          blob = await generator.generatePDF();
          filename = `financial-report-${reportData.period.start.toISOString().slice(0, 10)}.pdf`;
          break;
        case 'csv':
          const csvContent = generator.generateCSV();
          blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          filename = `financial-report-${reportData.period.start.toISOString().slice(0, 10)}.csv`;
          break;
        case 'xlsx':
          // Would use a library like xlsx to generate actual Excel file
          const xlsxData = generator.generateXLSXData();
          blob = new Blob([JSON.stringify(xlsxData)], { type: 'application/json' });
          filename = `financial-report-${reportData.period.start.toISOString().slice(0, 10)}.xlsx`;
          break;
        case 'json':
          const jsonContent = generator.generateJSON();
          blob = new Blob([jsonContent], { type: 'application/json' });
          filename = `financial-report-${reportData.period.start.toISOString().slice(0, 10)}.json`;
          break;
        default:
          throw new Error('Unsupported format');
      }

      // Download file
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      // Generate chart data for preview
      if (config.includeCharts) {
        // const charts = generator.generateChartData();
        // setChartData(charts);
      }

      // Generate insights
      if (config.includeInsights) {
        const generatedInsights = generateInsights(reportData);
        setInsights(generatedInsights);
      }

      setReportPreview(reportData);

    } catch (error) {
      console.error('Report generation failed:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Enhanced Financial Report Generator
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="config" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="config">Configuration</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
              <TabsTrigger value="insights">Insights</TabsTrigger>
            </TabsList>
            
            <TabsContent value="config" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Basic Configuration */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Basic Settings</h3>
                  
                  <div className="space-y-2">
                    <Label htmlFor="report-title">Report Title</Label>
                    <Input
                      id="report-title"
                      value={config.title}
                      onChange={(e) => setConfig(prev => ({ ...prev, title: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="report-subtitle">Subtitle (Optional)</Label>
                    <Input
                      id="report-subtitle"
                      value={config.subtitle || ''}
                      onChange={(e) => setConfig(prev => ({ ...prev, subtitle: e.target.value }))}
                      placeholder="Financial Analysis for Q1 2024"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="template">Report Template</Label>
                    <Select 
                      value={config.template} 
                      onValueChange={(value) => setConfig(prev => ({ ...prev, template: value as ReportTemplate }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="minimal">Minimal - Key metrics only</SelectItem>
                        <SelectItem value="standard">Standard - Comprehensive overview</SelectItem>
                        <SelectItem value="executive">Executive - Business-focused summary</SelectItem>
                        <SelectItem value="detailed">Detailed - Full analysis with appendix</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="period">Time Period</Label>
                    <Select 
                      value={config.period} 
                      onValueChange={(value) => setConfig(prev => ({ ...prev, period: value as any }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="week">Last 7 Days</SelectItem>
                        <SelectItem value="month">This Month</SelectItem>
                        <SelectItem value="quarter">This Quarter</SelectItem>
                        <SelectItem value="year">This Year</SelectItem>
                        <SelectItem value="custom">Custom Range</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {config.period === 'custom' && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="start-date">Start Date</Label>
                        <Input
                          id="start-date"
                          type="date"
                          value={config.customStartDate || ''}
                          onChange={(e) => setConfig(prev => ({ ...prev, customStartDate: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="end-date">End Date</Label>
                        <Input
                          id="end-date"
                          type="date"
                          value={config.customEndDate || ''}
                          onChange={(e) => setConfig(prev => ({ ...prev, customEndDate: e.target.value }))}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Advanced Configuration */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Advanced Options</h3>
                  
                  <div className="space-y-2">
                    <Label htmlFor="format">Export Format</Label>
                    <Select 
                      value={config.format} 
                      onValueChange={(value) => setConfig(prev => ({ ...prev, format: value as ExportFormat }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pdf">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4" />
                            PDF - Professional report
                          </div>
                        </SelectItem>
                        <SelectItem value="csv">
                          <div className="flex items-center gap-2">
                            <BarChart3 className="w-4 h-4" />
                            CSV - Data analysis
                          </div>
                        </SelectItem>
                        <SelectItem value="xlsx">
                          <div className="flex items-center gap-2">
                            <PieChart className="w-4 h-4" />
                            Excel - Spreadsheet format
                          </div>
                        </SelectItem>
                        <SelectItem value="json">
                          <div className="flex items-center gap-2">
                            <Settings className="w-4 h-4" />
                            JSON - Raw data
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="include-charts">Include Visual Charts</Label>
                      <Switch
                        id="include-charts"
                        checked={config.includeCharts}
                        onCheckedChange={(checked) => setConfig(prev => ({ ...prev, includeCharts: checked }))}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <Label htmlFor="include-insights">Include AI Insights</Label>
                      <Switch
                        id="include-insights"
                        checked={config.includeInsights}
                        onCheckedChange={(checked) => setConfig(prev => ({ ...prev, includeInsights: checked }))}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <Label htmlFor="include-recommendations">Include Recommendations</Label>
                      <Switch
                        id="include-recommendations"
                        checked={config.includeRecommendations}
                        onCheckedChange={(checked) => setConfig(prev => ({ ...prev, includeRecommendations: checked }))}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-6 border-t">
                <Button 
                  onClick={generateReport} 
                  disabled={isGenerating} 
                  className="flex-1"
                  size="lg"
                >
                  <Download className="w-4 h-4 mr-2" />
                  {isGenerating ? 'Generating Report...' : `Generate ${config.format.toUpperCase()} Report`}
                </Button>
                
                <Button 
                  variant="outline" 
                  onClick={() => {
                    const preview = generateReportData;
                    setReportPreview(preview);
                    if (config.includeInsights) {
                      setInsights(generateInsights(preview));
                    }
                  }}
                >
                  <TrendingUp className="w-4 h-4 mr-2" />
                  Preview
                </Button>
              </div>
            </TabsContent>
            
            <TabsContent value="preview" className="space-y-4">
              {reportPreview ? (
                <div className="space-y-6">
                  {/* Report Header */}
                  <div className="text-center p-6 border rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50">
                    <h2 className="text-2xl font-bold">{reportPreview.title}</h2>
                    {reportPreview.subtitle && (
                      <p className="text-lg text-muted-foreground mt-1">{reportPreview.subtitle}</p>
                    )}
                    <p className="text-sm text-muted-foreground mt-2">
                      {reportPreview.period.start.toLocaleDateString()} - {reportPreview.period.end.toLocaleDateString()}
                    </p>
                  </div>

                  {/* Key Metrics */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card>
                      <CardContent className="p-4 text-center">
                        <DollarSign className="w-8 h-8 mx-auto mb-2 text-green-500" />
                        <p className="text-sm text-muted-foreground">Total Income</p>
                        <p className="text-xl font-bold">${reportPreview.income.total.toLocaleString()}</p>
                        <p className="text-xs text-green-600">+{reportPreview.income.trends.growthRate.toFixed(1)}%</p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-4 text-center">
                        <TrendingDown className="w-8 h-8 mx-auto mb-2 text-red-500" />
                        <p className="text-sm text-muted-foreground">Total Expenses</p>
                        <p className="text-xl font-bold">${reportPreview.expenses.total.toLocaleString()}</p>
                        <p className="text-xs text-red-600">+{reportPreview.expenses.trends.changeRate.toFixed(1)}%</p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-4 text-center">
                        <TrendingUp className="w-8 h-8 mx-auto mb-2 text-blue-500" />
                        <p className="text-sm text-muted-foreground">Net Savings</p>
                        <p className="text-xl font-bold">${reportPreview.savings.amount.toLocaleString()}</p>
                        <p className="text-xs text-blue-600">{reportPreview.savings.rate.toFixed(1)}% rate</p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-4 text-center">
                        <BarChart3 className="w-8 h-8 mx-auto mb-2 text-purple-500" />
                        <p className="text-sm text-muted-foreground">Data Points</p>
                        <p className="text-xl font-bold">{reportPreview.metadata.dataPoints}</p>
                        <p className="text-xs text-purple-600">transactions</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Group Data */}
                  {reportPreview.groupData && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Users className="w-5 h-5" />
                          Group: {reportPreview.groupData.name}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <p className="text-sm text-muted-foreground">Members</p>
                            <p className="text-lg font-semibold">{reportPreview.groupData.members}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Group Expenses</p>
                            <p className="text-lg font-semibold">${reportPreview.groupData.totalGroupExpenses.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">You're Owed</p>
                            <p className="text-lg font-semibold text-green-600">${reportPreview.groupData.userOwed.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">You Owe</p>
                            <p className="text-lg font-semibold text-red-600">${reportPreview.groupData.userOwes.toFixed(2)}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Report Metadata */}
                  <div className="text-xs text-muted-foreground text-center space-y-1">
                    <p>Report ID: {reportPreview.metadata.reportId}</p>
                    <p>Generated: {reportPreview.metadata.generatedAt.toLocaleString()}</p>
                    <p>Template: {config.template} | Format: {config.format.toUpperCase()}</p>
                  </div>
                </div>
              ) : (
                <div className="text-center p-8 text-muted-foreground">
                  <BarChart3 className="w-12 h-12 mx-auto mb-4" />
                  <p>Click "Preview" to see your report preview</p>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="insights" className="space-y-4">
              {insights ? (
                <div className="space-y-6">
                  {/* Budget Warnings */}
                  {insights.budgetWarnings.length > 0 && (
                    <Card className="border-red-200">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-red-600">
                          <TrendingDown className="w-5 h-5" />
                          Budget Warnings
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {insights.budgetWarnings.map((warning, index) => (
                            <div key={index} className="flex items-center gap-2 p-2 bg-red-50 rounded">
                              <Badge variant="destructive" className="text-xs">Warning</Badge>
                              <span className="text-sm">{warning}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Savings Opportunities */}
                  <Card className="border-green-200">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-green-600">
                        <TrendingUp className="w-5 h-5" />
                        Savings Opportunities
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {insights.savingsOpportunities.map((opportunity, index) => (
                          <div key={index} className="flex items-center gap-2 p-2 bg-green-50 rounded">
                            <Badge variant="outline" className="text-xs text-green-600">Tip</Badge>
                            <span className="text-sm">{opportunity}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Spending Trends */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <PieChart className="w-5 h-5" />
                        Spending Trends
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {insights.spendingTrends.map((trend, index) => (
                          <div key={index} className="flex items-center justify-between p-2 border rounded">
                            <div>
                              <span className="font-medium">{trend.category}</span>
                              <span className="text-sm text-muted-foreground ml-2">
                                {trend.percentage.toFixed(1)}% of expenses
                              </span>
                            </div>
                            <Badge 
                              variant={trend.trend === 'up' ? 'destructive' : trend.trend === 'down' ? 'default' : 'secondary'}
                            >
                              {trend.trend === 'up' ? '↗ Increasing' : trend.trend === 'down' ? '↘ Decreasing' : '→ Stable'}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Recommendations */}
                  <Card className="border-blue-200">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-blue-600">
                        <BarChart3 className="w-5 h-5" />
                        Personalized Recommendations
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {insights.recommendations.map((recommendation, index) => (
                          <div key={index} className="flex items-start gap-3 p-3 bg-blue-50 rounded">
                            <div className="flex-shrink-0 w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-xs font-medium text-blue-600">
                              {index + 1}
                            </div>
                            <span className="text-sm">{recommendation}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div className="text-center p-8 text-muted-foreground">
                  <TrendingUp className="w-12 h-12 mx-auto mb-4" />
                  <p>Generate a report to see personalized insights and recommendations</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}