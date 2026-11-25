/**
 * PWA Service Worker Registration & Request Routing Guard (Issue #23).
 * Follows Rule 1: strictly English code, comments, and identifiers.
 * Follows Rule 2: strict TypeScript, zero any.
 */

export type CacheStrategy = 'bypass' | 'network-first' | 'cache-first';

/**
 * Pure guard mirroring public/sw.js to ensure non-GET, cross-origin,
 * Firebase Auth proxy endpoints (/__) and /login.html are never intercepted.
 */
export function shouldServiceWorkerHandleRequest(params: {
  method: string;
  requestUrl: string;
  selfOrigin: string;
}): boolean {
  if (params.method.toUpperCase() !== 'GET') {
    return false;
  }
  let parsed: URL;
  try {
    parsed = new URL(params.requestUrl, params.selfOrigin);
  } catch {
    return false;
  }
  if (parsed.origin !== params.selfOrigin) {
    return false;
  }
  const path = parsed.pathname;
  if (path.startsWith('/__') || path === '/login.html' || path === '/sw.js') {
    return false;
  }
  return true;
}

/**
 * Classifies the cache strategy used by public/sw.js for a given pathname.
 */
export function classifyCacheStrategy(
  pathname: string,
  mode?: string
): CacheStrategy {
  if (
    pathname.startsWith('/__') ||
    pathname === '/login.html' ||
    pathname === '/sw.js'
  ) {
    return 'bypass';
  }
  if (
    pathname.startsWith('/assets/') ||
    pathname.startsWith('/engine/') ||
    pathname.startsWith('/models/') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.wasm')
  ) {
    return 'cache-first';
  }
  if (mode === 'navigate' || pathname === '/' || pathname.endsWith('.html')) {
    return 'network-first';
  }
  return 'network-first';
}

/**
 * Registers the PWA Service Worker in production builds.
 * Safe no-op in dev mode, SSR, or unsupported environments.
 */
export async function registerPwaServiceWorker(
  isProd: boolean = import.meta.env.PROD
): Promise<ServiceWorkerRegistration | null> {
  if (!isProd) return null;
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });
    return registration;
  } catch (err) {
    console.warn('[PWA] Service Worker registration failed:', err);
    return null;
  }
}
