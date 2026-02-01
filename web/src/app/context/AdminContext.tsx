'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

// SECURITY: Only enable admin features in development
const isDevelopment = process.env.NODE_ENV === 'development';

// Test users for impersonation
export const TEST_USERS = [
  {
    uid: 'test-user-1',
    email: 'alice@example.com',
    displayName: 'Alice Johnson',
    photoURL: null,
  },
  {
    uid: 'test-user-2', 
    email: 'bob@example.com',
    displayName: 'Bob Smith',
    photoURL: null,
  },
  {
    uid: 'test-user-3',
    email: 'charlie@example.com', 
    displayName: 'Charlie Brown',
    photoURL: null,
  },
  {
    uid: 'test-user-4',
    email: 'diana@example.com',
    displayName: 'Diana Prince',
    photoURL: null,
  }
];

interface AdminContextType {
  isAdminMode: boolean;
  setIsAdminMode: (value: boolean) => void;
  impersonatedUser: typeof TEST_USERS[0] | null;
  setImpersonatedUser: (user: typeof TEST_USERS[0] | null) => void;
  availableTestUsers: typeof TEST_USERS;
  switchToUser: (userId: string) => void;
  exitImpersonation: () => void;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

interface AdminProviderProps {
  children: React.ReactNode;
}

export function AdminProvider({ children }: AdminProviderProps) {
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [impersonatedUser, setImpersonatedUser] = useState<typeof TEST_USERS[0] | null>(null);

  // Load admin mode from localStorage (development only)
  useEffect(() => {
    if (!isDevelopment) return; // SECURITY: Never load admin mode in production

    const savedAdminMode = localStorage.getItem('pfinance-admin-mode');
    if (savedAdminMode === 'true') {
      setIsAdminMode(true);
    }
  }, []);

  // Add keyboard shortcut for admin mode (Ctrl/Cmd + Shift + A) - development only
  useEffect(() => {
    if (!isDevelopment) return; // SECURITY: Disable keyboard shortcut in production

    const handleKeyPress = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        setIsAdminMode(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  // Save admin mode to localStorage
  useEffect(() => {
    localStorage.setItem('pfinance-admin-mode', isAdminMode.toString());
  }, [isAdminMode]);

  const switchToUser = (userId: string) => {
    if (!isDevelopment) return; // SECURITY: Never allow user switching in production

    const user = TEST_USERS.find(u => u.uid === userId);
    if (user && isAdminMode) {
      setImpersonatedUser(user);
      // Store in localStorage for persistence
      localStorage.setItem('pfinance-impersonated-user', JSON.stringify(user));
    }
  };

  const exitImpersonation = () => {
    setImpersonatedUser(null);
    localStorage.removeItem('pfinance-impersonated-user');
  };

  // Load impersonated user from localStorage (development only)
  useEffect(() => {
    if (!isDevelopment) return; // SECURITY: Never load impersonated user in production

    if (isAdminMode) {
      const savedUser = localStorage.getItem('pfinance-impersonated-user');
      if (savedUser) {
        try {
          const user = JSON.parse(savedUser);
          setImpersonatedUser(user);
        } catch (e) {
          console.error('Failed to parse impersonated user:', e);
        }
      }
    } else {
      // Clear impersonation when admin mode is disabled
      exitImpersonation();
    }
  }, [isAdminMode]);

  // Wrap setIsAdminMode with production guard
  const safeSetIsAdminMode = (value: boolean) => {
    if (!isDevelopment) return; // SECURITY: Never enable admin mode in production
    setIsAdminMode(value);
  };

  const value = {
    isAdminMode: isDevelopment ? isAdminMode : false, // SECURITY: Always false in production
    setIsAdminMode: safeSetIsAdminMode,
    impersonatedUser: isDevelopment ? impersonatedUser : null, // SECURITY: Always null in production
    setImpersonatedUser: isDevelopment ? setImpersonatedUser : () => {}, // SECURITY: No-op in production
    availableTestUsers: isDevelopment ? TEST_USERS : [], // SECURITY: Empty in production
    switchToUser,
    exitImpersonation,
  };

  return (
    <AdminContext.Provider value={value}>
      {children}
    </AdminContext.Provider>
  );
}

export const useAdmin = () => {
  const context = useContext(AdminContext);
  if (context === undefined) {
    throw new Error('useAdmin must be used within an AdminProvider');
  }
  return context;
};