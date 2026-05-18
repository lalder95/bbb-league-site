// BBB League Service Worker
// Handles Web Push notifications and notificationclick events.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle incoming push messages from the server
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'BBB League', message: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'BBB League';
  const options = {
    body: data.message || '',
    icon: '/logo.png',
    badge: '/logo.png',
    data: { link: data.link || '/' },
    tag: data.notificationId || undefined,
    renotify: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle notification click — open or focus the relevant URL
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.link) || '/';
  const fullUrl = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // If a window with the target URL is already open, focus it
        for (const client of clientList) {
          if (client.url === fullUrl && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise open a new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(fullUrl);
        }
      })
  );
});
