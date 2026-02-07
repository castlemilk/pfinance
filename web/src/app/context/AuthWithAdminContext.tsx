'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
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

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  isImpersonating: boolean;
  actualUser: User | null; // The real logged-in user (if any)
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthWithAdminProvider({ children }: { children: ReactNode }) {
  const { isAdminMode, impersonatedUser } = useAdmin();
  const [actualUser, setActualUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

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

    // Set persistence to local (survives browser restarts)
    setPersistence(auth, browserLocalPersistence)
      .then(() => {
        console.log('[AuthContext] Persistence set, subscribing to auth state');
        // TypeScript needs reassurance that auth is still not null in async callback
        if (!auth) return;

        unsubscribe = onAuthStateChanged(auth, (user) => {
          console.log('[AuthContext] onAuthStateChanged:', user?.uid || 'no user');
          setActualUser(user);
          setLoading(false);
        });
      })
      .catch((error) => {
        console.error('[AuthContext] Error setting persistence:', error);
        setLoading(false);
      });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    if (isAdminMode && impersonatedUser) {
      // In admin mode, don't actually sign in
      console.log('[Admin Mode] Simulated sign in for:', email);
      return;
    }
    if (!auth) throw new Error('Firebase auth not initialized');
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signUp = async (email: string, password: string, displayName: string) => {
    if (isAdminMode && impersonatedUser) {
      // In admin mode, don't actually sign up
      console.log('[Admin Mode] Simulated sign up for:', email);
      return;
    }
    if (!auth) throw new Error('Firebase auth not initialized');
    const result = await createUserWithEmailAndPassword(auth, email, password);
    if (result.user) {
      await updateProfile(result.user, { displayName });
    }
  };

  const signInWithGoogle = async (): Promise<void> => {
    if (isAdminMode && impersonatedUser) {
      // In admin mode, don't actually sign in
      console.log('[Admin Mode] Simulated Google sign in');
      return;
    }
    if (!auth) {
      throw new Error('Firebase auth not initialized');
    }
    
    const provider = new GoogleAuthProvider();
    
    // Add scopes if needed
    provider.addScope('profile');
    provider.addScope('email');
    
    // Use popup for better UX (no redirects)
    try {
      await signInWithPopup(auth, provider);
    } catch (error: unknown) {
      // Handle specific errors
      const firebaseError = error as { code?: string };
      if (firebaseError.code === 'auth/popup-blocked') {
        console.error('Popup was blocked. Please allow popups for this site.');
      }
      throw error;
    }
  };

  const logout = async () => {
    if (isAdminMode && impersonatedUser) {
      // In admin mode, just log a message
      console.log('[Admin Mode] Simulated logout for:', impersonatedUser.email);
      return;
    }
    if (!auth) throw new Error('Firebase auth not initialized');
    await signOut(auth);
  };

  const value = {
    user: effectiveUser,
    loading,
    signIn,
    signUp,
    signInWithGoogle,
    logout,
    isImpersonating: isAdminMode && !!impersonatedUser,
    actualUser
  };

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