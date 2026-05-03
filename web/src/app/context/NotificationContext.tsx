'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { financeClient } from '@/lib/financeService';
import { db } from '@/lib/firebase';
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
// Provider Component
// ============================================================================

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);

  const isAuthenticated = !!user;
  const userId = user?.uid || '';

  // ── Fetch unread count ─────────────────────────────────────────────────
  // No-op: unread count is maintained by the Firestore onSnapshot listener
  // below. This is retained on the public API surface for callers that
  // expect a manual refresh hook (e.g. after an action they took elsewhere)
  // but the listener already pushes updates in real-time.

  const refreshUnreadCount = useCallback(async () => {
    // intentionally empty — see useEffect with onSnapshot below
  }, []);

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

  // ── Real-time unread count via Firestore listener ──────────────────────
  // Replaces a 60s polling loop that kept a Cloud Run instance permanently
  // alive (~$65/mo for one Chrome tab). The backend writes to the
  // `notifications` collection (see backend internal/store/firestore.go);
  // we listen on `where(UserId == userId AND IsRead == false)` and count
  // the snapshot size client-side. Zero backend round-trips, instant
  // updates when a notification is created or marked read.

  useEffect(() => {
    if (!isAuthenticated || !userId) {
      // Clear state when user logs out
      setNotifications([]);
      setUnreadCount(0);
      setPreferences(null);
      return;
    }

    loadPreferences();

    if (!db) {
      // Firestore not configured (e.g. SSR build without env vars). Skip
      // listener; the action handlers still work via RPC.
      return;
    }

    const q = query(
      collection(db, 'notifications'),
      where('UserId', '==', userId),
      where('IsRead', '==', false),
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => setUnreadCount(snap.size),
      (err) => console.error('[NotificationContext] Firestore listener error:', err),
    );

    return () => {
      unsubscribe();
    };
  }, [isAuthenticated, userId, loadPreferences]);

  // ── Context value ──────────────────────────────────────────────────────

  const value = useMemo<NotificationContextType>(() => ({
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
  }), [notifications, unreadCount, loading, error, preferences,
       loadNotifications, markRead, markAllRead, updatePreferences, refreshUnreadCount]);

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
