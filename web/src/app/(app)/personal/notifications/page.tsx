'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { financeClient } from '@/lib/financeService';
import { useAuth } from '../../../context/AuthWithAdminContext';
import { useNotifications } from '../../../context/NotificationContext';
import NotificationItem from '../../../components/notifications/NotificationItem';
import WeeklyDigestCard from '../../../components/notifications/WeeklyDigestCard';
import { NotificationType } from '@/gen/pfinance/v1/types_pb';
import type { Notification } from '@/gen/pfinance/v1/types_pb';

const TABS = [
  { value: 'all', label: 'All', type: NotificationType.UNSPECIFIED },
  { value: 'budget', label: 'Budget', type: NotificationType.BUDGET_THRESHOLD },
  { value: 'goals', label: 'Goals', type: NotificationType.GOAL_MILESTONE },
  { value: 'bills', label: 'Bills', type: NotificationType.BILL_REMINDER },
  { value: 'group', label: 'Group', type: NotificationType.GROUP_ACTIVITY },
  { value: 'system', label: 'System', type: NotificationType.SYSTEM },
] as const;

export default function NotificationsPage() {
  const { user } = useAuth();
  const { markAllRead } = useNotifications();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [nextPageToken, setNextPageToken] = useState('');
  const [hasMore, setHasMore] = useState(false);

  const userId = user?.uid || '';

  const loadNotifications = useCallback(async (reset = true) => {
    if (!userId) return;

    setLoading(true);
    try {
      const tab = TABS.find(t => t.value === activeTab);
      const typeFilter = tab?.type ?? NotificationType.UNSPECIFIED;
      const token = reset ? '' : nextPageToken;

      const response = await financeClient.listNotifications({
        userId,
        unreadOnly,
        typeFilter,
        pageSize: 30,
        pageToken: token,
      });

      const newNotifs = response.notifications;
      if (reset) {
        setNotifications(newNotifs);
      } else {
        setNotifications(prev => [...prev, ...newNotifs]);
      }
      setNextPageToken(response.nextPageToken);
      setHasMore(response.nextPageToken !== '');
    } catch (e) {
      console.error('[NotificationsPage] Failed to load notifications:', e);
    } finally {
      setLoading(false);
    }
  }, [userId, activeTab, unreadOnly, nextPageToken]);

  useEffect(() => {
    loadNotifications(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, activeTab, unreadOnly]);

  const handleMarkAllRead = async () => {
    await markAllRead();
    loadNotifications(true);
  };

  const isDigest = (n: Notification) =>
    n.type === NotificationType.WEEKLY_DIGEST;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground">
            Stay on top of your finances
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleMarkAllRead}
          className="gap-2"
        >
          <CheckCheck className="w-4 h-4" />
          Mark all read
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <TabsList>
            {TABS.map(tab => (
              <TabsTrigger key={tab.value} value={tab.value} className="text-xs">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <Switch
            id="unread-only"
            checked={unreadOnly}
            onCheckedChange={setUnreadOnly}
          />
          <Label htmlFor="unread-only" className="text-sm text-muted-foreground">
            Unread only
          </Label>
        </div>
      </div>

      {/* Notification list */}
      <div className="space-y-1">
        {loading && notifications.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-muted-foreground">Loading notifications...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <Bell className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">No notifications</p>
            <p className="text-sm text-muted-foreground/70">
              {unreadOnly ? 'All caught up!' : 'Nothing here yet'}
            </p>
          </div>
        ) : (
          <>
            {notifications.map((notification) =>
              isDigest(notification) ? (
                <WeeklyDigestCard
                  key={notification.id}
                  notification={notification}
                />
              ) : (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                />
              )
            )}

            {hasMore && (
              <div className="flex justify-center pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => loadNotifications(false)}
                  disabled={loading}
                >
                  {loading ? 'Loading...' : 'Load more'}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
