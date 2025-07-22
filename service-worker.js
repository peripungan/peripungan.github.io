const CACHE_NAME = 'pwa-stok-cache-v1';
const FILES_TO_CACHE = [
  '/',
  '/index.html',
  '/js/main.js',
  '/css/style.css',
  'https://pusatpneumatic.com/pernataan/scripts/stok.json', // 💡 Cache remote JSON
];

// Install dan cache
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Install');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate dan hapus cache lama
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activate');
  event.waitUntil(
    caches.keys().then((keyList) =>
      Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

// Fetch dan fallback ke cache
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((response) => {
      return (
        response ||
        fetch(event.request).catch(() =>
          caches.match('https://pusatpneumatic.com/pernataan/scripts/stok.json')
        )
      );
    })
  );
});
