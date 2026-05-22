// Aura PWA Service Worker — push notifications e navegação offline básica
const NOTIFICATION_ICON = '/icons/icon-192.png';
const NOTIFICATION_BADGE = '/icons/icon-192.png';

// ── Push event ────────────────────────────────────────────────────────────────
self.addEventListener('push', function (event) {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Aura', body: event.data.text(), url: '/' };
  }

  const { title, body, url, tag, role } = payload;

  const showNotification = self.registration.showNotification(title || 'Aura', {
    body: body || '',
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_BADGE,
    tag: tag || role || 'aura-notification',
    renotify: true,
    requireInteraction: false,
    data: { url: url || '/', role },
    vibrate: [200, 100, 200],
  });

  // Notifica clientes abertos para tocar o som no foreground
  const notifyClients = self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then(function (clientList) {
      clientList.forEach(function (client) {
        client.postMessage({ type: 'PUSH_RECEIVED', title, body, url, role });
      });
    });

  event.waitUntil(Promise.all([showNotification, notifyClients]));
});

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var targetUrl = event.notification.data && event.notification.data.url ? event.notification.data.url : '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (clientList) {
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          if (client.url.includes(targetUrl) && 'focus' in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});

// ── Install / Activate ────────────────────────────────────────────────────────
self.addEventListener('install', function (event) {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});
