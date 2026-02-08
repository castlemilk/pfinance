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
  preferences: NotificationPreferences | null;
  loadNotifications: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  updatePreferences: (prefs: Partial<NotificationPreferences>) => Promise<void>;
  refreshUnreadCount: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

// ============================================================================
// Polling interval (30 seconds)
// ============================================================================

const POLL_INTERVAL_MS = 30_000;

// ============================================================================
// Provider Component
// ============================================================================

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
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
      console.error('[NotificationContext] Failed to load notifications:', e);
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

  // ── Poll unread count every 30 seconds ─────────────────────────────────

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

    // Set up polling
    pollIntervalRef.current = setInterval(() => {
      refreshUnreadCount();
    }, POLL_INTERVAL_MS);

    return () => {
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
