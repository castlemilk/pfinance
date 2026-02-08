'use client';

import InsightsDashboard from '../../../components/insights/InsightsDashboard';

export default function InsightsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Spending Insights</h1>
        <p className="text-muted-foreground">
          AI-powered analysis of your spending patterns and trends
        </p>
      </div>

      {/* Full Insights Dashboard */}
      <InsightsDashboard />
    </div>
  );
}
