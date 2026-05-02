'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { financeClient } from '@/lib/financeService';
import { useAuth } from '@/app/context/AuthWithAdminContext';
import {
  SubscriptionTier,
  SubscriptionStatus,
} from '@/gen/pfinance/v1/types_pb';
import type { AdminUserSummary } from '@/gen/pfinance/v1/finance_service_pb';
import { ShieldCheck, Crown } from 'lucide-react';

type Row = AdminUserSummary;

function tierLabel(t: SubscriptionTier): string {
  return t === SubscriptionTier.PRO ? 'Pro' : 'Free';
}

function statusLabel(s: SubscriptionStatus): string {
  switch (s) {
    case SubscriptionStatus.ACTIVE:
      return 'active';
    case SubscriptionStatus.TRIALING:
      return 'trialing';
    case SubscriptionStatus.PAST_DUE:
      return 'past due';
    case SubscriptionStatus.CANCELED:
      return 'canceled';
    default:
      return '—';
  }
}

function timestampToDate(ts: { seconds: bigint; nanos: number } | undefined): string {
  if (!ts || ts.seconds === BigInt(0)) return '—';
  const ms = Number(ts.seconds) * 1000 + Math.floor(ts.nanos / 1e6);
  return new Date(ms).toLocaleDateString();
}

export default function AdminPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState<Row[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [pendingUid, setPendingUid] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  // 1. Check admin status
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await financeClient.getMyAdminStatus({});
        if (!cancelled) setIsAdmin(res.isAdmin);
      } catch (err) {
        console.error('[Admin] getMyAdminStatus failed:', err);
        if (!cancelled) setIsAdmin(false);
      } finally {
        if (!cancelled) setCheckingAdmin(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, router]);

  // 2. Load users once we know we're admin
  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const res = await financeClient.listAllUsers({ pageSize: 1000 });
      setUsers(res.users);
    } catch (err) {
      console.error('[Admin] listAllUsers failed:', err);
      toast({
        title: 'Failed to load users',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoadingUsers(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!checkingAdmin && isAdmin) {
      loadUsers();
    }
  }, [checkingAdmin, isAdmin, loadUsers]);

  const togglePro = useCallback(
    async (row: Row, makePro: boolean) => {
      setPendingUid(row.uid);
      try {
        const res = await financeClient.setUserTier({
          userId: row.uid,
          tier: makePro ? SubscriptionTier.PRO : SubscriptionTier.FREE,
          status: makePro
            ? SubscriptionStatus.ACTIVE
            : SubscriptionStatus.UNSPECIFIED,
        });
        if (res.user) {
          setUsers((prev) =>
            prev.map((u) => (u.uid === row.uid ? (res.user as Row) : u)),
          );
        }
        toast({
          title: makePro ? 'Upgraded to Pro' : 'Downgraded to Free',
          description: row.email || row.uid,
        });
      } catch (err) {
        console.error('[Admin] setUserTier failed:', err);
        toast({
          title: 'Failed to update tier',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        });
      } finally {
        setPendingUid(null);
      }
    },
    [toast],
  );

  const filteredUsers = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        u.displayName.toLowerCase().includes(q) ||
        u.uid.toLowerCase().includes(q),
    );
  }, [users, filter]);

  if (authLoading || checkingAdmin) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-8 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5" />
              Admin only
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground">
            Your account does not have admin privileges. Contact the platform
            owner if you believe this is in error.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Crown className="w-6 h-6" />
            User administration
          </h1>
          <p className="text-sm text-muted-foreground">
            Toggle Pro tier for any user. Changes apply to Firebase custom
            claims and the user store immediately. Users will see the change
            after their next token refresh (usually within a minute).
          </p>
        </div>
        <Input
          placeholder="Filter by email, name, or UID…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-xs"
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">
            {loadingUsers
              ? 'Loading users…'
              : `${filteredUsers.length} user${filteredUsers.length === 1 ? '' : 's'}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingUsers ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last sign-in</TableHead>
                  <TableHead className="text-right">Pro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((u) => {
                  const isPro = u.subscriptionTier === SubscriptionTier.PRO;
                  return (
                    <TableRow key={u.uid}>
                      <TableCell>
                        <div className="font-medium flex items-center gap-2">
                          {u.displayName || u.email || u.uid}
                          {u.isAdmin && (
                            <Badge variant="secondary" className="text-xs">
                              admin
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {u.email || u.uid}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={isPro ? 'default' : 'outline'}>
                          {tierLabel(u.subscriptionTier)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {statusLabel(u.subscriptionStatus)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {timestampToDate(u.createdAt)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {timestampToDate(u.lastSignInAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Switch
                          checked={isPro}
                          disabled={pendingUid === u.uid}
                          onCheckedChange={(checked) =>
                            togglePro(u, checked === true)
                          }
                          aria-label={`Toggle Pro for ${u.email || u.uid}`}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredUsers.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-muted-foreground py-8"
                    >
                      No users match this filter.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
