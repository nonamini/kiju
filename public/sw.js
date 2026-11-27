/**
 * Service Worker for 棋樹 (joseki-tree) PWA (Issue #23).
 * - Never intercepts Firebase Auth proxy endpoints (/__) or /login.html.
 * - Uses Network-First for SPA navigations with offline cache fallback.
 * - Uses Cache-First for immutable hashed assets, Wasm engine files, and NNUE models.
 */

const CACHE_NAME = 'joseki-tree-pwa-v2';
const APP_SHELL_URLS = [
  './',
  './manifest.webmanifest',
  './icon.svg',
  './pwa-192x192.png',
];

function classifyRequestStrategy(url, mode) {
  const path = url.pathname;
  if (path.startsWith('/__') || path.endsWith('/login.html') || path.endsWith('/sw.js')) {
    return 'bypass';
  }
  if (
    path.includes('/assets/') ||
    path.includes('/engine/') ||
    path.includes('/models/') ||
    path.endsWith('.png') ||
    path.endsWith('.svg') ||
    path.endsWith('.wasm')
  ) {
    return 'cache-first';
  }
  if (mode === 'navigate' || path === '/' || path.endsWith('/') || path.endsWith('.html')) {
    return 'network-first';
  }
  return 'network-first';
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((oldKey) => caches.delete(oldKey))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  if (url.origin !== self.location.origin) return;

  const strategy = classifyRequestStrategy(url, req.mode);
  if (strategy === 'bypass') return;

  if (strategy === 'cache-first') {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const response = await fetch(req);
        if (response && response.ok && response.type === 'basic') {
          void cache.put(req, response.clone());
        }
        return response;
      })
    );
    return;
  }

  // Network-first with offline cache fallback for SPA routes
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      try {
        const response = await fetch(req);
        if (response && response.ok && response.type === 'basic') {
          void cache.put(req, response.clone());
        }
        return response;
      } catch {
        const directMatch = await cache.match(req);
        if (directMatch) return directMatch;
        if (req.mode === 'navigate') {
          const shellMatch = await cache.match('./');
          if (shellMatch) return shellMatch;
        }
        return Response.error();
      }
    })
  );
});
