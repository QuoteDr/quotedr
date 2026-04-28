// QuoteDr Service Worker
const CACHE_NAME = 'quotedr-v1';

// Only cache static assets — NOT HTML pages (they must always be fresh from server)
const STATIC_ASSETS = [
  '/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first strategy: always try network, fall back to cache for static assets only
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET, cross-origin, Supabase, and API requests — never cache these
  if (
    event.request.method !== 'GET' ||
    !url.origin.includes('quotedr.io') ||
    url.hostname.includes('supabase') ||
    url.pathname.includes('/functions/') ||
    url.pathname.includes('/rest/') ||
    url.pathname.includes('/auth/')
  ) {
    return;
  }

  // HTML pages: network-only (always fresh)
  if (url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname === '') {
    return;
  }

  // Static assets: network-first, cache fallback
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
