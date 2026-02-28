'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { financeClient } from '@/lib/financeService';
import { useAuth } from '../context/AuthWithAdminContext';

const FCM_TOKEN_KEY = 'pfinance_fcm_token';

interface UsePushNotificationsReturn {
  permission: NotificationPermission | 'default';
  isSupported: boolean;
  token: string | null;
  requestPermission: () => Promise<boolean>;
  unregister: () => Promise<void>;
}

export function usePushNotifications(): UsePushNotificationsReturn {
  const { user } = useAuth();
  const [permission, setPermission] = useState<NotificationPermission | 'default'>('default');
  const [token, setToken] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const registeredRef = useRef(false);

  useEffect(() => {
    const supported = typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
    setIsSupported(supported);
    if (supported) {
      setPermission(Notification.permission);
    }

    // Load cached token
    try {
      const cached = localStorage.getItem(FCM_TOKEN_KEY);
      if (cached) setToken(cached);
    } catch {
      // Ignore
    }
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported || !user?.uid) return false;

    try {
      const result = await Notification.requestPermission();
      setPermission(result);

      if (result !== 'granted') return false;

      // Dynamically import Firebase messaging (avoid SSR issues)
      const { getMessaging, getToken: getFCMToken, onMessage } = await import('firebase/messaging');
      const { default: firebaseApp } = await import('@/lib/firebase');

      if (!firebaseApp) {
        console.warn('[Push] Firebase app not initialized');
        return false;
      }

      const messaging = getMessaging(firebaseApp);
      const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

      if (!vapidKey) {
        console.warn('[Push] VAPID key not configured');
        return false;
      }

      // Get service worker registration
      const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');

      const fcmToken = await getFCMToken(messaging, {
        vapidKey,
        serviceWorkerRegistration: swReg,
      });

      if (fcmToken) {
        setToken(fcmToken);
        localStorage.setItem(FCM_TOKEN_KEY, fcmToken);

        // Register with backend
        await financeClient.registerPushToken({ fcmToken });
        registeredRef.current = true;

        // Listen for foreground messages
        onMessage(messaging, (payload) => {
          window.dispatchEvent(new CustomEvent('fcm-foreground-message', {
            detail: payload,
          }));
        });

        return true;
      }

      return false;
    } catch (err) {
      console.error('[Push] Failed to setup push notifications:', err);
      return false;
    }
  }, [isSupported, user?.uid]);

  const unregister = useCallback(async () => {
    try {
      await financeClient.unregisterPushToken({});
      setToken(null);
      localStorage.removeItem(FCM_TOKEN_KEY);
      registeredRef.current = false;
    } catch (err) {
      console.error('[Push] Failed to unregister:', err);
    }
  }, []);

  return {
    permission,
    isSupported,
    token,
    requestPermission,
    unregister,
  };
}
