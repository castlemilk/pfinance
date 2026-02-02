'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '../../../context/AuthWithAdminContext';
import { useMultiUserFinance } from '../../../context/MultiUserFinanceContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { 
  Users, 
  Loader2, 
  Check, 
  AlertCircle,
  LogIn,
  UserPlus
} from 'lucide-react';

function JoinPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const { getInviteLinkByCode, joinGroupByCode, setActiveGroup } = useMultiUserFinance();

  const code = searchParams.get('code');
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof getInviteLinkByCode>>>(null);

  // Load invite link preview
  useEffect(() => {
    const loadPreview = async () => {
      if (!code) {
        setError('No invite code provided');
        setLoading(false);
        return;
      }

      try {
        const result = await getInviteLinkByCode(code);
        if (result) {
          setPreview(result);
        } else {
          setError('Invalid or expired invite code');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load invite');
      } finally {
        setLoading(false);
      }
    };

    loadPreview();
  }, [code, getInviteLinkByCode]);

  const handleJoin = async () => {
    if (!code) return;

    setJoining(true);
    try {
      const group = await joinGroupByCode(code);
      setActiveGroup(group);
      router.push('/shared');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join group');
      setJoining(false);
    }
  };

  const handleLoginRedirect = () => {
    // Store the code in sessionStorage to use after login
    if (code) {
      sessionStorage.setItem('pendingJoinCode', code);
    }
    router.push('/auth/login?returnUrl=/shared/join');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Loading invite...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-6 w-6" />
              Invalid Invite
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <Button 
              className="w-full" 
              variant="outline"
              onClick={() => router.push('/shared')}
            >
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!preview) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Users className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle>You&apos;re invited to join</CardTitle>
          <CardDescription className="text-2xl font-bold text-foreground mt-2">
            {preview.group.name}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {preview.group.description && (
            <p className="text-center text-muted-foreground">
              {preview.group.description}
            </p>
          )}

          <div className="flex justify-center gap-2">
            <Badge variant="secondary">
              <Users className="h-3 w-3 mr-1" />
              {preview.group.members.length} members
            </Badge>
            <Badge variant="outline">
              Joining as {preview.link.defaultRole}
            </Badge>
          </div>

          {user ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
                <Check className="h-5 w-5 text-green-500" />
                <div>
                  <p className="font-medium">{user.displayName || user.email}</p>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
              </div>
              
              <Button 
                className="w-full" 
                size="lg"
                onClick={handleJoin}
                disabled={joining}
              >
                {joining ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Joining...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-5 w-5 mr-2" />
                    Join Group
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  You need to log in to join this group
                </AlertDescription>
              </Alert>
              
              <Button 
                className="w-full" 
                size="lg"
                onClick={handleLoginRedirect}
              >
                <LogIn className="h-5 w-5 mr-2" />
                Log in to Join
              </Button>
            </div>
          )}

          <p className="text-center text-xs text-muted-foreground">
            Invite code: <code className="bg-muted px-1 rounded">{code}</code>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    }>
      <JoinPageContent />
    </Suspense>
  );
}
