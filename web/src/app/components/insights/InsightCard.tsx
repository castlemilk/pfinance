'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Lightbulb,
  Target,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { SpendingInsight, InsightType } from '@/gen/pfinance/v1/types_pb';

interface InsightCardProps {
  insight: SpendingInsight;
  compact?: boolean;
}

export default function InsightCard({ insight, compact = false }: InsightCardProps) {
  const getInsightConfig = (type: InsightType) => {
    switch (type) {
      case InsightType.SPENDING_INCREASE:
        return {
          icon: TrendingUp,
          color: 'text-red-500',
          bgColor: 'bg-red-500/10',
          borderColor: 'border-red-500/20',
        };
      case InsightType.SPENDING_DECREASE:
        return {
          icon: TrendingDown,
          color: 'text-green-500',
          bgColor: 'bg-green-500/10',
          borderColor: 'border-green-500/20',
        };
      case InsightType.UNUSUAL_TRANSACTION:
        return {
          icon: AlertTriangle,
          color: 'text-orange-500',
          bgColor: 'bg-orange-500/10',
          borderColor: 'border-orange-500/20',
        };
      case InsightType.CATEGORY_TREND:
        return {
          icon: DollarSign,
          color: 'text-blue-500',
          bgColor: 'bg-blue-500/10',
          borderColor: 'border-blue-500/20',
        };
      case InsightType.SAVINGS_TIP:
        return {
          icon: Lightbulb,
          color: 'text-yellow-500',
          bgColor: 'bg-yellow-500/10',
          borderColor: 'border-yellow-500/20',
        };
      case InsightType.BUDGET_WARNING:
        return {
          icon: AlertTriangle,
          color: 'text-red-500',
          bgColor: 'bg-red-500/10',
          borderColor: 'border-red-500/20',
        };
      case InsightType.GOAL_PROGRESS:
        return {
          icon: Target,
          color: 'text-purple-500',
          bgColor: 'bg-purple-500/10',
          borderColor: 'border-purple-500/20',
        };
      default:
        return {
          icon: DollarSign,
          color: 'text-muted-foreground',
          bgColor: 'bg-muted',
          borderColor: 'border-muted',
        };
    }
  };

  const config = getInsightConfig(insight.type);
  const Icon = config.icon;

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercent = (percent: number): string => {
    const sign = percent >= 0 ? '+' : '';
    return `${sign}${percent.toFixed(1)}%`;
  };

  if (compact) {
    return (
      <div className={`flex items-start gap-3 p-3 rounded-lg ${config.bgColor}`}>
        <div className={`p-1.5 rounded-md bg-background`}>
          {insight.icon ? (
            <span className="text-lg">{insight.icon}</span>
          ) : (
            <Icon className={`h-4 w-4 ${config.color}`} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{insight.title}</p>
          {insight.changePercent !== 0 && (
            <div className={`flex items-center gap-1 text-xs ${insight.isPositive ? 'text-green-600' : 'text-red-600'}`}>
              {insight.changePercent > 0 ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
              {formatPercent(insight.changePercent)}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <Card className={`border ${config.borderColor} transition-all hover:shadow-md`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${config.bgColor}`}>
            {insight.icon ? (
              <span className="text-2xl">{insight.icon}</span>
            ) : (
              <Icon className={`h-6 w-6 ${config.color}`} />
            )}
          </div>

          <div className="flex-1 space-y-2">
            <div className="flex items-start justify-between">
              <h4 className="font-semibold">{insight.title}</h4>
              {insight.isPositive ? (
                <Badge className="bg-green-500/20 text-green-600 border-green-500/30">Good</Badge>
              ) : (
                <Badge variant="outline" className="text-orange-500 border-orange-500/30">Attention</Badge>
              )}
            </div>

            <p className="text-sm text-muted-foreground">{insight.description}</p>

            <div className="flex items-center gap-4 pt-2">
              {insight.amount > 0 && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Amount: </span>
                  <span className="font-medium">{formatCurrency(insight.amount)}</span>
                </div>
              )}

              {insight.changePercent !== 0 && (
                <div className={`flex items-center gap-1 text-sm ${insight.isPositive ? 'text-green-600' : 'text-red-600'}`}>
                  {insight.changePercent > 0 ? (
                    <ArrowUpRight className="h-4 w-4" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4" />
                  )}
                  <span className="font-medium">{formatPercent(insight.changePercent)}</span>
                </div>
              )}

              {insight.category && (
                <Badge variant="secondary" className="text-xs">
                  {insight.category}
                </Badge>
              )}

              {insight.period && (
                <span className="text-xs text-muted-foreground">
                  {insight.period}
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
