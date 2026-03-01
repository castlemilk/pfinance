'use client';

import { createContext, useContext, useEffect, useState, useRef, useCallback, useMemo, ReactNode } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAdmin } from './AdminContext';
import { SubscriptionTier, SubscriptionStatus } from '@/gen/pfinance/v1/types_pb';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  subscriptionLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  isImpersonating: boolean;
  actualUser: User | null; // The real logged-in user (if any)
  subscriptionTier: SubscriptionTier;
  subscriptionStatus: SubscriptionStatus;
  refreshSubscription: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthWithAdminProvider({ children }: { children: ReactNode }) {
  const { isAdminMode, impersonatedUser } = useAdmin();
  const [actualUser, setActualUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const listenerFiredRef = useRef(false);
  const [subscriptionTier, setSubscriptionTier] = useState<SubscriptionTier>(SubscriptionTier.FREE);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>(SubscriptionStatus.UNSPECIFIED);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);

  // Determine the effective user (impersonated or actual)
  const effectiveUser = isAdminMode && impersonatedUser
    ? impersonatedUser as unknown as User
    : actualUser;

  // Debug logging
  console.log('[AuthContext] State:', {
    loading,
    actualUser: actualUser?.uid || null,
    effectiveUser: effectiveUser?.uid || null,
    isAdminMode,
    hasImpersonatedUser: !!impersonatedUser,
    authInitialized: !!auth,
  });

  useEffect(() => {
    console.log('[AuthContext] useEffect - setting up auth listener, auth initialized:', !!auth);

    // Skip auth setup if Firebase is not initialized
    if (!auth) {
      console.log('[AuthContext] Firebase not initialized, setting loading=false');
      setLoading(false);
      return;
    }

    let unsubscribe: (() => void) | undefined;
    let safetyTimeout: ReturnType<typeof setTimeout> | undefined;
    listenerFiredRef.current = false;

    // Set persistence to local (survives browser restarts)
    setPersistence(auth, browserLocalPersistence)
      .then(() => {
        console.log('[AuthContext] Persistence set, subscribing to auth state');
        // TypeScript needs reassurance that auth is still not null in async callback
        if (!auth) return;

        unsubscribe = onAuthStateChanged(auth, (user) => {
          console.log('[AuthContext] onAuthStateChanged:', user?.uid || 'no user');
          listenerFiredRef.current = true;
          if (safetyTimeout) {
            clearTimeout(safetyTimeout);
            safetyTimeout = undefined;
          }
          setActualUser(user);
          setLoading(false);
        });

        // Safety timeout: if the auth listener hasn't fired within 5 seconds
        // after being registered, stop the loading state to prevent perpetual spinner
        safetyTimeout = setTimeout(() => {
          if (!listenerFiredRef.current) {
            console.warn('[AuthContext] Safety timeout: auth listener did not fire within 5s, clearing loading state');
            setLoading(false);
          }
        }, 5000);
      })
      .catch((error) => {
        console.error('[AuthContext] Error setting persistence:', error);
        setLoading(false);
      });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
      if (safetyTimeout) {
        clearTimeout(safetyTimeout);
      }
    };
  }, []);

  const extractSubscriptionFromToken = useCallback(async (firebaseUser: User) => {
    try {
      setSubscriptionLoading(true);
      const tokenResult = await firebaseUser.getIdTokenResult(true); // Force refresh to get latest custom claims
      const claims = tokenResult.claims;
      const tierStr = claims.subscription_tier as string | undefined;
      const statusStr = claims.subscription_status as string | undefined;

      setSubscriptionTier(tierStr === 'PRO' ? SubscriptionTier.PRO : SubscriptionTier.FREE);

      const statusMap: Record<string, SubscriptionStatus> = {
        'ACTIVE': SubscriptionStatus.ACTIVE,
        'TRIALING': SubscriptionStatus.TRIALING,
        'PAST_DUE': SubscriptionStatus.PAST_DUE,
        'CANCELED': SubscriptionStatus.CANCELED,
      };
      setSubscriptionStatus(statusMap[statusStr || ''] || SubscriptionStatus.UNSPECIFIED);
    } catch (err) {
      console.error('[AuthContext] Failed to extract subscription from token:', err);
    } finally {
      setSubscriptionLoading(false);
    }
  }, []);

  useEffect(() => {
    if (effectiveUser && !isAdminMode) {
      extractSubscriptionFromToken(effectiveUser);
    } else if (!loading) {
      // No user or admin mode — no subscription to load
      setSubscriptionLoading(false);
    }
  }, [effectiveUser?.uid, isAdminMode, loading, extractSubscriptionFromToken]);

  const refreshSubscription = useCallback(async () => {
    if (!effectiveUser || isAdminMode) return;
    try {
      // extractSubscriptionFromToken already calls getIdTokenResult(true)
      // which forces a token refresh, so no need to call getIdToken(true) first
      await extractSubscriptionFromToken(effectiveUser);
    } catch (err) {
      console.error('[AuthContext] Failed to refresh subscription:', err);
    }
  }, [effectiveUser, isAdminMode, extractSubscriptionFromToken]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (isAdminMode && impersonatedUser) {
      console.log('[Admin Mode] Simulated sign in for:', email);
      return;
    }
    if (!auth) throw new Error('Firebase auth not initialized');
    await signInWithEmailAndPassword(auth, email, password);
  }, [isAdminMode, impersonatedUser]);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    if (isAdminMode && impersonatedUser) {
      console.log('[Admin Mode] Simulated sign up for:', email);
      return;
    }
    if (!auth) throw new Error('Firebase auth not initialized');
    const result = await createUserWithEmailAndPassword(auth, email, password);
    if (result.user) {
      await updateProfile(result.user, { displayName });
    }
  }, [isAdminMode, impersonatedUser]);

  const signInWithGoogle = useCallback(async (): Promise<void> => {
    if (isAdminMode && impersonatedUser) {
      console.log('[Admin Mode] Simulated Google sign in');
      return;
    }
    if (!auth) {
      throw new Error('Firebase auth not initialized');
    }

    const provider = new GoogleAuthProvider();
    provider.addScope('profile');
    provider.addScope('email');

    try {
      await signInWithPopup(auth, provider);
    } catch (error: unknown) {
      const firebaseError = error as { code?: string };
      if (firebaseError.code === 'auth/popup-blocked') {
        console.error('Popup was blocked. Please allow popups for this site.');
      }
      throw error;
    }
  }, [isAdminMode, impersonatedUser]);

  const logout = useCallback(async () => {
    if (isAdminMode && impersonatedUser) {
      console.log('[Admin Mode] Simulated logout for:', impersonatedUser.email);
      return;
    }
    if (!auth) throw new Error('Firebase auth not initialized');
    await signOut(auth);
  }, [isAdminMode, impersonatedUser]);

  const isImpersonating = isAdminMode && !!impersonatedUser;

  const value = useMemo(() => ({
    user: effectiveUser,
    loading,
    subscriptionLoading,
    signIn,
    signUp,
    signInWithGoogle,
    logout,
    isImpersonating,
    actualUser,
    subscriptionTier,
    subscriptionStatus,
    refreshSubscription,
  }), [effectiveUser, loading, subscriptionLoading, signIn, signUp, signInWithGoogle, logout,
       isImpersonating, actualUser, subscriptionTier, subscriptionStatus, refreshSubscription]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
