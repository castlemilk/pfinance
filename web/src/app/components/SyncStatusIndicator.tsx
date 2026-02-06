'use client';

/**
 * SyncStatusIndicator
 * 
 * Visual indicator showing the current sync status.
 * Shows online/offline state, pending changes, and sync progress.
 */

import { useSync } from '../context/SyncContext';

interface SyncStatusIndicatorProps {
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function SyncStatusIndicator({
  showLabel = true,
  size = 'md',
  className = '',
}: SyncStatusIndicatorProps) {
  const { status, syncStatusText, syncStatusColor, hasPendingChanges, processQueue } = useSync();

  const dotSizes = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4',
  };

  const textSizes = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  const colorClasses = {
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
    gray: 'bg-gray-400',
  };

  const handleClick = () => {
    if (hasPendingChanges && status.isOnline && !status.isSyncing) {
      processQueue();
    }
  };

  return (
    <div
      className={`flex items-center gap-2 ${className} ${hasPendingChanges ? 'cursor-pointer' : ''}`}
      onClick={handleClick}
      title={hasPendingChanges ? 'Click to sync now' : syncStatusText}
    >
      {/* Indicator dot */}
      <div className="relative">
        <div
          className={`${dotSizes[size]} rounded-full ${colorClasses[syncStatusColor]} ${
            status.isSyncing ? 'animate-pulse' : ''
          }`}
        />
        {/* Pulse animation when syncing */}
        {status.isSyncing && (
          <div
            className={`absolute inset-0 ${dotSizes[size]} rounded-full ${colorClasses[syncStatusColor]} animate-ping opacity-75`}
          />
        )}
      </div>

      {/* Label */}
      {showLabel && (
        <span className={`${textSizes[size]} text-gray-600 dark:text-gray-400`}>
          {syncStatusText}
        </span>
      )}

      {/* Error indicator */}
      {status.lastError && !status.isSyncing && (
        <button
          className="text-red-500 hover:text-red-700 text-xs underline"
          onClick={(e) => {
            e.stopPropagation();
            processQueue();
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}

// Compact version for header/nav
export function SyncStatusDot({ className = '' }: { className?: string }) {
  return <SyncStatusIndicator showLabel={false} size="sm" className={className} />;
}
