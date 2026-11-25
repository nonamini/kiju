import { idbGet, idbSet } from './idbKeyVal';

export const CUSTOM_BOARD_IDB_KEY = 'joseki_custom_board_v1';
export const CUSTOM_PIECES_IDB_KEY = 'joseki_custom_pieces_v1';
export const CUSTOM_SOUND_IDB_KEY = 'joseki_custom_sound_v1';

const CUSTOM_ASSETS_EVENT = 'joseki_custom_assets_updated';

export type CustomAssetKind = 'board' | 'pieces' | 'sound';

export interface CustomAssetsState {
  boardDataUrl: string | null;
  pieceSpriteDataUrl: string | null;
  soundDataUrl: string | null;
}

const KEY_BY_KIND: Record<CustomAssetKind, string> = {
  board: CUSTOM_BOARD_IDB_KEY,
  pieces: CUSTOM_PIECES_IDB_KEY,
  sound: CUSTOM_SOUND_IDB_KEY,
};

let cachedAssets: CustomAssetsState = {
  boardDataUrl: null,
  pieceSpriteDataUrl: null,
  soundDataUrl: null,
};

let initPromise: Promise<CustomAssetsState> | null = null;

function notifyCustomAssetsUpdated(): void {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(CUSTOM_ASSETS_EVENT));
  }
}

function normalizeDataUrl(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Returns the current synchronous in-memory snapshot of custom user assets.
 */
export function getCachedCustomAssets(): CustomAssetsState {
  return { ...cachedAssets };
}

/**
 * Lazily hydrates all custom user assets from IndexedDB into memory.
 */
export function initCustomAssetsCache(): Promise<CustomAssetsState> {
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const [boardRaw, piecesRaw, soundRaw] = await Promise.all([
          idbGet<string | null>(CUSTOM_BOARD_IDB_KEY),
          idbGet<string | null>(CUSTOM_PIECES_IDB_KEY),
          idbGet<string | null>(CUSTOM_SOUND_IDB_KEY),
        ]);
        cachedAssets = {
          boardDataUrl: normalizeDataUrl(boardRaw),
          pieceSpriteDataUrl: normalizeDataUrl(piecesRaw),
          soundDataUrl: normalizeDataUrl(soundRaw),
        };
        notifyCustomAssetsUpdated();
      } catch {
        // Ignore IndexedDB unavailability
      }
      return getCachedCustomAssets();
    })();
  }
  return initPromise;
}

function applyAssetToCache(kind: CustomAssetKind, value: string | null): CustomAssetsState {
  cachedAssets = {
    boardDataUrl: kind === 'board' ? value : cachedAssets.boardDataUrl,
    pieceSpriteDataUrl: kind === 'pieces' ? value : cachedAssets.pieceSpriteDataUrl,
    soundDataUrl: kind === 'sound' ? value : cachedAssets.soundDataUrl,
  };
  notifyCustomAssetsUpdated();
  return getCachedCustomAssets();
}

/**
 * Saves a custom asset Data URL to IndexedDB and updates the in-memory cache.
 */
export async function saveCustomAsset(
  kind: CustomAssetKind,
  dataUrl: string
): Promise<CustomAssetsState> {
  const next = applyAssetToCache(kind, normalizeDataUrl(dataUrl));
  await idbSet<string | null>(KEY_BY_KIND[kind], dataUrl);
  return next;
}

/**
 * Clears a custom asset from IndexedDB and the in-memory cache.
 */
export async function clearCustomAsset(kind: CustomAssetKind): Promise<CustomAssetsState> {
  const next = applyAssetToCache(kind, null);
  await idbSet<string | null>(KEY_BY_KIND[kind], null);
  return next;
}

/**
 * Subscribes to custom asset updates and returns an unsubscribe cleanup function.
 */
export function subscribeCustomAssets(callback: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }
  const handler = () => callback();
  window.addEventListener(CUSTOM_ASSETS_EVENT, handler);
  return () => {
    window.removeEventListener(CUSTOM_ASSETS_EVENT, handler);
  };
}
