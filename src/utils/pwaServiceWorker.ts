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
  if (path.startsWith('/__') || path.endsWith('/login.html') || path.endsWith('/sw.js')) {
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
    pathname.endsWith('/login.html') ||
    pathname.endsWith('/sw.js')
  ) {
    return 'bypass';
  }
  if (
    pathname.includes('/assets/') ||
    pathname.includes('/engine/') ||
    pathname.includes('/models/') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.wasm')
  ) {
    return 'cache-first';
  }
  if (mode === 'navigate' || pathname === '/' || pathname.endsWith('/') || pathname.endsWith('.html')) {
    return 'network-first';
  }
  return 'network-first';
}

/**
 * Returns true when running inside the Tauri desktop WebView runtime,
 * where bundled assets are served locally and a Service Worker is unnecessary.
 */
export function isTauriDesktopRuntime(): boolean {
  return (
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
  );
}

/**
 * Registers the PWA Service Worker in production web builds.
 * In Tauri desktop builds, unregisters any stale Service Worker and clears
 * old PWA caches so upgraded desktop binaries never serve frozen assets.
 */
export async function registerPwaServiceWorker(
  isProd: boolean = import.meta.env.PROD
): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  if (isTauriDesktopRuntime()) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.allSettled(
        registrations.map((registration) => registration.unregister())
      );
      if ('caches' in window) {
        const keys = await window.caches.keys();
        await Promise.allSettled(
          keys
            .filter((key) => key.startsWith('joseki-tree-pwa-'))
            .map((key) => window.caches.delete(key))
        );
      }
    } catch (err) {
      console.warn('[PWA] Desktop Service Worker cleanup failed:', err);
    }
    return null;
  }

  if (!isProd) return null;

  try {
    const baseUrl = new URL(import.meta.env.BASE_URL || './', window.location.href);
    const swUrl = new URL('sw.js', baseUrl).pathname;
    const scope = baseUrl.pathname;

    if (!window.crossOriginIsolated) {
      let hasReloaded = false;
      try {
        hasReloaded = window.sessionStorage.getItem('kiju_coi_reloaded') === '1';
      } catch {
        // Ignore sessionStorage errors
      }
      if (!hasReloaded) {
        navigator.serviceWorker.addEventListener(
          'controllerchange',
          () => {
            if (window.crossOriginIsolated) return;
            try {
              if (window.sessionStorage.getItem('kiju_coi_reloaded') === '1') {
                return;
              }
              window.sessionStorage.setItem('kiju_coi_reloaded', '1');
            } catch {
              // Ignore sessionStorage errors
            }
            window.location.reload();
          },
          { once: true }
        );
      }
    }

    const registration = await navigator.serviceWorker.register(swUrl, {
      scope,
    });
    return registration;
  } catch (err) {
    console.warn('[PWA] Service Worker registration failed:', err);
    return null;
  }
}
