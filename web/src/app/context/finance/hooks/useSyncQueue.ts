/**
 * useSyncQueue Hook
 * 
 * Manages background synchronization with retry logic and online/offline detection.
 * Provides a queue for failed operations that automatically retries when online.
 */

import { useState, useCallback, useEffect, useRef } from 'react';

// Types for sync queue items
export type SyncAction = 'create' | 'update' | 'delete';
export type SyncEntityType = 'expense' | 'income' | 'group';

export interface SyncQueueItem {
  id: string;
  entityType: SyncEntityType;
  action: SyncAction;
  entityId: string;
  data: unknown;
  retries: number;
  maxRetries: number;
  createdAt: Date;
  lastAttemptAt?: Date;
  error?: string;
}

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncAt: Date | null;
  lastError: string | null;
}

interface UseSyncQueueOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  autoSync?: boolean;
}

interface UseSyncQueueReturn {
  status: SyncStatus;
  queue: SyncQueueItem[];
  addToQueue: (item: Omit<SyncQueueItem, 'id' | 'retries' | 'maxRetries' | 'createdAt'>) => void;
  removeFromQueue: (id: string) => void;
  processQueue: () => Promise<void>;
  clearQueue: () => void;
  retryItem: (id: string) => Promise<boolean>;
}

const QUEUE_STORAGE_KEY = 'pfinance_sync_queue';
const MAX_RETRIES_DEFAULT = 3;
const RETRY_DELAY_DEFAULT = 5000; // 5 seconds

export function useSyncQueue(
  options: UseSyncQueueOptions = {}
): UseSyncQueueReturn {
  const {
    maxRetries = MAX_RETRIES_DEFAULT,
    retryDelayMs = RETRY_DELAY_DEFAULT,
    autoSync = true,
  } = options;

  const [queue, setQueue] = useState<SyncQueueItem[]>([]);
  const [status, setStatus] = useState<SyncStatus>({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isSyncing: false,
    pendingCount: 0,
    lastSyncAt: null,
    lastError: null,
  });

  const isSyncingRef = useRef(false);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load queue from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(QUEUE_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as SyncQueueItem[];
        setQueue(parsed.map(item => ({
          ...item,
          createdAt: new Date(item.createdAt),
          lastAttemptAt: item.lastAttemptAt ? new Date(item.lastAttemptAt) : undefined,
        })));
      }
    } catch (err) {
      console.error('[useSyncQueue] Failed to load queue from localStorage:', err);
    }
  }, []);

  // Save queue to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
      setStatus(prev => ({ ...prev, pendingCount: queue.length }));
    } catch (err) {
      console.error('[useSyncQueue] Failed to save queue to localStorage:', err);
    }
  }, [queue]);

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => {
      console.log('[useSyncQueue] Online - attempting to process queue');
      setStatus(prev => ({ ...prev, isOnline: true }));
      if (autoSync) {
        processQueue();
      }
    };

    const handleOffline = () => {
      console.log('[useSyncQueue] Offline');
      setStatus(prev => ({ ...prev, isOnline: false }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSync]);

  // Add item to queue
  const addToQueue = useCallback((item: Omit<SyncQueueItem, 'id' | 'retries' | 'maxRetries' | 'createdAt'>) => {
    const newItem: SyncQueueItem = {
      ...item,
      id: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      retries: 0,
      maxRetries,
      createdAt: new Date(),
    };
    
    console.log('[useSyncQueue] Adding item to queue:', newItem);
    setQueue(prev => [...prev, newItem]);
  }, [maxRetries]);

  // Remove item from queue
  const removeFromQueue = useCallback((id: string) => {
    setQueue(prev => prev.filter(item => item.id !== id));
  }, []);

  // Clear entire queue
  const clearQueue = useCallback(() => {
    setQueue([]);
    setStatus(prev => ({ ...prev, pendingCount: 0, lastError: null }));
  }, []);

  // Retry a specific item
  const retryItem = useCallback(async (id: string): Promise<boolean> => {
    const item = queue.find(i => i.id === id);
    if (!item) return false;

    // This is a placeholder - actual retry logic would depend on the entity type
    // In a real implementation, you'd call the appropriate API based on item.entityType and item.action
    console.log('[useSyncQueue] Retrying item:', item);
    
    // For now, just remove it from queue (simulating success)
    // In real implementation, you'd attempt the API call here
    removeFromQueue(id);
    return true;
  }, [queue, removeFromQueue]);

  // Process the entire queue
  const processQueue = useCallback(async () => {
    if (isSyncingRef.current || !status.isOnline || queue.length === 0) {
      return;
    }

    isSyncingRef.current = true;
    setStatus(prev => ({ ...prev, isSyncing: true }));
    console.log('[useSyncQueue] Processing queue:', queue.length, 'items');

    let hasErrors = false;
    let lastError: string | null = null;

    for (const item of queue) {
      if (item.retries >= item.maxRetries) {
        console.log('[useSyncQueue] Item exceeded max retries, skipping:', item.id);
        continue;
      }

      try {
        // In real implementation, call the appropriate API based on entity type
        console.log('[useSyncQueue] Processing item:', item);
        
        // Simulate API call - in real implementation, you'd call financeClient here
        // based on item.entityType and item.action
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // On success, remove from queue
        removeFromQueue(item.id);
        console.log('[useSyncQueue] Item synced successfully:', item.id);
      } catch (err) {
        hasErrors = true;
        lastError = err instanceof Error ? err.message : 'Unknown error';
        console.error('[useSyncQueue] Failed to sync item:', item.id, err);
        
        // Update item with retry count
        setQueue(prev => prev.map(i => 
          i.id === item.id 
            ? { ...i, retries: i.retries + 1, lastAttemptAt: new Date(), error: lastError || undefined }
            : i
        ));
      }
    }

    isSyncingRef.current = false;
    setStatus(prev => ({
      ...prev,
      isSyncing: false,
      lastSyncAt: new Date(),
      lastError,
    }));

    // Schedule retry if there are still items in queue
    if (hasErrors && autoSync) {
      retryTimeoutRef.current = setTimeout(() => {
        processQueue();
      }, retryDelayMs);
    }
  }, [status.isOnline, queue, removeFromQueue, autoSync, retryDelayMs]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  // Auto-process queue on mount if online
  useEffect(() => {
    if (autoSync && status.isOnline && queue.length > 0 && !isSyncingRef.current) {
      processQueue();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    status,
    queue,
    addToQueue,
    removeFromQueue,
    processQueue,
    clearQueue,
    retryItem,
  };
}
