'use client';

import { ReactNode } from 'react';
import EnhancedGroupSelector from '../../components/EnhancedGroupSelector';
import { useAuth } from '../../context/AuthWithAdminContext';
import { Card, CardContent } from '@/components/ui/card';
import { Users } from 'lucide-react';

interface SharedLayoutProps {
  children: ReactNode;
}

export default function SharedLayout({ children }: SharedLayoutProps) {
  const { user, loading } = useAuth();

  // Show loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Show auth prompt if no user
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Sign In Required</h3>
            <p className="text-muted-foreground">
              You need to sign in to access shared finance features.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      {/* Group Selector - Always visible on all shared pages */}
      <EnhancedGroupSelector />

      {/* Page Content */}
      <div className="mt-6">
        {children}
      </div>
    </>
  );
}
