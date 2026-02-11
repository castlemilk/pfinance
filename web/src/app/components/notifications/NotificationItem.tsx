'use client';

import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  Target,
  Receipt,
  AlertCircle,
  CreditCard,
  Info,
  Users,
  BarChart3,
  CheckCircle,
} from 'lucide-react';
import type { Notification } from '@/gen/pfinance/v1/types_pb';
import { NotificationType } from '@/gen/pfinance/v1/types_pb';
import { useNotifications } from '../../context/NotificationContext';

// ============================================================================
// Relative time helper (no external dependency)
// ============================================================================

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);

  if (diffSeconds < 60) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 4) return `${diffWeeks}w ago`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ============================================================================
// Icon helper
// ============================================================================

function getNotificationIcon(type: NotificationType) {
  switch (type) {
    case NotificationType.BUDGET_THRESHOLD:
      return <AlertTriangle className="w-4 h-4 text-amber-500" />;
    case NotificationType.GOAL_MILESTONE:
      return <Target className="w-4 h-4 text-emerald-500" />;
    case NotificationType.BILL_REMINDER:
      return <Receipt className="w-4 h-4 text-blue-500" />;
    case NotificationType.UNUSUAL_SPENDING:
      return <AlertCircle className="w-4 h-4 text-red-500" />;
    case NotificationType.SUBSCRIPTION_ALERT:
      return <CreditCard className="w-4 h-4 text-purple-500" />;
    case NotificationType.GROUP_ACTIVITY:
      return <Users className="w-4 h-4 text-indigo-500" />;
    case NotificationType.WEEKLY_DIGEST:
      return <BarChart3 className="w-4 h-4 text-teal-500" />;
    case NotificationType.EXTRACTION_COMPLETE:
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    case NotificationType.SYSTEM:
    default:
      return <Info className="w-4 h-4 text-muted-foreground" />;
  }
}

// ============================================================================
// NotificationItem Component
// ============================================================================

interface NotificationItemProps {
  notification: Notification;
  onClose?: () => void;
}

export default function NotificationItem({ notification, onClose }: NotificationItemProps) {
  const router = useRouter();
  const { markRead } = useNotifications();

  const createdAt = notification.createdAt
    ? new Date(Number(notification.createdAt.seconds) * 1000)
    : new Date();

  const handleClick = async () => {
    if (!notification.isRead) {
      await markRead(notification.id);
    }
    if (notification.actionUrl) {
      router.push(notification.actionUrl);
      onClose?.();
    }
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        'w-full flex items-start gap-3 p-3 text-left rounded-md transition-colors',
        'hover:bg-muted/50',
        notification.actionUrl && 'cursor-pointer',
        !notification.actionUrl && 'cursor-default'
      )}
    >
      {/* Icon */}
      <div className="mt-0.5 shrink-0">
        {getNotificationIcon(notification.type)}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <p
          className={cn(
            'text-sm leading-snug',
            !notification.isRead ? 'font-semibold text-foreground' : 'font-normal text-foreground/80'
          )}
        >
          {notification.title}
        </p>
        <p className="text-xs text-muted-foreground line-clamp-2">
          {notification.message}
        </p>
        <p className="text-xs text-muted-foreground/70">
          {formatRelativeTime(createdAt)}
        </p>
      </div>

      {/* Unread indicator */}
      {!notification.isRead && (
        <div className="mt-1.5 shrink-0">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
        </div>
      )}
    </button>
  );
}
