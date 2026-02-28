'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { financeClient } from '@/lib/financeService';
import type { Notification, NotificationPreferences } from '@/gen/pfinance/v1/types_pb';
import { useAuth } from './AuthWithAdminContext';

// ============================================================================
// Context Definition
// ============================================================================

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  preferences: NotificationPreferences | null;
  loadNotifications: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  updatePreferences: (prefs: Partial<NotificationPreferences>) => Promise<void>;
  refreshUnreadCount: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

// ============================================================================
// Polling intervals
// ============================================================================

// Default: poll every 60 seconds
const POLL_INTERVAL_MS = 60_000;
// When FCM push is active, poll infrequently as a safety net
const POLL_INTERVAL_PUSH_MS = 300_000; // 5 minutes

// ============================================================================
// Provider Component
// ============================================================================

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isAuthenticated = !!user;
  const userId = user?.uid || '';

  // ── Fetch unread count ─────────────────────────────────────────────────

  const refreshUnreadCount = useCallback(async () => {
    if (!isAuthenticated || !userId) return;

    try {
      const response = await financeClient.getUnreadNotificationCount({ userId });
      setUnreadCount(response.count);
    } catch (e) {
      console.error('[NotificationContext] Failed to fetch unread count:', e);
    }
  }, [isAuthenticated, userId]);

  // ── Load full notification list ────────────────────────────────────────

  const loadNotifications = useCallback(async () => {
    if (!isAuthenticated || !userId) return;

    setLoading(true);
    setError(null);
    try {
      const response = await financeClient.listNotifications({
        userId,
        unreadOnly: false,
        pageSize: 50,
        pageToken: '',
      });
      setNotifications(response.notifications);
      setUnreadCount(response.totalUnread);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load notifications';
      console.error('[NotificationContext] Failed to load notifications:', e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, userId]);

  // ── Mark single notification as read ───────────────────────────────────

  const markRead = useCallback(async (id: string) => {
    if (!isAuthenticated) return;

    try {
      await financeClient.markNotificationRead({ notificationId: id });
      // Optimistically update local state
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, isRead: true } as Notification : n))
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (e) {
      console.error('[NotificationContext] Failed to mark notification read:', e);
    }
  }, [isAuthenticated]);

  // ── Mark all notifications as read ─────────────────────────────────────

  const markAllRead = useCallback(async () => {
    if (!isAuthenticated || !userId) return;

    try {
      await financeClient.markAllNotificationsRead({ userId });
      // Optimistically update local state
      setNotifications(prev =>
        prev.map(n => ({ ...n, isRead: true } as Notification))
      );
      setUnreadCount(0);
    } catch (e) {
      console.error('[NotificationContext] Failed to mark all notifications read:', e);
    }
  }, [isAuthenticated, userId]);

  // ── Load and update notification preferences ───────────────────────────

  const loadPreferences = useCallback(async () => {
    if (!isAuthenticated || !userId) return;

    try {
      const response = await financeClient.getNotificationPreferences({ userId });
      if (response.preferences) {
        setPreferences(response.preferences);
      }
    } catch (e) {
      console.error('[NotificationContext] Failed to load preferences:', e);
    }
  }, [isAuthenticated, userId]);

  const updatePreferences = useCallback(async (prefs: Partial<NotificationPreferences>) => {
    if (!isAuthenticated || !userId) return;

    try {
      // Merge with existing preferences
      const merged = {
        userId,
        budgetAlerts: prefs.budgetAlerts ?? preferences?.budgetAlerts ?? true,
        goalMilestones: prefs.goalMilestones ?? preferences?.goalMilestones ?? true,
        billReminders: prefs.billReminders ?? preferences?.billReminders ?? true,
        unusualSpending: prefs.unusualSpending ?? preferences?.unusualSpending ?? true,
        subscriptionAlerts: prefs.subscriptionAlerts ?? preferences?.subscriptionAlerts ?? true,
        weeklyDigest: prefs.weeklyDigest ?? preferences?.weeklyDigest ?? false,
        billReminderDays: prefs.billReminderDays ?? preferences?.billReminderDays ?? 3,
      };

      const response = await financeClient.updateNotificationPreferences({
        userId,
        preferences: merged,
      });

      if (response.preferences) {
        setPreferences(response.preferences);
      }
    } catch (e) {
      console.error('[NotificationContext] Failed to update preferences:', e);
    }
  }, [isAuthenticated, userId, preferences]);

  // ── Poll unread count ──────────────────────────────────────────────────
  // Uses a longer interval when FCM push is active (push delivers updates
  // in real-time, polling is just a safety net).

  useEffect(() => {
    if (!isAuthenticated || !userId) {
      // Clear state when user logs out
      setNotifications([]);
      setUnreadCount(0);
      setPreferences(null);
      return;
    }

    // Initial fetch
    refreshUnreadCount();
    loadPreferences();

    // Determine polling interval: if FCM push is registered, poll infrequently
    let interval = POLL_INTERVAL_MS;
    try {
      if (localStorage.getItem('pfinance_fcm_token')) {
        interval = POLL_INTERVAL_PUSH_MS;
      }
    } catch {
      // localStorage unavailable (SSR/incognito)
    }

    // Set up polling
    pollIntervalRef.current = setInterval(() => {
      refreshUnreadCount();
    }, interval);

    // Listen for foreground FCM push messages — refresh immediately
    const handleFCMMessage = () => {
      refreshUnreadCount();
    };
    window.addEventListener('fcm-foreground-message', handleFCMMessage);

    return () => {
      window.removeEventListener('fcm-foreground-message', handleFCMMessage);
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [isAuthenticated, userId, refreshUnreadCount, loadPreferences]);

  // ── Context value ──────────────────────────────────────────────────────

  const value: NotificationContextType = {
    notifications,
    unreadCount,
    loading,
    error,
    preferences,
    loadNotifications,
    markRead,
    markAllRead,
    updatePreferences,
    refreshUnreadCount,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
