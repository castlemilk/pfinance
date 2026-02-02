'use client';

import ReportGenerator from '../../../components/ReportGenerator';
import { useMultiUserFinance } from '../../../context/MultiUserFinanceContext';
import { useAuth } from '../../../context/AuthWithAdminContext';
import { Card, CardContent } from '@/components/ui/card';
import { Users } from 'lucide-react';

export default function SharedReportsPage() {
  const { user } = useAuth();
  const { activeGroup } = useMultiUserFinance();

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Sign In Required</h3>
            <p className="text-muted-foreground">
              You need to sign in to access shared finance reports.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!activeGroup) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Select a Finance Group</h3>
            <p className="text-muted-foreground">
              Please select or create a finance group from the Groups page to generate reports.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{activeGroup.name} Reports</h1>
        <p className="text-muted-foreground">
          Generate reports and insights for your shared finances
        </p>
      </div>
      
      <ReportGenerator mode="shared" groupId={activeGroup.id} />
    </div>
  );
}