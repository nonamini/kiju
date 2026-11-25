import { describe, expect, it } from 'vitest';
import {
  classifyCacheStrategy,
  shouldServiceWorkerHandleRequest,
} from './pwaServiceWorker';

describe('pwaServiceWorker routing & cache guards (Issue #23)', () => {
  const origin = 'https://joseki-tree.example.com';

  it('bypasses Firebase Auth proxy routes, login.html, non-GET, and cross-origin URLs', () => {
    expect(
      shouldServiceWorkerHandleRequest({
        method: 'GET',
        requestUrl: `${origin}/__/auth/handler`,
        selfOrigin: origin,
      })
    ).toBe(false);

    expect(
      shouldServiceWorkerHandleRequest({
        method: 'GET',
        requestUrl: `${origin}/login.html`,
        selfOrigin: origin,
      })
    ).toBe(false);

    expect(
      shouldServiceWorkerHandleRequest({
        method: 'POST',
        requestUrl: `${origin}/api/sync`,
        selfOrigin: origin,
      })
    ).toBe(false);

    expect(
      shouldServiceWorkerHandleRequest({
        method: 'GET',
        requestUrl: 'https://firestore.googleapis.com/v1/projects/foo',
        selfOrigin: origin,
      })
    ).toBe(false);

    expect(classifyCacheStrategy('/__/auth/iframe')).toBe('bypass');
    expect(classifyCacheStrategy('/login.html')).toBe('bypass');
    expect(classifyCacheStrategy('/sw.js')).toBe('bypass');
  });

  it('uses cache-first for bundled assets, wasm engine binaries, and NNUE models', () => {
    expect(classifyCacheStrategy('/assets/index-abc123.js')).toBe('cache-first');
    expect(classifyCacheStrategy('/engine/fairy-stockfish.wasm')).toBe('cache-first');
    expect(classifyCacheStrategy('/models/nn.bin')).toBe('cache-first');
    expect(classifyCacheStrategy('/pwa-192x192.png')).toBe('cache-first');
    expect(classifyCacheStrategy('/icon.svg')).toBe('cache-first');
  });

  it('uses network-first for SPA navigations and manifest', () => {
    expect(
      shouldServiceWorkerHandleRequest({
        method: 'GET',
        requestUrl: `${origin}/studio`,
        selfOrigin: origin,
      })
    ).toBe(true);

    expect(classifyCacheStrategy('/studio', 'navigate')).toBe('network-first');
    expect(classifyCacheStrategy('/', 'navigate')).toBe('network-first');
    expect(classifyCacheStrategy('/manifest.webmanifest')).toBe('network-first');
  });
});
