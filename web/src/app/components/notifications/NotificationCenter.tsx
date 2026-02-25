'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Bell, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useNotifications } from '../../context/NotificationContext';
import NotificationItem from './NotificationItem';

export default function NotificationCenter() {
  const {
    notifications,
    unreadCount,
    loading,
    error,
    loadNotifications,
    markAllRead,
  } = useNotifications();

  const [open, setOpen] = useState(false);

  // Load full notifications list when popover opens
  useEffect(() => {
    if (open) {
      loadNotifications();
    }
  }, [open, loadNotifications]);

  const handleMarkAllRead = async () => {
    await markAllRead();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative overflow-visible">
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full leading-none pointer-events-none z-10">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
          <span className="sr-only">Notifications</span>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <h3 className="text-sm font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-auto py-1 px-2 text-muted-foreground hover:text-foreground"
              onClick={handleMarkAllRead}
            >
              Mark all read
            </Button>
          )}
        </div>

        <Separator />

        {/* Notification list */}
        <ScrollArea className="h-[320px]">
          {error ? (
            <div className="flex flex-col items-center justify-center py-8 px-4">
              <AlertCircle className="w-8 h-8 text-red-500/60 mb-2" />
              <p className="text-sm text-muted-foreground mb-3">Failed to load notifications</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadNotifications()}
                className="gap-2"
              >
                <RefreshCw className="w-3 h-3" />
                Retry
              </Button>
            </div>
          ) : loading && notifications.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-sm text-muted-foreground">Loading...</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 px-4">
              <Bell className="w-8 h-8 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No notifications yet</p>
            </div>
          ) : (
            <div className="p-1">
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onClose={() => setOpen(false)}
                />
              ))}
            </div>
          )}
        </ScrollArea>

        <Separator />

        {/* Footer */}
        <div className="p-2">
          <Link href="/personal/notifications/" onClick={() => setOpen(false)}>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground hover:text-foreground"
            >
              View all
            </Button>
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
