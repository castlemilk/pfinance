'use client';

import { firebaseInitError } from '@/lib/firebase';

export function FirebaseInitBanner() {
  if (!firebaseInitError) return null;

  return (
    <div
      role="alert"
      className="fixed top-0 left-0 right-0 z-[9999] bg-destructive text-destructive-foreground p-3 text-center text-sm"
    >
      <strong>Connection Error:</strong> {firebaseInitError}
    </div>
  );
}
