'use client';
import { useEffect, useState, useCallback } from 'react';
import { X, Bell, ExternalLink, CheckCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';

/**
 * NotificationModal
 *
 * Props:
 *   isOpen        {boolean}   — whether the modal is visible
 *   notifications {Array}     — notification objects from /api/notifications
 *   onClose       {Function}  — called when modal should close
 *   onRefresh     {Function}  — called after marking all as read, so the bell re-fetches
 */
export default function NotificationModal({ isOpen, notifications = [], onClose, onRefresh }) {
  const router = useRouter();
  const [localNotifications, setLocalNotifications] = useState(notifications);
  const [markingAll, setMarkingAll] = useState(false);

  // Keep local state in sync with parent
  useEffect(() => {
    setLocalNotifications(notifications);
  }, [notifications]);

  // Mark all as read when modal opens (if there are unread items)
  useEffect(() => {
    if (!isOpen) return;
    const hasUnread = notifications.some(n => !n.read);
    if (!hasUnread) return;

    // Optimistically update UI first
    setLocalNotifications(prev => prev.map(n => ({ ...n, read: true })));

    fetch('/api/notifications/mark-all-read', { method: 'POST' })
      .then(() => onRefresh?.())
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleDelete = useCallback(async (id) => {
    setLocalNotifications(prev => prev.filter(n => n._id !== id));
    try {
      await fetch(`/api/notifications/${id}`, { method: 'DELETE' });
      onRefresh?.();
    } catch {
      // ignore
    }
  }, [onRefresh]);

  const handleMarkAllRead = useCallback(async () => {
    setMarkingAll(true);
    setLocalNotifications(prev => prev.map(n => ({ ...n, read: true })));
    try {
      await fetch('/api/notifications/mark-all-read', { method: 'POST' });
      onRefresh?.();
    } catch {
      // ignore
    } finally {
      setMarkingAll(false);
    }
  }, [onRefresh]);

  const handleNotificationClick = useCallback((notification) => {
    if (notification.link) {
      router.push(notification.link);
      onClose();
    }
  }, [router, onClose]);

  if (!isOpen) return null;

  const unreadCount = localNotifications.filter(n => !n.read).length;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-end"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-hidden />

      {/* Panel */}
      <div
        className="relative z-10 mt-16 mr-2 md:mr-4 w-full max-w-sm bg-[#001A2B]/95 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[calc(100dvh-5rem)]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-[#FF4B1F]" />
            <span className="text-white font-semibold text-sm">Notifications</span>
            {unreadCount > 0 && (
              <span className="bg-[#FF4B1F] text-white text-[0.6rem] font-bold px-1.5 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                disabled={markingAll}
                title="Mark all as read"
                className="flex items-center gap-1 px-2 py-1 rounded-md text-white/50 hover:text-white/80 hover:bg-white/5 text-xs transition-colors disabled:opacity-50"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Mark all read</span>
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close notifications"
              className="flex items-center justify-center w-7 h-7 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Notification list */}
        <div className="overflow-y-auto flex-1">
          {localNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-white/40">
              <Bell className="h-8 w-8 mb-3 opacity-30" />
              <p className="text-sm">You&apos;re all caught up!</p>
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {localNotifications.map(notification => (
                <li
                  key={notification._id}
                  className={`relative group px-4 py-3 transition-colors ${
                    notification.link
                      ? 'cursor-pointer hover:bg-white/5'
                      : 'hover:bg-white/[0.02]'
                  } ${!notification.read ? 'bg-[#FF4B1F]/5' : ''}`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  {/* Unread indicator */}
                  {!notification.read && (
                    <span
                      aria-hidden
                      className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[#FF4B1F]"
                    />
                  )}

                  <div className="pl-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm leading-snug ${!notification.read ? 'text-white font-medium' : 'text-white/80'}`}>
                        {notification.title}
                      </p>
                      <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                        {notification.link && (
                          <ExternalLink className="h-3 w-3 text-white/30 group-hover:text-white/60 transition-colors" />
                        )}
                        <button
                          onClick={e => { e.stopPropagation(); handleDelete(notification._id); }}
                          aria-label="Dismiss notification"
                          className="opacity-0 group-hover:opacity-100 flex items-center justify-center w-5 h-5 rounded text-white/40 hover:text-white hover:bg-white/10 transition-all"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    {notification.message && (
                      <p className="text-xs text-white/50 mt-0.5 leading-relaxed">{notification.message}</p>
                    )}
                    <p className="text-[0.65rem] text-white/30 mt-1">
                      {formatRelativeTime(notification.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function formatRelativeTime(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
