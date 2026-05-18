'use client';
import { useEffect } from 'react';
import { useSession } from 'next-auth/react';

/**
 * ServiceWorkerRegistration
 *
 * Registers /sw.js so that push notifications can be received once the user
 * explicitly enables them from the My Account page.
 *
 * This component intentionally does NOT request notification permission or
 * create a push subscription automatically. That flow lives in
 * PushNotificationManager (account/page.js) so the user is always in control.
 *
 * Rendered inside <Providers> in layout.js so it runs on every page after auth.
 */
export default function ServiceWorkerRegistration() {
  const { data: session } = useSession();

  useEffect(() => {
    if (!session?.user) return;
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW registration failures are non-fatal
    });
  }, [session]);

  return null;
}
