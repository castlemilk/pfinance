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
  signInWithRedirect,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Skip auth setup if Firebase is not initialized
    if (!auth) {
      setLoading(false);
      return;
    }

    // Set persistence to local (survives browser restarts)
    if (auth) {
      setPersistence(auth, browserLocalPersistence)
        .then(() => {
          if (auth) {
            const unsubscribe = onAuthStateChanged(auth, (user) => {
              setUser(user);
              setLoading(false);
            });

            return () => unsubscribe();
          }
        })
        .catch((error) => {
          console.error('Error setting persistence:', error);
          setLoading(false);
        });
    }
  }, []);

  const signIn = async (email: string, password: string) => {
    if (!auth) throw new Error('Firebase auth not initialized');
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signUp = async (email: string, password: string, displayName: string) => {
    if (!auth) throw new Error('Firebase auth not initialized');
    const result = await createUserWithEmailAndPassword(auth, email, password);
    if (result.user) {
      await updateProfile(result.user, { displayName });
    }
  };

  const signInWithGoogle = async (): Promise<void> => {
    if (!auth) {
      throw new Error('Firebase auth not initialized');
    }
    
    const provider = new GoogleAuthProvider();
    
    // Add scopes if needed
    provider.addScope('profile');
    provider.addScope('email');
    
    // Use redirect to avoid popup blockers
    await signInWithRedirect(auth, provider);
  };

  const logout = async () => {
    if (!auth) throw new Error('Firebase auth not initialized');
    await signOut(auth);
  };

  const value = {
    user,
    loading,
    signIn,
    signUp,
    signInWithGoogle,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}