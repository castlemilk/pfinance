import { render, screen, waitFor } from '@testing-library/react';
import { act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext';
import { auth } from '@/lib/firebase';

// Mock Firebase auth
jest.mock('@/lib/firebase', () => ({
  auth: {
    onAuthStateChanged: jest.fn(),
    signInWithEmailAndPassword: jest.fn(),
    createUserWithEmailAndPassword: jest.fn(),
    signOut: jest.fn(),
    updateProfile: jest.fn(),
    signInWithPopup: jest.fn(),
    setPersistence: jest.fn(),
  },
}));

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  updateProfile: jest.fn(),
  GoogleAuthProvider: jest.fn().mockImplementation(() => ({
    addScope: jest.fn(),
  })),
  signInWithPopup: jest.fn(),
  setPersistence: jest.fn(),
  browserLocalPersistence: 'local',
}));

// Test component that uses the auth context
function TestComponent() {
  const { user, loading, signIn, signUp, signInWithGoogle, logout } = useAuth();
  
  return (
    <div>
      <div data-testid="loading">{loading ? 'loading' : 'loaded'}</div>
      <div data-testid="user">{user ? 'authenticated' : 'not authenticated'}</div>
      <button onClick={() => signIn('test@example.com', 'password')}>Sign In</button>
      <button onClick={() => signUp('test@example.com', 'password', 'Test User')}>Sign Up</button>
      <button onClick={() => signInWithGoogle()}>Sign In with Google</button>
      <button onClick={() => logout()}>Logout</button>
    </div>
  );
}

describe('AuthContext', () => {
  let mockOnAuthStateChanged: jest.Mock;
  let mockSetPersistence: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockOnAuthStateChanged = require('firebase/auth').onAuthStateChanged;
    mockSetPersistence = require('firebase/auth').setPersistence;
    
    // Mock setPersistence to resolve successfully
    mockSetPersistence.mockResolvedValue(undefined);
    
    // Mock onAuthStateChanged to call the callback immediately
    mockOnAuthStateChanged.mockImplementation((auth, callback) => {
      callback(null); // No user initially
      return jest.fn(); // Return unsubscribe function
    });
  });

  it('provides authentication context', async () => {
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('loaded');
    });

    expect(screen.getByTestId('user')).toHaveTextContent('not authenticated');
    expect(screen.getByText('Sign In')).toBeInTheDocument();
    expect(screen.getByText('Sign Up')).toBeInTheDocument();
    expect(screen.getByText('Sign In with Google')).toBeInTheDocument();
    expect(screen.getByText('Logout')).toBeInTheDocument();
  });

  it('handles authenticated user', async () => {
    const mockUser = { uid: '123', email: 'test@example.com' };
    
    mockOnAuthStateChanged.mockImplementation((auth, callback) => {
      callback(mockUser);
      return jest.fn();
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('authenticated');
    });
  });

  it('handles auth initialization when Firebase is not available', async () => {
    // Mock auth as null (Firebase not initialized)
    const originalAuth = require('@/lib/firebase').auth;
    require('@/lib/firebase').auth = null;

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('loaded');
    });

    expect(screen.getByTestId('user')).toHaveTextContent('not authenticated');

    // Restore original auth
    require('@/lib/firebase').auth = originalAuth;
  });

  it('handles persistence setup errors', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    mockSetPersistence.mockRejectedValue(new Error('Persistence error'));

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('loaded');
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith('Error setting persistence:', expect.any(Error));
    
    consoleErrorSpy.mockRestore();
  });

  it('throws error when useAuth is used outside provider', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    expect(() => {
      render(<TestComponent />);
    }).toThrow('useAuth must be used within an AuthProvider');

    consoleErrorSpy.mockRestore();
  });

  it('has correct TypeScript interface for signInWithGoogle', () => {
    // This test ensures the function signature matches the interface
    function TestTypeScript() {
      const { signInWithGoogle } = useAuth();
      
      // TypeScript compilation will fail if the return type doesn't match Promise<void>
      const result: Promise<void> = signInWithGoogle();
      expect(result).toBeInstanceOf(Promise);
      return null;
    }

    render(
      <AuthProvider>
        <TestTypeScript />
      </AuthProvider>
    );
  });
});