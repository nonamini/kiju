/**
 * Session handoff helper for Studio -> Tree navigation (Issue #63, spec L1).
 * Stores the target gameId, ply, and SFEN in sessionStorage (with an
 * in-memory fallback for non-browser environments) when the user sends
 * a kifu/position from Studio to Tree mode.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

export const STUDIO_TO_TREE_HANDOFF_KEY = 'joseki_tree_handoff_to_tree';

export interface StudioToTreeHandoff {
  gameId: string;
  ply: number;
  sfen?: string;
  createdAt: string;
}

const memoryFallback = new Map<string, string>();

function readSessionValue(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return window.sessionStorage.getItem(key);
    }
  } catch {
    // Fall back to in-memory map
  }
  return memoryFallback.get(key) ?? null;
}

function writeSessionValue(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(key, value);
      return;
    }
  } catch {
    // Fall back to in-memory map
  }
  memoryFallback.set(key, value);
}

function removeSessionValue(key: string): void {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem(key);
      return;
    }
  } catch {
    // Fall back to in-memory map
  }
  memoryFallback.delete(key);
}

/**
 * Persists a Studio -> Tree handoff payload in sessionStorage.
 */
export function saveStudioToTreeHandoff(handoff: StudioToTreeHandoff): void {
  try {
    writeSessionValue(STUDIO_TO_TREE_HANDOFF_KEY, JSON.stringify(handoff));
  } catch (err) {
    console.warn('Failed to save Studio->Tree handoff:', err);
  }
}

/**
 * Reads and immediately clears the pending Studio -> Tree handoff payload.
 */
export function consumeStudioToTreeHandoff(): StudioToTreeHandoff | null {
  try {
    const raw = readSessionValue(STUDIO_TO_TREE_HANDOFF_KEY);
    if (!raw) return null;
    removeSessionValue(STUDIO_TO_TREE_HANDOFF_KEY);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const obj = parsed as Partial<StudioToTreeHandoff>;
    if (typeof obj.gameId !== 'string' || typeof obj.ply !== 'number') {
      return null;
    }
    return {
      gameId: obj.gameId,
      ply: obj.ply,
      sfen: typeof obj.sfen === 'string' ? obj.sfen : undefined,
      createdAt:
        typeof obj.createdAt === 'string'
          ? obj.createdAt
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
