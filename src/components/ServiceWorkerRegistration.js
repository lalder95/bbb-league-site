'use client';
import { useEffect } from 'react';
import { useSession } from 'next-auth/react';

/**
 * ServiceWorkerRegistration
 *
 * Registers /sw.js and, once registered, prompts the user to subscribe to
 * push notifications. Saves the subscription to /api/notifications/subscribe.
 *
 * Rendered inside <Providers> in layout.js so it runs on every page after auth.
 * Does nothing when the browser doesn't support service workers or push.
 */
export default function ServiceWorkerRegistration() {
  const { data: session } = useSession();

  useEffect(() => {
    if (!session?.user) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    let mounted = true;

    async function register() {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');

        // Wait for the service worker to be active
        await navigator.serviceWorker.ready;

        if (!mounted) return;

        // Check if we already have a push subscription
        const existingSubscription = await registration.pushManager.getSubscription();
        if (existingSubscription) return; // Already subscribed

        // Fetch the server's VAPID public key
        const keyRes = await fetch('/api/notifications/vapid-key');
        if (!keyRes.ok) return; // Push not configured on server
        const { publicKey } = await keyRes.json();
        if (!publicKey) return;

        // Request permission (only shows prompt once; subsequent calls return cached result)
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        // Subscribe to push
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });

        // Save subscription to server
        await fetch('/api/notifications/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(subscription.toJSON()),
        });
      } catch {
        // Registration failures are non-fatal — the rest of the app works fine
      }
    }

    register();

    return () => {
      mounted = false;
    };
  }, [session]);

  return null;
}

// Converts a URL-safe base64 string to a Uint8Array as required by
// PushManager.subscribe({ applicationServerKey })
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}
