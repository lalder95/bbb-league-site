'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Bell } from 'lucide-react';
import { useSession } from 'next-auth/react';
import NotificationModal from './NotificationModal';

const POLL_INTERVAL_MS = 60_000; // re-fetch every 60 seconds

/**
 * NotificationBell
 *
 * Displays a bell icon with an unread-count badge. Clicking opens the
 * NotificationModal. Polls /api/notifications on mount and every 60s.
 * Exposes `refreshNotifications` so the modal can trigger a re-fetch
 * after marking items as read.
 */
export default function NotificationBell() {
  const { data: session } = useSession();
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const intervalRef = useRef(null);

  const fetchNotifications = useCallback(async () => {
    if (!session?.user) return;
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications || []);
    } catch {
      // network error — keep stale data
    }
  }, [session]);

  // Initial fetch + polling
  useEffect(() => {
    if (!session?.user) return;
    fetchNotifications();
    intervalRef.current = setInterval(fetchNotifications, POLL_INTERVAL_MS);
    return () => clearInterval(intervalRef.current);
  }, [fetchNotifications, session]);

  const unreadCount = notifications.filter(n => !n.read).length;

  if (!session?.user) return null;

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        className="relative flex items-center justify-center w-9 h-9 rounded-full text-white/70 hover:text-[#FF4B1F] hover:bg-white/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4B1F]/50"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span
            aria-hidden
            className="absolute top-0.5 right-0.5 min-w-[1.1rem] h-[1.1rem] flex items-center justify-center rounded-full bg-[#FF4B1F] text-white text-[0.6rem] font-bold leading-none px-0.5"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      <NotificationModal
        isOpen={isOpen}
        notifications={notifications}
        onClose={() => setIsOpen(false)}
        onRefresh={fetchNotifications}
      />
    </>
  );
}
