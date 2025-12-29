const CACHE_NAME = 'laundromat-v2.0.0';
const urlsToCache = [
  '/',
  '/login',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Caching app shell');
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

// Fetch event with network-first strategy for API, cache-first for static
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip cross-origin requests
  if (!request.url.startsWith(self.location.origin)) {
    return;
  }

  // API requests - network first, fallback to cache
  if (request.url.includes('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then(
            (cached) =>
              cached ||
              new Response('[]', {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              })
          );
        })
    );
    return;
  }

  // Static assets - stale-while-revalidate
  event.respondWith(
    caches.match(request).then((response) => {
      const fetchPromise = fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        }
        return networkResponse;
      });

      return response || fetchPromise;
    })
  );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Background sync for offline orders
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    event.waitUntil(syncOfflineData());
  }
});

// Push notifications
self.addEventListener('push', (event) => {
  let options = {
    body: 'New order update available',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    tag: 'order-update',
    requireInteraction: true,
    actions: [
      {
        action: 'view',
        title: 'View Orders',
        icon: '/icons/icon-192x192.png',
      },
    ],
  };

  if (event.data) {
    try {
      const data = event.data.json();
      options.body = data.message || options.body;
    } catch {
      // Ignore parse errors
    }
  }

  event.waitUntil(self.registration.showNotification('Laundromat Update', options));
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'view' || !event.action) {
    event.waitUntil(clients.openWindow('/'));
  }
});

// Sync function
async function syncOfflineData() {
  try {
    console.log('Syncing offline data...');

    const allClients = await self.clients.matchAll();
    allClients.forEach((client) => {
      client.postMessage({ type: 'SYNC_OFFLINE_DATA' });
    });
  } catch (error) {
    console.error('Sync failed:', error);
  }
}
