'use client';

import ReportGenerator from '../../../components/ReportGenerator';

export default function PersonalReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Financial Reports</h1>
        <p className="text-muted-foreground">
          Generate detailed reports and insights about your personal finances
        </p>
      </div>
      
      <ReportGenerator mode="personal" />
    </div>
  );
}