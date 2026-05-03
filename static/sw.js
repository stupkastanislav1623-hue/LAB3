// Service Worker для Collaborative Grid PWA
const CACHE_VERSION = 'v2.0.0';
const CACHE_NAME = `collab-grid-${CACHE_VERSION}`;

// Файли для кешування під час встановлення
const STATIC_CACHE_URLS = [
  '/',
  '/static/styles.css',
  '/static/app.js',
  '/static/manifest.json',
  '/static/icons/icon-72.png',
  '/static/icons/icon-96.png',
  '/static/icons/icon-128.png',
  '/static/icons/icon-144.png',
  '/static/icons/icon-152.png',
  '/static/icons/icon-192.png',
  '/static/icons/icon-256.png',
  '/static/icons/icon-512.png'
];

// URL, які завжди мають отримуватись з мережі (динамічні)
const NETWORK_ONLY_URLS = [
  '/socket.io/'
];

// Подія install - кешування статичних ресурсів
self.addEventListener('install', (event) => {
  console.log('[SW] Installing new version:', CACHE_VERSION);
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_CACHE_URLS);
      })
      .then(() => {
        console.log('[SW] Skip waiting to activate immediately');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Install failed:', error);
      })
  );
});

// Подія activate - очищення застарілих кешів
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating new version:', CACHE_VERSION);
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME && cacheName.startsWith('collab-grid-')) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('[SW] Claiming clients');
        return self.clients.claim();
      })
  );
});

// Стратегія: Cache First, Fallback to Network (для статики)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Перевірка чи URL має бути завантажений тільки з мережі
  if (NETWORK_ONLY_URLS.some(networkUrl => url.pathname.startsWith(networkUrl))) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // Для статичних ресурсів - спочатку кеш, потім мережа
  if (STATIC_CACHE_URLS.includes(url.pathname) || 
      url.pathname.match(/\.(css|js|png|json)$/)) {
    event.respondWith(
      caches.match(event.request)
        .then((cachedResponse) => {
          if (cachedResponse) {
            console.log('[SW] Serving from cache:', url.pathname);
            return cachedResponse;
          }
          
          console.log('[SW] Fetching from network:', url.pathname);
          return fetch(event.request)
            .then((networkResponse) => {
              // Зберігаємо в кеш для майбутніх запитів
              if (networkResponse && networkResponse.status === 200) {
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME)
                  .then((cache) => {
                    cache.put(event.request, responseToCache);
                  });
              }
              return networkResponse;
            })
            .catch((error) => {
              console.error('[SW] Fetch failed:', error);
              // Повертаємо fallback сторінку для HTML запитів
              if (event.request.headers.get('accept').includes('text/html')) {
                return caches.match('/');
              }
              return new Response('Network error', { status: 503 });
            });
        })
    );
    return;
  }
  
  // Для інших запитів - мережа з fallback на кеш
  event.respondWith(
    fetch(event.request)
      .catch(() => {
        return caches.match(event.request);
      })
  );
});

// Обробка push-сповіщень
self.addEventListener('push', (event) => {
  console.log('[SW] Push event received:', event);
  
  let data = {
    title: 'Collaborative Grid',
    body: 'Новий користувач приєднався до сітки!',
    icon: '/static/icons/icon-192.png',
    badge: '/static/icons/icon-72.png',
    tag: 'user-joined',
    data: {
      url: '/'
    }
  };
  
  if (event.data) {
    try {
      const parsedData = event.data.json();
      data = { ...data, ...parsedData };
    } catch (e) {
      data.body = event.data.text();
    }
  }
  
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      badge: data.badge,
      tag: data.tag,
      data: data.data,
      vibrate: [200, 100, 200],
      actions: [
        {
          action: 'open',
          title: 'Відкрити додаток'
        },
        {
          action: 'close',
          title: 'Закрити'
        }
      ]
    })
  );
});

// Обробка кліку по сповіщенню
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification click:', event);
  
  event.notification.close();
  
  if (event.action === 'close') {
    return;
  }
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Якщо вже є відкрите вікно, фокусуємо його
        for (const client of clientList) {
          if (client.url === '/' && 'focus' in client) {
            return client.focus();
          }
        }
        // Інакше відкриваємо нове
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
  );
});