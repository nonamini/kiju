import { initializeApp, getApps, getApp, deleteApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore/lite';

export interface FirebaseConfig {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
}

export const CUSTOM_FIREBASE_STORAGE_KEY = 'joseki_tree_custom_firebase_config';

const resolveAuthDomain = (defaultDomain?: string): string => {
  if (typeof window === 'undefined') return defaultDomain || '';
  const host = window.location.hostname;
  if (host.endsWith('.web.app') || host.endsWith('.firebaseapp.com')) {
    return host;
  }
  if (
    import.meta.env.DEV &&
    (host === 'localhost' || host === '127.0.0.1') &&
    window.location.protocol === 'https:'
  ) {
    return window.location.host;
  }
  return defaultDomain || '';
};

/**
 * Loads custom Firebase config from localStorage if present.
 */
export const getCustomFirebaseConfig = (): FirebaseConfig | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CUSTOM_FIREBASE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FirebaseConfig;
    if (parsed && parsed.apiKey && parsed.projectId) {
      return parsed;
    }
  } catch (err) {
    console.warn('[Firebase] Failed to parse custom config from localStorage:', err);
  }
  return null;
};

/**
 * Saves custom Firebase config to localStorage.
 */
export const saveCustomFirebaseConfig = (config: FirebaseConfig): void => {
  localStorage.setItem(CUSTOM_FIREBASE_STORAGE_KEY, JSON.stringify(config));
  reinitializeFirebase();
};

/**
 * Clears custom Firebase config from localStorage.
 */
export const clearCustomFirebaseConfig = (): void => {
  localStorage.removeItem(CUSTOM_FIREBASE_STORAGE_KEY);
  reinitializeFirebase();
};

/**
 * Resolves active Firebase config by checking:
 * 1. User-provided custom config from localStorage
 * 2. Environment variables (VITE_FIREBASE_*)
 */
export const getActiveFirebaseConfig = (): FirebaseConfig => {
  const custom = getCustomFirebaseConfig();
  if (custom) {
    return {
      ...custom,
      authDomain: custom.authDomain || resolveAuthDomain(custom.authDomain),
    };
  }

  const envAuthDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
    authDomain: resolveAuthDomain(envAuthDomain),
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
  };
};

/**
 * Checks whether Firebase credentials are provided in active configuration.
 */
export const isFirebaseConfigured = (): boolean => {
  const config = getActiveFirebaseConfig();
  return Boolean(config.apiKey && config.projectId && config.apiKey.length > 5 && config.apiKey !== 'dummy');
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

type ConfigChangeCallback = () => void;
const configChangeListeners: Set<ConfigChangeCallback> = new Set();

export const subscribeFirebaseConfigChange = (callback: ConfigChangeCallback): (() => void) => {
  configChangeListeners.add(callback);
  return () => {
    configChangeListeners.delete(callback);
  };
};

const notifyConfigChange = () => {
  configChangeListeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error('[Firebase] Error in config change listener:', e);
    }
  });
};

export const reinitializeFirebase = async (): Promise<boolean> => {
  if (app) {
    try {
      await deleteApp(app);
    } catch (e) {
      console.warn('[Firebase] Failed to delete existing app:', e);
    }
    app = null;
    auth = null;
    db = null;
  }

  if (isFirebaseConfigured()) {
    try {
      const activeConfig = getActiveFirebaseConfig();
      app = getApps().length > 0 ? getApp() : initializeApp(activeConfig);
      auth = getAuth(app);
      db = getFirestore(app);
      notifyConfigChange();
      return true;
    } catch (err) {
      console.warn('[Firebase] Reinitialization failed; falling back to offline mode:', err);
      notifyConfigChange();
      return false;
    }
  } else {
    notifyConfigChange();
    return false;
  }
};

// Initial setup
if (isFirebaseConfigured()) {
  try {
    const activeConfig = getActiveFirebaseConfig();
    app = getApps().length > 0 ? getApp() : initializeApp(activeConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (err) {
    console.warn('[Firebase] Initialization failed; using offline sandbox mode:', err);
  }
}

export const getDb = (): Firestore | null => db;
export const getAuthInstance = (): Auth | null => auth;
export const getAppInstance = (): FirebaseApp | null => app;

export { app, auth, db };
