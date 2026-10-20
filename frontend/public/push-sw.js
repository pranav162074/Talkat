// Loaded into the service worker that vite-plugin-pwa generates (see importScripts in
// vite.config.js). It turns a push from the server into a notification, and opens the
// right chat when the notification is tapped.

// A push that isn't valid JSON still gets the fallback notification below
const readPayload = (event) => {
  try {
    return event.data ? event.data.json() : {};
  } catch {
    return {};
  }
};

self.addEventListener('push', (event) => {
  const data = readPayload(event);

  // Browsers require every push to show a notification, so there is always a fallback text
  event.waitUntil(
    self.registration.showNotification(data.title || 'Talkat', {
      body: data.body || 'You have a new message',
      icon: data.icon || '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      // One notification per chat: a new message replaces the previous one instead of stacking
      tag: data.conversationId || 'talkat',
      renotify: true,
      data: { url: data.url || '/', conversationId: data.conversationId || null },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { url, conversationId } = event.notification.data || {};

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);

      // Talkat is already open somewhere: bring it forward and tell it which chat to show
      if (open) {
        await open.focus();
        open.postMessage({ type: 'open-conversation', conversationId });
        return;
      }
      await self.clients.openWindow(url || '/');
    })()
  );
});
