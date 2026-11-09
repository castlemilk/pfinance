'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../context/AuthWithAdminContext';
import AuthModal from '../components/AuthModal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

function getSafeReturnUrl(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return '/shared';
  }
  return value;
}

function AuthPageContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = getSafeReturnUrl(searchParams.get('returnUrl'));
  const [showAuthModal, setShowAuthModal] = useState(true);

  useEffect(() => {
    if (!loading && user) {
      router.replace(returnUrl);
    }
  }, [user, loading, router, returnUrl]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <Link href="/personal">
            <Button variant="ghost" size="sm" className="mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Personal Finance
            </Button>
          </Link>
          <CardTitle className="text-2xl flex items-center gap-2">
            <Users className="w-6 h-6" />
            Sign In to PFinance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Sign in to access collaborative finance features:
          </p>
          <ul className="space-y-2 list-disc pl-5 text-sm text-muted-foreground">
            <li>Create and manage finance groups</li>
            <li>Split expenses with friends and family</li>
            <li>Track who owes what automatically</li>
            <li>Generate group financial reports</li>
            <li>Sync your data across devices</li>
          </ul>

          <Button
            onClick={() => setShowAuthModal(true)}
            className="w-full"
            size="lg"
          >
            Sign In / Sign Up
          </Button>
        </CardContent>
      </Card>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => {
          setShowAuthModal(false);
          router.push('/personal');
        }}
      />
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading sign in" />
      </div>
    }>
      <AuthPageContent />
    </Suspense>
  );
}
