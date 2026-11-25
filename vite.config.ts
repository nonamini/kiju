import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { fileURLToPath } from 'node:url';
import { localUsiDevPlugin } from './tools/usi-bridge/viteLocalUsiPlugin.mjs';

// Cross-origin isolation (COOP+COEP) is required for SharedArrayBuffer, but
// COEP breaks the Firebase Auth iframe relay, so it must NOT be applied to the
// auth helper pages (/__/*, proxied) nor the standalone login page
// (/login.html). Everything else gets full isolation so the Wasm engine works.
const isolatedEngineHeaders = {
  name: 'isolated-engine-headers',
  configureServer(server: {
    middlewares: {
      use: (
        fn: (
          req: { url?: string },
          res: { setHeader: (k: string, v: string) => void },
          next: () => void
        ) => void
      ) => void;
    };
  }) {
    server.middlewares.use((req, res, next) => {
      const url = req.url ?? '';
      // Firebase Auth helper pages (/__/auth/*) are proxied from firebaseapp.com
      // and must stay non-isolated: COEP credentialless breaks their cross-origin
      // token exchange / gapi relay. Everything else gets full isolation so the
      // Wasm engine can use SharedArrayBuffer.
      if (!url.startsWith('/__') && !url.startsWith('/login.html')) {
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
      }
      next();
    });
  },
};

// https://vite.dev/config/
// Plain HTTP is the default dev mode: http://localhost is a secure context, so
// COOP+COEP still enable SharedArrayBuffer for the Wasm engine, and localStorage
// data saved under the http origin stays visible (no migration needed).
// `vite --mode https` serves HTTPS via basicSsl for cases that need it
// (e.g. testing from another device on the LAN, where http is not a secure
// context and the engine would be unavailable).
export default defineConfig(({ mode }) => {
  const isHttps = mode === 'https';
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const firebaseAuthDomain =
    env.VITE_FIREBASE_AUTH_DOMAIN || process.env.VITE_FIREBASE_AUTH_DOMAIN || '';

  return {
    base: process.env.GITHUB_PAGES === 'true' ? '/kiju/' : './',
    plugins: [react(), ...(isHttps ? [basicSsl()] : []), isolatedEngineHeaders, localUsiDevPlugin()],
    server: {
      port: 5173,
      // The OAuth redirect URI is registered per-origin, so the dev origin must
      // stay on port 5173. Fail loudly instead of drifting to another port.
      strictPort: true,
      // With HTTPS (basicSsl), the client would default to ws:// (mixed content)
      // because https is enabled in configResolved after HMR options resolve.
      hmr: isHttps ? { protocol: 'wss' } : true,
      // Optional Firebase Auth helper proxy for HTTPS dev mode when VITE_FIREBASE_AUTH_DOMAIN is configured
      ...(firebaseAuthDomain
        ? {
            proxy: {
              '/__': {
                target: `https://${firebaseAuthDomain}`,
                changeOrigin: true,
                secure: true,
              },
            },
          }
        : {}),
      // The workspace may live on a virtual/cloud drive (e.g. pCloud, exFAT) where
      // native fs events fire spuriously and atime always equals mtime, which makes
      // chokidar report phantom "change" events and causes an endless full-reload loop.
      // Polling compares real size/mtime, so phantom events are ignored.
      watch: {
        usePolling: true,
        interval: 1000,
        ignored: [
          '**/.git/**',
          '**/node_modules/**',
          '**/.gemini/**',
          '**/brain/**',
          '**/*.log',
          '**/.system_generated/**',
        ],
      },
    },
    build: {
      rollupOptions: {
        input: {
          main: fileURLToPath(new URL('./index.html', import.meta.url)),
          login: fileURLToPath(new URL('./login.html', import.meta.url)),
        },
        output: {
          manualChunks(id: string) {
            const nid = id.replace(/\\/g, '/');
            if (!nid.includes('/node_modules/')) return undefined;
            if (
              nid.includes('/react-dom/') ||
              nid.includes('/react-router') ||
              nid.includes('/react/')
            ) {
              return 'react-vendor';
            }
            if (nid.includes('/firebase/') || nid.includes('/@firebase/')) {
              return 'firebase';
            }
            if (nid.includes('/chart.js/') || nid.includes('/react-chartjs-2/')) {
              return 'chart-vendor';
            }
            if (nid.includes('/shogi.js/') || nid.includes('/json-kifu-format/')) {
              return 'shogi-vendor';
            }
            if (nid.includes('/i18next/') || nid.includes('/react-i18next/')) {
              return 'i18n-vendor';
            }
            return undefined;
          },
        },
      },
    },
  };
});
