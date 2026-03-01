'use client';

/**
 * SyncContext
 * 
 * Provides centralized sync status and queue management across the app.
 * Shows a live sync status indicator and handles background synchronization.
 */

import { createContext, useContext, ReactNode, useMemo, useCallback } from 'react';
import { useSyncQueue, SyncStatus, SyncQueueItem, SyncAction, SyncEntityType } from './finance/hooks/useSyncQueue';

interface SyncContextType {
  // Status
  status: SyncStatus;
  
  // Queue management
  pendingItems: SyncQueueItem[];
  addPendingSync: (entityType: SyncEntityType, action: SyncAction, entityId: string, data: unknown) => void;
  processQueue: () => Promise<void>;
  clearQueue: () => void;
  
  // Convenience getters
  hasPendingChanges: boolean;
  syncStatusText: string;
  syncStatusColor: 'green' | 'yellow' | 'red' | 'gray';
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export function SyncProvider({ children }: { children: ReactNode }) {
  const {
    status,
    queue,
    addToQueue,
    processQueue,
    clearQueue,
  } = useSyncQueue({ autoSync: true });

  // Helper to add a sync item
  const addPendingSync = useCallback((
    entityType: SyncEntityType,
    action: SyncAction,
    entityId: string,
    data: unknown
  ) => {
    addToQueue({
      entityType,
      action,
      entityId,
      data,
    });
  }, [addToQueue]);

  // Computed values
  const hasPendingChanges = queue.length > 0;
  
  const syncStatusText = useMemo(() => {
    if (!status.isOnline) return 'Offline';
    if (status.isSyncing) return 'Syncing...';
    if (queue.length > 0) return `${queue.length} pending`;
    if (status.lastError) return 'Sync failed';
    if (status.lastSyncAt) return 'Synced';
    return 'Ready';
  }, [status, queue.length]);

  const syncStatusColor = useMemo((): 'green' | 'yellow' | 'red' | 'gray' => {
    if (!status.isOnline) return 'gray';
    if (status.isSyncing) return 'yellow';
    if (status.lastError && queue.length > 0) return 'red';
    if (queue.length > 0) return 'yellow';
    return 'green';
  }, [status, queue.length]);

  const value = useMemo<SyncContextType>(() => ({
    status,
    pendingItems: queue,
    addPendingSync,
    processQueue,
    clearQueue,
    hasPendingChanges,
    syncStatusText,
    syncStatusColor,
  }), [status, queue, addPendingSync, processQueue, clearQueue,
       hasPendingChanges, syncStatusText, syncStatusColor]);

  return (
    <SyncContext.Provider value={value}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const context = useContext(SyncContext);
  if (context === undefined) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
}

// Export types for external use
export type { SyncStatus, SyncQueueItem, SyncAction, SyncEntityType };
