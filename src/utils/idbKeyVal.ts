/**
 * Minimal IndexedDB key-value store for large payloads that exceed the ~5MB
 * localStorage origin quota (e.g., unified KifuRecord arrays with evaluations).
 * Gracefully no-ops when indexedDB is unavailable (Node/Vitest/SSR).
 */

const DB_NAME = 'joseki_tree_db';
const DB_VERSION = 1;
const STORE_NAME = 'kv';

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
}

/** Reads a value from IndexedDB by key, or returns undefined if missing/unavailable. */
export async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDatabase();
  if (!db) return undefined;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error ?? new Error(`IndexedDB get failed for ${key}`));
  });
}

/** Writes a value to IndexedDB under the given key. */
export async function idbSet<T>(key: string, value: T): Promise<void> {
  const db = await openDatabase();
  if (!db) return;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error(`IndexedDB set failed for ${key}`));
  });
}
