/**
 * Service Worker for 棋樹 (joseki-tree) PWA (Issue #23).
 * - Never intercepts Firebase Auth proxy endpoints (/__) or /login.html.
 * - Uses Network-First for SPA navigations with offline cache fallback.
 * - Uses Cache-First for immutable hashed assets, Wasm engine files, and NNUE models.
 */

const CACHE_NAME = 'joseki-tree-pwa-v3';
const APP_SHELL_URLS = [
  './',
  './manifest.webmanifest',
  './icon.svg',
  './pwa-192x192.png',
];

function isSafariOrIosUserAgent(ua) {
  if (!ua) return false;
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  const isSafari = /Safari/i.test(ua);
  const isOtherBrowser = /Chrome|Chromium|CriOS|FxiOS|Edg|EdgiOS|OPR|OPiOS|Android/i.test(ua);
  return isSafari && !isOtherBrowser;
}

function withCrossOriginIsolationHeaders(response) {
  if (
    !response ||
    response.status === 0 ||
    response.type === 'opaque' ||
    response.type === 'opaqueredirect'
  ) {
    return response;
  }
  const headers = new Headers(response.headers);
  const ua =
    self.navigator && self.navigator.userAgent ? self.navigator.userAgent : '';
  const coep = isSafariOrIosUserAgent(ua) ? 'require-corp' : 'credentialless';
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Embedder-Policy', coep);
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

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
        if (cached) return withCrossOriginIsolationHeaders(cached);
        const response = await fetch(req);
        if (response && response.ok && response.type === 'basic') {
          void cache.put(req, response.clone());
        }
        return withCrossOriginIsolationHeaders(response);
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
        return withCrossOriginIsolationHeaders(response);
      } catch {
        const directMatch = await cache.match(req);
        if (directMatch) return withCrossOriginIsolationHeaders(directMatch);
        if (req.mode === 'navigate') {
          const shellMatch = await cache.match('./');
          if (shellMatch) return withCrossOriginIsolationHeaders(shellMatch);
        }
        return Response.error();
      }
    })
  );
});
