/**
 * Player Profile Management and Kifu Name Matching Utility.
 * Supports:
 * 1. Normalized name extraction from raw header strings (stripping ranks, titles, spaces)
 * 2. Automatic matching against registered players (User, Pro, AI)
 * 3. Dynamic registration of newly discovered players from imported kifu
 * 4. LocalStorage persistence
 *
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strict TypeScript, zero any (Rule 2).
 */

import { PlayerCategory, ShogiPlayerProfile } from '../types/player';

export const PLAYERS_STORAGE_KEY = 'joseki_tree_players';

// In-memory fallback
const memoryStorage = new Map<string, string>();

export function clearPlayerStorageForTest(): void {
  memoryStorage.clear();
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(PLAYERS_STORAGE_KEY);
  }
}

function getStorage(): {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
} {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return {
    getItem: (key: string) => memoryStorage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memoryStorage.set(key, value);
    },
  };
}

export const DEFAULT_APP_USER_ID = 'user-main';

export const PROTECTED_PLAYER_IDS: ReadonlySet<string> = new Set([
  DEFAULT_APP_USER_ID,
  'ai-fairy-stockfish',
]);

export function isProtectedPlayerProfile(id: string): boolean {
  return PROTECTED_PLAYER_IDS.has(id);
}

export const INITIAL_DEFAULT_PLAYERS: ShogiPlayerProfile[] = [
  {
    id: DEFAULT_APP_USER_ID,
    name: 'あなた',
    category: 'user',
    title: 'メインユーザー',
    aliases: ['あなた', '自分', 'プレイヤー', 'プレイヤー1', 'プレイヤー2'],
    isOwner: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'ai-fairy-stockfish',
    name: 'Fairy-Stockfish 14',
    category: 'ai',
    title: 'Wasm NNUE',
    aliases: ['Fairy-Stockfish', 'Fairy-Stockfish 14', 'Fairy-Stockfish 14 Wasm', 'Stockfish'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

/**
 * Normalizes raw kifu player name string:
 * - Strips leading/trailing whitespaces and full-width spaces
 * - Strips internal spaces (e.g. "渡辺　明" or "渡辺 明" -> "渡辺明") so matching is space-agnostic
 * - Strips common titles, dan/kyu ranks, and rate ratings (R1234, etc.)
 * - Returns ONLY the pure person/CPU name for matching, plus any detected rank/title separated
 */
export function normalizePlayerName(rawName: string): { normalized: string; detectedTitle?: string } {
  if (!rawName) return { normalized: '' };

  let cleaned = rawName
    .replace(/[▲△☗☖]/g, '')
    .trim();

  // 1. Detect and strip rating suffixes like (R478), (R1500), R570, etc.
  const rateRegex = /\(?[RＲ]\d+\)?/i;
  const rateMatch = cleaned.match(rateRegex);
  const detectedRate = rateMatch ? rateMatch[0] : undefined;
  if (detectedRate) {
    cleaned = cleaned.replace(detectedRate, '').trim();
  }

  // 2. Pattern for traditional titles and dan/kyu ranks
  const titleRegex = /(竜王・名人|竜王|名人|王位|王座|棋王|王将|棋聖|叡王|永世名人|永世竜王|名誉十段|[一二三四五六七八九]段|[1-9]段|初段|[1-9]級|[一二三四五六七八九]級|女流[一二三四五六七八九]段|女流[1-9]段|女流初段|女流[1-9]級|アマ[一二三四五六七八九]段|アマ[1-9]段|アマ初段|アマ[1-9]級)/;

  const match = cleaned.match(titleRegex);
  const detectedTitle = match ? match[0] : (detectedRate || undefined);

  if (match) {
    // Remove the title from name
    cleaned = cleaned.replace(match[0], '').trim();
  }

  // Remove trailing parentheses or brackets
  cleaned = cleaned.replace(/[()（）]/g, '').trim();

  // Remove ALL spaces within names (e.g. "渡辺　明" -> "渡辺明", "羽生 善治" -> "羽生善治")
  cleaned = cleaned.replace(/[\s\u3000]+/g, '');

  return {
    normalized: cleaned || rawName.trim(),
    detectedTitle,
  };
}

/**
 * Loads all player profiles from localStorage.
 */
export function loadPlayerProfiles(): ShogiPlayerProfile[] {
  try {
    const storage = getStorage();
    const raw = storage.getItem(PLAYERS_STORAGE_KEY);
    if (!raw) {
      // Initialize with default
      savePlayerProfiles(INITIAL_DEFAULT_PLAYERS);
      return [...INITIAL_DEFAULT_PLAYERS];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [...INITIAL_DEFAULT_PLAYERS];
    }
    return parsed as ShogiPlayerProfile[];
  } catch (err) {
    console.error('Failed to load player profiles:', err);
    return [...INITIAL_DEFAULT_PLAYERS];
  }
}

/**
 * Saves player profiles list to localStorage.
 */
export function savePlayerProfiles(profiles: ShogiPlayerProfile[]): void {
  try {
    const storage = getStorage();
    storage.setItem(PLAYERS_STORAGE_KEY, JSON.stringify(profiles));
  } catch (err) {
    console.error('Failed to save player profiles:', err);
  }
}

/**
 * Upserts a single player profile.
 */
export function upsertPlayerProfile(profile: ShogiPlayerProfile): ShogiPlayerProfile[] {
  const current = loadPlayerProfiles();
  const idx = current.findIndex((p) => p.id === profile.id);
  const now = new Date().toISOString();

  if (idx >= 0) {
    current[idx] = { ...profile, updatedAt: now };
  } else {
    current.push({
      ...profile,
      createdAt: profile.createdAt || now,
      updatedAt: now,
    });
  }
  savePlayerProfiles(current);
  return current;
}

/**
 * Deletes a player profile by ID (cannot delete user-main).
 */
export function deletePlayerProfile(id: string): ShogiPlayerProfile[] {
  if (isProtectedPlayerProfile(id)) return loadPlayerProfiles();
  const current = loadPlayerProfiles().filter((p) => p.id !== id);
  savePlayerProfiles(current);
  return current;
}

/**
 * Finds or matches a player profile from a raw name string.
 * Compares against normalized name, profile name, and aliases.
 */
export function matchPlayerProfile(
  rawName: string,
  players: ShogiPlayerProfile[]
): ShogiPlayerProfile | null {
  if (!rawName || !rawName.trim()) return null;
  const { normalized } = normalizePlayerName(rawName);
  const cleanRaw = rawName.replace(/[\s\u3000]+/g, '').toLowerCase();
  const cleanNorm = normalized.replace(/[\s\u3000]+/g, '').toLowerCase();

  for (const player of players) {
    const pName = player.name.replace(/[\s\u3000]+/g, '').toLowerCase();
    if (pName === cleanNorm || pName === cleanRaw) {
      return player;
    }
    if (player.aliases && player.aliases.length > 0) {
      for (const alias of player.aliases) {
        const aClean = alias.replace(/[\s\u3000]+/g, '').toLowerCase();
        if (aClean === cleanNorm || aClean === cleanRaw) {
          return player;
        }
      }
    }
  }

  // Secondary check: partial substring containment if normalized name is >= 3 characters (e.g. "藤井聡太")
  if (cleanNorm.length >= 3) {
    for (const player of players) {
      const pName = player.name.replace(/[\s\u3000]+/g, '').toLowerCase();
      if (pName.includes(cleanNorm) || cleanNorm.includes(pName)) {
        return player;
      }
    }
  }

  return null;
}

/**
 * Checks whether a raw name matches an existing player, using ONLY the normalized name.
 * Does not create or upsert anything.
 */
export function findMatchingPlayer(
  rawName: string,
  players?: ShogiPlayerProfile[]
): { profile: ShogiPlayerProfile | null; normalizedName: string; detectedTitle?: string } {
  const all = players || loadPlayerProfiles();
  const { normalized, detectedTitle } = normalizePlayerName(rawName);
  if (!normalized) return { profile: null, normalizedName: '', detectedTitle };

  const matched = matchPlayerProfile(normalized, all);
  return { profile: matched, normalizedName: normalized, detectedTitle };
}

/**
 * Automatically creates or registers a new player profile with given category.
 */
export function registerNewPlayer(params: {
  name: string;
  category: 'user' | 'ai' | 'pro';
  title?: string;
  note?: string;
  rawAlias?: string;
}): ShogiPlayerProfile {
  const newId = `player-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const aliases: string[] = [];
  if (params.rawAlias && params.rawAlias !== params.name) {
    aliases.push(params.rawAlias.trim());
  }

  const profile: ShogiPlayerProfile = {
    id: newId,
    name: params.name.trim(),
    category: params.category,
    title: params.title?.trim() || undefined,
    note: params.note?.trim() || undefined,
    aliases,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  upsertPlayerProfile(profile);
  return profile;
}

const AI_PLAYER_NAME_PATTERNS: readonly RegExp[] = [
  /^lv\.?\s*\d+/i,
  /ひよこ/,
  /ピヨ|ぴよ|piyo/i,
  /stockfish/i,
  /やねうら王|yaneuraou/i,
  /水匠|suisho/i,
  /つようら王|tuyouraou/i,
  /\belmo\b/i,
  /技巧/,
  /apery/i,
  /kristall/i,
  /\b(cpu|bot)\b/i,
];

/**
 * Infers `'ai'` when a player name matches known engine / PiyoShogi CPU patterns.
 */
export function inferPlayerCategoryFromName(
  rawName: string,
  fallback: PlayerCategory = 'pro'
): PlayerCategory {
  const trimmed = rawName.trim();
  if (!trimmed) return fallback;
  if (AI_PLAYER_NAME_PATTERNS.some((re) => re.test(trimmed))) {
    return 'ai';
  }
  return fallback;
}

const GENERIC_PLACEHOLDER_NAMES = new Set([
  '先手',
  '後手',
  '下手',
  '上手',
  '不明',
  'sente',
  'gote',
  'black',
  'white',
  'unknown',
]);

/**
 * Checks whether a raw player name is a generic side placeholder (e.g. "先手", "後手")
 * that must never be registered into the Player Encyclopedia or classified as a pro player.
 */
export function isGenericPlaceholderPlayerName(rawName?: string): boolean {
  if (!rawName) return true;
  const cleaned = rawName.replace(/[▲△☗☖()\s\u3000]+/g, '').toLowerCase();
  if (!cleaned) return true;
  return GENERIC_PLACEHOLDER_NAMES.has(cleaned);
}

/**
 * Purges any bogus generic placeholder profiles (e.g. "先手", "後手") from Player Encyclopedia.
 */
export function purgeGenericPlaceholderPlayers(): number {
  const current = loadPlayerProfiles();
  const filtered = current.filter(
    (p) =>
      p.isOwner ||
      p.category === 'user' ||
      p.category === 'ai' ||
      !isGenericPlaceholderPlayerName(p.name)
  );
  const removed = current.length - filtered.length;
  if (removed > 0) {
    savePlayerProfiles(filtered);
  }
  return removed;
}

/**
 * Automatically identifies or creates a player profile from an imported kifu header string.
 * If matched with an existing profile, updates its aliases and title if new.
 */
export function resolveOrRegisterPlayer(
  rawName: string,
  categoryHint: 'pro' | 'user' | 'ai' = 'pro'
): { profile: ShogiPlayerProfile; isNewlyCreated: boolean } {
  if (isGenericPlaceholderPlayerName(rawName)) {
    const cleanFallback = rawName?.trim() || '先手';
    return {
      profile: {
        id: '',
        name: cleanFallback,
        category: categoryHint,
        createdAt: '',
        updatedAt: '',
      },
      isNewlyCreated: false,
    };
  }

  const players = loadPlayerProfiles();
  const { normalized, detectedTitle } = normalizePlayerName(rawName);
  const existing = matchPlayerProfile(normalized || rawName, players);

  if (existing) {
    const trimmedRaw = rawName.trim();
    let updated = false;
    let nextAliases = existing.aliases || [];
    if (!nextAliases.includes(trimmedRaw) && trimmedRaw !== existing.name) {
      nextAliases = [...nextAliases, trimmedRaw];
      updated = true;
    }
    let nextTitle = existing.title;
    if (detectedTitle && (!existing.title || existing.title.length < detectedTitle.length)) {
      nextTitle = detectedTitle;
      updated = true;
    }
    if (updated) {
      const updatedProfile: ShogiPlayerProfile = {
        ...existing,
        aliases: nextAliases,
        title: nextTitle,
        updatedAt: new Date().toISOString(),
      };
      upsertPlayerProfile(updatedProfile);
      return { profile: updatedProfile, isNewlyCreated: false };
    }
    return { profile: existing, isNewlyCreated: false };
  }

  // Not found: dynamically register
  const finalName = normalized || rawName.trim();
  const resolvedCategory =
    categoryHint === 'pro'
      ? inferPlayerCategoryFromName(rawName, categoryHint)
      : categoryHint;
  const created = registerNewPlayer({
    name: finalName,
    category: resolvedCategory,
    title: detectedTitle,
    rawAlias: rawName,
  });

  return { profile: created, isNewlyCreated: true };
}
