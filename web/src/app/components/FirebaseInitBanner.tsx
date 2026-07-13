'use client';

import { useSyncExternalStore } from 'react';

import { firebaseInitError } from '@/lib/firebase';

const subscribeToFirebaseInitError = () => () => undefined;
const getFirebaseInitError = () => firebaseInitError;
const getServerFirebaseInitError = () => null;

export function FirebaseInitBanner() {
  const initError = useSyncExternalStore(
    subscribeToFirebaseInitError,
    getFirebaseInitError,
    getServerFirebaseInitError
  );

  if (!initError) return null;

  return (
    <div
      role="alert"
      aria-atomic="true"
      className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex justify-center px-3 sm:px-4 md:bottom-4"
    >
      <p className="max-w-xl rounded-md border border-destructive/50 bg-background/95 px-3 py-2 text-sm text-foreground shadow-lg backdrop-blur-sm">
        <strong className="font-semibold text-destructive">Connection issue.</strong>{' '}
        <span>{initError}</span>
      </p>
    </div>
  );
}
