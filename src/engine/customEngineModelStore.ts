/**
 * IndexedDB binary storage for user-imported NNUE/evaluation model files (#141).
 * Persists large binary model buffers locally without bundling third-party
 * model files in the application distribution.
 * Falls back to an in-memory Map in non-browser test environments.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict without any (Rule 2).
 */

export const CUSTOM_ENGINE_MODELS_DB_NAME = 'joseki_tree_engine_models_db';
export const CUSTOM_ENGINE_MODELS_DB_VERSION = 1;
export const CUSTOM_ENGINE_MODELS_STORE_NAME = 'models';

export interface StoredCustomEngineModel {
  id: string;
  nnFileName: string;
  nnBuffer: ArrayBuffer;
  progressFileName?: string;
  progressBuffer?: ArrayBuffer;
  tagJson?: Record<string, unknown>;
  sizeBytes: number;
  createdAt: string;
}

const memoryFallbackStore = new Map<string, StoredCustomEngineModel>();

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openModelsDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(
      CUSTOM_ENGINE_MODELS_DB_NAME,
      CUSTOM_ENGINE_MODELS_DB_VERSION
    );

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CUSTOM_ENGINE_MODELS_STORE_NAME)) {
        db.createObjectStore(CUSTOM_ENGINE_MODELS_STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error ?? new Error('Failed to open IndexedDB engine models database'));
    };
  });
}

/**
 * Persists a user-imported evaluation model binary record in IndexedDB.
 */
export async function saveCustomEngineModelBinary(
  model: StoredCustomEngineModel
): Promise<void> {
  memoryFallbackStore.set(model.id, model);
  if (!hasIndexedDb()) return;

  const db = await openModelsDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CUSTOM_ENGINE_MODELS_STORE_NAME, 'readwrite');
      const store = tx.objectStore(CUSTOM_ENGINE_MODELS_STORE_NAME);
      store.put(model);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Failed to save model binary'));
      tx.onabort = () => reject(tx.error ?? new Error('Aborted saving model binary'));
    });
  } finally {
    db.close();
  }
}

/**
 * Loads a stored user-imported evaluation model binary record by model id.
 */
export async function loadCustomEngineModelBinary(
  id: string
): Promise<StoredCustomEngineModel | null> {
  if (!id) return null;
  if (!hasIndexedDb()) {
    return memoryFallbackStore.get(id) ?? null;
  }

  try {
    const db = await openModelsDatabase();
    try {
      const found = await new Promise<StoredCustomEngineModel | null>((resolve, reject) => {
        const tx = db.transaction(CUSTOM_ENGINE_MODELS_STORE_NAME, 'readonly');
        const store = tx.objectStore(CUSTOM_ENGINE_MODELS_STORE_NAME);
        const request = store.get(id);
        request.onsuccess = () => {
          const res = request.result as StoredCustomEngineModel | undefined;
          resolve(res ?? null);
        };
        request.onerror = () => reject(request.error ?? new Error('Failed to read model binary'));
      });
      if (found) return found;
    } finally {
      db.close();
    }
  } catch (err) {
    console.warn('[customEngineModelStore] IndexedDB load fallback:', err);
  }

  return memoryFallbackStore.get(id) ?? null;
}

/**
 * Deletes a stored evaluation model binary record from IndexedDB.
 */
export async function deleteCustomEngineModelBinary(id: string): Promise<void> {
  memoryFallbackStore.delete(id);
  if (!hasIndexedDb()) return;

  try {
    const db = await openModelsDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(CUSTOM_ENGINE_MODELS_STORE_NAME, 'readwrite');
        const store = tx.objectStore(CUSTOM_ENGINE_MODELS_STORE_NAME);
        store.delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('Failed to delete model binary'));
        tx.onabort = () => reject(tx.error ?? new Error('Aborted deleting model binary'));
      });
    } finally {
      db.close();
    }
  } catch (err) {
    console.warn('[customEngineModelStore] Failed to delete model from IndexedDB:', err);
  }
}
