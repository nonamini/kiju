/**
 * Configuration, metadata, and dynamic registry for Shogi AI engines (#141, #142).
 * Built-in distribution includes only the license-clean Fairy-Stockfish Wasm engine.
 * Users can dynamically register additional USI-compliant engines via:
 *   1) Local USI executable (.exe) spawned natively or via Vite dev bridge (`local-exe`)
 *   2) Local NNUE/model binaries stored in IndexedDB (`custom-nnue`)
 *   3) External USI engines bridged over WebSocket (`websocket-usi`)
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict without any (Rule 2).
 */

import { getSafeStorage } from '../utils/matchHistoryStorage';
import type { EngineId } from './types';

export type { EngineId };

export type EngineTransportType =
  | 'builtin-wasm'
  | 'custom-nnue'
  | 'websocket-usi'
  | 'local-exe';

export interface EngineProfile {
  id: EngineId;
  /** Optional i18n key for built-in profiles. */
  nameKey?: string;
  /** Explicit display name for custom profiles (auto-detected from USI `id name` or user input). */
  displayName?: string;
  /** Optional i18n key for built-in description. */
  descriptionKey?: string;
  /** Explicit description for custom profiles. */
  description?: string;
  author: string;
  architecture: string;
  isDefault?: boolean;
  isBuiltin?: boolean;
  transportType: EngineTransportType;
  sizeBytes: number;
  sizeFormatted: string;
  /** Executable file path when transportType === 'local-exe'. */
  exePath?: string;
  /** WebSocket URL when transportType === 'websocket-usi' (e.g. ws://localhost:9000). */
  wsUrl?: string;
  /** IndexedDB record key when transportType === 'custom-nnue'. */
  customModelId?: string;
  fvScale?: number;
  createdAt?: string;
}

export const DEFAULT_ENGINE_ID: EngineId = 'fairy-stockfish';
export const CUSTOM_ENGINES_STORAGE_KEY = 'joseki_tree_custom_engines';

export const BUILTIN_FAIRY_STOCKFISH_PROFILE: EngineProfile = {
  id: 'fairy-stockfish',
  nameKey: 'engine.fairyStockfish.name',
  displayName: 'Fairy-Stockfish 14 Wasm',
  descriptionKey: 'engine.fairyStockfish.description',
  author: 'Fabian Fichter',
  architecture: 'Classical Handcrafted Wasm',
  isDefault: true,
  isBuiltin: true,
  transportType: 'builtin-wasm',
  sizeBytes: 1636293,
  sizeFormatted: '1.6 MB',
};

/**
 * Reactive record mirrored from built-in + custom profiles so callers inspecting
 * `Object.values(ENGINE_PROFILES)` stay synchronized.
 */
export const ENGINE_PROFILES: Record<string, EngineProfile> = {
  'fairy-stockfish': BUILTIN_FAIRY_STOCKFISH_PROFILE,
};

type RegistryListener = () => void;
const registryListeners = new Set<RegistryListener>();

function notifyRegistryChange(): void {
  for (const listener of registryListeners) {
    listener();
  }
}

/**
 * Formats a byte size into a compact human-readable label.
 */
export function formatEngineSizeBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'External';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isValidTransportType(value: unknown): value is EngineTransportType {
  return (
    value === 'builtin-wasm' ||
    value === 'custom-nnue' ||
    value === 'websocket-usi' ||
    value === 'local-exe'
  );
}

function sanitizeCustomProfile(raw: unknown): EngineProfile | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === 'string' ? obj.id.trim() : '';
  if (!id || id === DEFAULT_ENGINE_ID) return null;

  const transportType: EngineTransportType = isValidTransportType(obj.transportType)
    ? obj.transportType
    : typeof obj.exePath === 'string' && obj.exePath.trim().length > 0
    ? 'local-exe'
    : typeof obj.wsUrl === 'string' && obj.wsUrl.trim().length > 0
    ? 'websocket-usi'
    : 'custom-nnue';

  const sizeBytes =
    typeof obj.sizeBytes === 'number' && Number.isFinite(obj.sizeBytes) && obj.sizeBytes >= 0
      ? obj.sizeBytes
      : 0;

  return {
    id,
    displayName:
      typeof obj.displayName === 'string' && obj.displayName.trim().length > 0
        ? obj.displayName.trim()
        : id,
    description:
      typeof obj.description === 'string' && obj.description.trim().length > 0
        ? obj.description.trim()
        : undefined,
    author:
      typeof obj.author === 'string' && obj.author.trim().length > 0
        ? obj.author.trim()
        : 'Custom USI Engine',
    architecture:
      typeof obj.architecture === 'string' && obj.architecture.trim().length > 0
        ? obj.architecture.trim()
        : transportType === 'local-exe'
        ? 'Local USI Executable (.exe)'
        : transportType === 'websocket-usi'
        ? 'External USI (WebSocket)'
        : 'User NNUE Model',
    isBuiltin: false,
    transportType,
    sizeBytes,
    sizeFormatted:
      typeof obj.sizeFormatted === 'string' && obj.sizeFormatted.trim().length > 0
        ? obj.sizeFormatted.trim()
        : transportType === 'local-exe'
        ? 'Local .exe'
        : transportType === 'websocket-usi'
        ? 'WebSocket'
        : formatEngineSizeBytes(sizeBytes),
    exePath: typeof obj.exePath === 'string' ? obj.exePath.trim() : undefined,
    wsUrl: typeof obj.wsUrl === 'string' ? obj.wsUrl.trim() : undefined,
    customModelId: typeof obj.customModelId === 'string' ? obj.customModelId : undefined,
    fvScale: typeof obj.fvScale === 'number' ? obj.fvScale : undefined,
    createdAt: typeof obj.createdAt === 'string' ? obj.createdAt : undefined,
  };
}

function syncEngineProfilesRecord(customProfiles: EngineProfile[]): void {
  for (const key of Object.keys(ENGINE_PROFILES)) {
    if (key !== DEFAULT_ENGINE_ID) {
      delete ENGINE_PROFILES[key];
    }
  }
  ENGINE_PROFILES[DEFAULT_ENGINE_ID] = BUILTIN_FAIRY_STOCKFISH_PROFILE;
  for (const profile of customProfiles) {
    ENGINE_PROFILES[profile.id] = profile;
  }
}

/**
 * Loads user-registered custom engine profiles from storage.
 */
export function loadCustomEngineProfiles(): EngineProfile[] {
  try {
    const storage = getSafeStorage();
    const raw = storage.getItem(CUSTOM_ENGINES_STORAGE_KEY);
    if (!raw) {
      syncEngineProfilesRecord([]);
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      syncEngineProfilesRecord([]);
      return [];
    }
    const valid = parsed
      .map(sanitizeCustomProfile)
      .filter((p): p is EngineProfile => p !== null);
    syncEngineProfilesRecord(valid);
    return valid;
  } catch (err) {
    console.warn('[engineConfig] Failed to load custom engine profiles:', err);
    syncEngineProfilesRecord([]);
    return [];
  }
}

/**
 * Registers or updates a custom engine profile and notifies subscribers.
 */
export function saveCustomEngineProfile(profile: EngineProfile): EngineProfile[] {
  const sanitized = sanitizeCustomProfile({ ...profile, isBuiltin: false });
  if (!sanitized) {
    return loadCustomEngineProfiles();
  }
  const existing = loadCustomEngineProfiles().filter((p) => p.id !== sanitized.id);
  const next = [...existing, sanitized];
  try {
    const storage = getSafeStorage();
    storage.setItem(CUSTOM_ENGINES_STORAGE_KEY, JSON.stringify(next));
  } catch (err) {
    console.error('[engineConfig] Failed to persist custom engine profile:', err);
  }
  syncEngineProfilesRecord(next);
  notifyRegistryChange();
  return next;
}

/**
 * Removes a user-registered custom engine profile by id. Built-in profiles cannot be deleted.
 */
export function deleteCustomEngineProfile(id: string): EngineProfile[] {
  if (id === DEFAULT_ENGINE_ID) {
    return loadCustomEngineProfiles();
  }
  const next = loadCustomEngineProfiles().filter((p) => p.id !== id);
  try {
    const storage = getSafeStorage();
    storage.setItem(CUSTOM_ENGINES_STORAGE_KEY, JSON.stringify(next));
  } catch (err) {
    console.error('[engineConfig] Failed to delete custom engine profile:', err);
  }
  syncEngineProfilesRecord(next);
  notifyRegistryChange();
  return next;
}

/**
 * Returns all available engine profiles (built-in Fairy-Stockfish followed by user custom engines).
 */
export function getAllEngineProfiles(): EngineProfile[] {
  const custom = loadCustomEngineProfiles();
  return [BUILTIN_FAIRY_STOCKFISH_PROFILE, ...custom];
}

/**
 * Looks up an active engine profile by id across built-in and user custom profiles.
 */
export function getEngineProfile(engineId: string): EngineProfile | undefined {
  if (engineId === DEFAULT_ENGINE_ID) {
    return BUILTIN_FAIRY_STOCKFISH_PROFILE;
  }
  return loadCustomEngineProfiles().find((p) => p.id === engineId);
}

/**
 * Subscribes to custom engine registry add/update/delete events.
 */
export function subscribeEngineRegistryChange(listener: RegistryListener): () => void {
  registryListeners.add(listener);
  return () => {
    registryListeners.delete(listener);
  };
}

/**
 * Resolves a human-readable display name for either an EngineProfile or a stored engine ID.
 * Falls back gracefully for historical cloud/local engine IDs on older game records.
 */
export function resolveEngineDisplayName(
  profileOrId: EngineProfile | string | undefined,
  t?: (key: string) => string
): string {
  if (!profileOrId) {
    const fallback = t ? t('engine.fairyStockfish.name') : '';
    return fallback && fallback !== 'engine.fairyStockfish.name'
      ? fallback
      : 'Fairy-Stockfish 14 Wasm';
  }

  if (typeof profileOrId !== 'string') {
    if (profileOrId.displayName && !profileOrId.nameKey) {
      return profileOrId.displayName;
    }
    if (profileOrId.nameKey && t) {
      const translated = t(profileOrId.nameKey);
      if (translated && translated !== profileOrId.nameKey) {
        return translated;
      }
    }
    return profileOrId.displayName || profileOrId.id;
  }

  if (profileOrId === 'yaneuraou') {
    if (t) {
      const translated = t('studio.kifu_mgmt.cloud_engine_yaneuraou');
      if (translated && translated !== 'studio.kifu_mgmt.cloud_engine_yaneuraou') {
        return translated;
      }
    }
    return 'YaneuraOu (Cloud)';
  }

  const found = getEngineProfile(profileOrId);
  if (found) {
    return resolveEngineDisplayName(found, t);
  }

  // Legacy historical IDs that may exist in older saved KifuRecords
  if (profileOrId === 'tuyouraou11-mini') return 'TuyouraOu 11 mini';
  if (profileOrId === 'tuyouraou11-micro') return 'TuyouraOu 11 micro';

  return profileOrId;
}

/**
 * Resolves a human-readable description string for an EngineProfile.
 */
export function resolveEngineDescription(
  profile: EngineProfile,
  t?: (key: string) => string
): string {
  if (profile.description) return profile.description;
  if (profile.descriptionKey && t) {
    const translated = t(profile.descriptionKey);
    if (translated && translated !== profile.descriptionKey) {
      return translated;
    }
  }
  return profile.architecture;
}

/**
 * Probes an external USI WebSocket bridge URL by opening a WebSocket, sending `usi`,
 * and extracting `id name` and `id author` before `usiok`.
 */
export function probeWebSocketUsiEngine(
  wsUrl: string,
  timeoutMs = 4000
): Promise<{ name: string; author: string }> {
  const trimmed = wsUrl.trim();
  if (!trimmed.startsWith('ws://') && !trimmed.startsWith('wss://')) {
    return Promise.reject(new Error('WebSocket URL must start with ws:// or wss://'));
  }

  if (typeof WebSocket === 'undefined') {
    return Promise.reject(new Error('WebSocket is not supported in this environment'));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let detectedName = '';
    let detectedAuthor = '';
    let ws: WebSocket | null = null;

    const cleanup = () => {
      clearTimeout(timer);
      if (ws) {
        try {
          ws.onopen = null;
          ws.onmessage = null;
          ws.onerror = null;
          ws.onclose = null;
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close();
          }
        } catch {
          // Ignore close errors
        }
        ws = null;
      }
    };

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error('Timed out waiting for USI usiok response'));
      }
    }, timeoutMs);

    try {
      ws = new WebSocket(trimmed);
    } catch (err) {
      settled = true;
      clearTimeout(timer);
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    ws.onopen = () => {
      ws?.send('usi');
    };

    ws.onmessage = (event: MessageEvent) => {
      const raw = typeof event.data === 'string' ? event.data : String(event.data ?? '');
      const lines = raw.split(/\r?\n/);
      for (const line of lines) {
        const clean = line.trim();
        if (!clean) continue;
        if (clean.startsWith('id name ')) {
          detectedName = clean.slice('id name '.length).trim();
        } else if (clean.startsWith('id author ')) {
          detectedAuthor = clean.slice('id author '.length).trim();
        } else if (clean === 'usiok') {
          if (!settled) {
            settled = true;
            cleanup();
            resolve({
              name: detectedName || 'Custom USI Engine',
              author: detectedAuthor || 'Unknown Author',
            });
          }
          return;
        }
      }
    };

    ws.onerror = () => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error('Failed to connect to USI WebSocket bridge'));
      }
    };

    ws.onclose = () => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error('WebSocket closed before receiving usiok'));
      }
    };
  });
}

export interface ParsedEngineTagMetadata {
  displayName?: string;
  author?: string;
  architecture?: string;
  description?: string;
  homepage?: string;
  homepageLabel?: string;
  raw: Record<string, unknown>;
}

/**
 * Parses an engine evaluation tag.json string into normalized display/credit fields.
 * Supports both `"arch"` (common in Shogi eval packages) and `"architecture"`.
 */
export function parseEngineTagJson(jsonText: string): ParsedEngineTagMetadata {
  const parsed = JSON.parse(jsonText) as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Invalid tag.json: expected a JSON object');
  }
  const obj = parsed as Record<string, unknown>;
  const nonEmptyStr = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;

  return {
    displayName: nonEmptyStr(obj.name),
    author: nonEmptyStr(obj.author),
    architecture: nonEmptyStr(obj.arch) ?? nonEmptyStr(obj.architecture),
    description: nonEmptyStr(obj.description),
    homepage: nonEmptyStr(obj.homepage),
    homepageLabel: nonEmptyStr(obj['homepage-label']),
    raw: obj,
  };
}

/**
 * Parses an eval_options.txt string for engine evaluation scaling parameters (e.g. `FV_SCALE 24`).
 */
export function parseEvalOptionsTxt(text: string): { fvScale?: number } {
  const match = /FV_SCALE\s+(\d+)/i.exec(text);
  if (!match || !match[1]) return {};
  const val = Number.parseInt(match[1], 10);
  if (!Number.isFinite(val) || val <= 0) return {};
  return { fvScale: val };
}

// Initialize mirrored record from storage at module load
loadCustomEngineProfiles();
