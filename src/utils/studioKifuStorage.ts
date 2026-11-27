/**
 * Saved Kifu Game Record for Studio Library.
 * Follows Rule 1: strictly English code, comments, and identifiers.
 * Follows Rule 2: strict TypeScript, zero any.
 */

import { MoveEvaluation } from '../types/shogi';
import type { KifuGameKind } from '../types/kifuRecord';
import { KifuOpeningMove } from '../types/kifuRecord';
import { Formats, ForkPointer } from 'json-kifu-format';
import { getSafeStorage } from './matchHistoryStorage';
import { loadKifuRecords, markKifuRecordDeleted, saveKifuRecords, updateKifuRecord } from './kifuRecordStorage';
import { deleteCachedKifuPayload } from './kifuPayloadCache';
import {
  kifuRecordToStudioGame,
  studioGameToKifuRecord,
} from './kifuRecordCodec';
import { isGenericPlaceholderPlayerName } from './playerStorage';

export interface SavedStudioGame {
  id: string; // Unique UUID
  title: string; // e.g. "藤井聡太 vs 伊藤匠 (竜王戦第1局)"
  senteName: string; // Black player
  goteName: string; // White player
  sentePlayerId?: string; // Associated ShogiPlayerProfile.id
  gotePlayerId?: string; // Associated ShogiPlayerProfile.id
  winner?: 'sente' | 'gote' | 'draw' | 'unknown'; // Match result if detected
  gameKind?: KifuGameKind; // Classification: pro / self / other (Issue #73)
  openingId: string; // e.g. "aigakari", "kakugawari", "other"
  openingName: string; // e.g. "相掛かり"
  totalPlies: number; // Plies count
  forkCount: number; // Number of branch points
  rawKif?: string; // Optional raw KIF if imported from KIF
  jkfJson: string; // JSON string of Formats.JSONKifuFormat (serializable tree)
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  matchDate?: string; // e.g. "2026/11/05" or "2026-11-05"
  tournament?: string; // Tournament name e.g. "王位戦", "竜王戦"
  tags?: string[]; // e.g. ["プロ棋譜", "詰み研究", "愛用定跡"]
  evaluations?: Record<number, MoveEvaluation>; // Saved AI evaluation per ply
  analysisEngineId?: string; // e.g. 'fairy-stockfish'
  analysisDepth?: number; // e.g. 10, 12
  analysisStatus?: 'unanalyzed' | 'analyzing' | 'completed';
  analyzedPliesCount?: number;
  activeForkPointers?: ForkPointer[]; // Remember last selected branch path
  openingLine?: KifuOpeningMove[]; // Pre-extracted mainline opening moves for tree visualizer
}

export const STUDIO_GAMES_STORAGE_KEY = 'joseki_tree_studio_saved_games';
export const STUDIO_GAMES_LEGACY_KEY = 'joseki_tree_studio_games';
export const STUDIO_LAST_SESSION_KEY = 'joseki_tree_last_session';
export const STUDIO_DRAFT_KEY = 'joseki_tree_studio_draft_backup';
export const RECENTLY_OPENED_GAMES_KEY = 'joseki_tree_recently_opened_games_v1';

export interface RecentlyOpenedGameEntry {
  id: string;
  openedAt: string; // ISO 8601
}

export function loadRecentlyOpenedGames(): RecentlyOpenedGameEntry[] {
  try {
    const raw = getSafeStorage().getItem(RECENTLY_OPENED_GAMES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is RecentlyOpenedGameEntry =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as RecentlyOpenedGameEntry).id === 'string' &&
        typeof (item as RecentlyOpenedGameEntry).openedAt === 'string'
    );
  } catch {
    return [];
  }
}

export function recordRecentlyOpenedGame(gameId: string): void {
  if (!gameId) return;
  try {
    const existing = loadRecentlyOpenedGames().filter((item) => item.id !== gameId);
    const updated: RecentlyOpenedGameEntry[] = [
      { id: gameId, openedAt: new Date().toISOString() },
      ...existing,
    ].slice(0, 20);
    getSafeStorage().setItem(RECENTLY_OPENED_GAMES_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage errors
  }
}

export interface StudioDraftBackup {
  jkfJson: string;
  currentPly: number;
  totalPlies: number;
  updatedAt: string; // ISO 8601
  title?: string;
  gameId?: string | null;
  activeForkPointers?: ForkPointer[];
  evaluations?: Record<number, MoveEvaluation>;
}

export interface StudioLastSession {
  gameId?: string | null;
  gameTitle: string;
  currentPly: number;
  totalPlies: number;
  activeMode: 'STUDY' | 'SHOGI_TRACE' | 'AI_MATCH' | 'QUIZ' | 'TSUMEGO' | 'RESIGN_MATE';
  senteName?: string;
  goteName?: string;
  updatedAt: string; // ISO 8601
}

/**
 * Saves current active studio session state for quick resume.
 */
export function saveLastStudioSession(session: StudioLastSession): void {
  try {
    const storage = getStorage();
    storage.setItem(STUDIO_LAST_SESSION_KEY, JSON.stringify(session));
  } catch (err) {
    console.warn('Failed to save last studio session:', err);
  }
}

/**
 * Loads last active studio session state if available.
 */
export function loadLastStudioSession(): StudioLastSession | null {
  try {
    const storage = getStorage();
    const raw = storage.getItem(STUDIO_LAST_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StudioLastSession;
  } catch (err) {
    console.warn('Failed to load last studio session:', err);
    return null;
  }
}

/**
 * Clears last studio session state.
 */
export function clearLastStudioSession(): void {
  try {
    const storage = getStorage();
    storage.removeItem(STUDIO_LAST_SESSION_KEY);
  } catch (err) {
    // ignore
  }
}

/**
 * Saves full studio draft board & tree state into local backup storage.
 */
export function saveStudioDraft(draft: StudioDraftBackup): void {
  try {
    const storage = getStorage();
    storage.setItem(STUDIO_DRAFT_KEY, JSON.stringify(draft));
  } catch (err) {
    console.warn('Failed to save studio draft backup:', err);
  }
}

/**
 * Loads full studio draft board & tree state from local backup storage if available.
 */
export function loadStudioDraft(): StudioDraftBackup | null {
  try {
    const storage = getStorage();
    const raw = storage.getItem(STUDIO_DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StudioDraftBackup;
  } catch (err) {
    console.warn('Failed to load studio draft backup:', err);
    return null;
  }
}

/**
 * Clears studio draft backup from storage.
 */
export function clearStudioDraft(): void {
  try {
    const storage = getStorage();
    storage.removeItem(STUDIO_DRAFT_KEY);
  } catch (err) {
    // ignore
  }
}


import {
  createTagDefinition,
  loadTagRegistry,
} from './tagRegistryStorage';
import { STRUCTURED_TAG_GROUPS, TagCategoryGroup } from '../types/tagRegistry';
export { STRUCTURED_TAG_GROUPS };
export type { TagCategoryGroup };

export const CUSTOM_TAG_GROUPS_KEY = 'joseki_tree_custom_tag_groups';

/**
 * Loads structured tag groups merged with TagRegistry and user-defined custom tags.
 */
export function loadStructuredTagGroups(): TagCategoryGroup[] {
  try {
    const registry = loadTagRegistry();
    const storage = getStorage();
    const raw = storage.getItem(CUSTOM_TAG_GROUPS_KEY);
    const customMap: Record<string, string[]> = raw ? JSON.parse(raw) : {};

    return STRUCTURED_TAG_GROUPS.map((group) => {
      const regTags = registry
        .filter((def) => def.groupId === group.id)
        .map((def) => def.name);
      const added = customMap[group.id] || [];
      const combined = Array.from(new Set([...group.tags, ...regTags, ...added]));
      return {
        ...group,
        tags: combined,
      };
    });
  } catch (err) {
    console.error('Failed to load structured tag groups:', err);
    return STRUCTURED_TAG_GROUPS;
  }
}

/**
 * Adds a new custom tag into a specific structured category and TagRegistry.
 */
export function addCustomTagToCategory(
  categoryId: TagCategoryGroup['id'],
  newTag: string
): TagCategoryGroup[] {
  try {
    const trimmed = newTag.trim();
    if (!trimmed) return loadStructuredTagGroups();

    createTagDefinition(trimmed, categoryId);

    const storage = getStorage();
    const raw = storage.getItem(CUSTOM_TAG_GROUPS_KEY);
    const customMap: Record<string, string[]> = raw ? JSON.parse(raw) : {};

    const list = customMap[categoryId] || [];
    if (!list.includes(trimmed)) {
      customMap[categoryId] = [...list, trimmed];
      storage.setItem(CUSTOM_TAG_GROUPS_KEY, JSON.stringify(customMap));
    }

    return loadStructuredTagGroups();
  } catch (err) {
    console.error('Failed to add custom tag to category:', err);
    return loadStructuredTagGroups();
  }
}

export const DEFAULT_PRESET_TAGS = STRUCTURED_TAG_GROUPS.flatMap((g) => g.tags);

function getStorage(): ReturnType<typeof getSafeStorage> {
  return getSafeStorage();
}

/**
 * Loads all saved studio games (Issue #42d).
 * The persistence backend is now the unified KifuRecord store; records with
 * source === 'studio' are projected back into the SavedStudioGame view.
 * Sorted by createdAt descending to match the previous newest-first order.
 */
export function loadSavedStudioGames(): SavedStudioGame[] {
  try {
    return loadKifuRecords()
      .filter((r) => r.source === 'studio')
      .map(kifuRecordToStudioGame)
      .sort((a, b) => {
        const byCreated = (b.createdAt || '').localeCompare(a.createdAt || '');
        if (byCreated !== 0) return byCreated;
        return (b.updatedAt || '').localeCompare(a.updatedAt || '');
      });
  } catch (err) {
    console.error('Failed to load saved studio games:', err);
    return [];
  }
}

/**
 * Persists the full studio games view into KifuRecord storage.
 * Replaces only source === 'studio' records and preserves all other sources.
 * KifuRecord-only fields (notes, favorite, reviewStatus, isIncludedInTree,
 * cloud claim fields) are preserved via the existing record as codec base.
 */
function persistStudioGames(games: SavedStudioGame[]): void {
  const existing = loadKifuRecords();
  const byId = new Map(existing.map((r) => [r.id, r]));

  const converted = games.map((g) => studioGameToKifuRecord(g, byId.get(g.id)));
  const convertedIds = new Set(converted.map((r) => r.id));
  const kept = existing.filter(
    (r) => r.source !== 'studio' && !convertedIds.has(r.id)
  );
  saveKifuRecords([...kept, ...converted]);
}

/**
 * Reads the legacy studio-games keys directly (current + legacy key,
 * primary wins on id collision). Used ONLY by the one-time migration;
 * loadSavedStudioGames() is now backed by KifuRecord storage (#42d).
 */
export function loadLegacyStudioGamesRaw(): SavedStudioGame[] {
  try {
    const storage = getStorage();
    const raw = storage.getItem(STUDIO_GAMES_STORAGE_KEY);
    const legacyRaw = storage.getItem(STUDIO_GAMES_LEGACY_KEY);

    const primaryList: SavedStudioGame[] = raw ? JSON.parse(raw) : [];
    const legacyList: SavedStudioGame[] = legacyRaw ? JSON.parse(legacyRaw) : [];

    const gameMap = new Map<string, SavedStudioGame>();
    legacyList.forEach((g) => {
      if (g && g.id) gameMap.set(g.id, g);
    });
    primaryList.forEach((g) => {
      if (g && g.id) gameMap.set(g.id, g);
    });

    return Array.from(gameMap.values());
  } catch (err) {
    console.error('Failed to load legacy studio games:', err);
    return [];
  }
}

/**
 * Gets all unique tags across all saved games plus presets.
 */
export function getAllUniqueTags(): string[] {
  const games = loadSavedStudioGames();
  const set = new Set<string>(DEFAULT_PRESET_TAGS);
  games.forEach((g) => {
    if (g.tags) {
      g.tags.forEach((t) => {
        if (t.trim()) set.add(t.trim());
      });
    }
  });
  return Array.from(set);
}

/**
 * Auto-generates an authentic, structured title from game metadata.
 */
export function generateGameTitle(meta: {
  senteName?: string;
  goteName?: string;
  tournament?: string;
  openingName?: string;
  date?: string;
}): string {
  const sente = meta.senteName?.trim() || '先手';
  const gote = meta.goteName?.trim() || '後手';
  const matchPart = `${sente} vs ${gote}`;
  
  const extras: string[] = [];
  if (meta.tournament?.trim()) extras.push(meta.tournament.trim());
  if (meta.openingName?.trim()) extras.push(meta.openingName.trim());
  if (meta.date?.trim()) extras.push(meta.date.trim());

  if (extras.length > 0) {
    return `${matchPart} (${extras.join(' · ')})`;
  }
  return matchPart;
}

/**
 * Saves or updates a studio game record in localStorage.
 */
export function saveStudioGame(game: SavedStudioGame): void {
  try {
    const games = loadSavedStudioGames();
    const existingIdx = games.findIndex((g) => g.id === game.id);
    if (existingIdx >= 0) {
      games[existingIdx] = { ...game, updatedAt: new Date().toISOString() };
    } else {
      games.unshift({
        ...game,
        createdAt: game.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    persistStudioGames(games);
  } catch (err) {
    console.error('Failed to save studio game:', err);
  }
}

/**
 * Updates AI evaluations and analysis metadata for a specific studio game record.
 */
export function updateStudioGameEvaluations(
  gameId: string,
  evaluations: Record<number, MoveEvaluation>,
  meta?: {
    engineId?: string;
    depth?: number;
    status?: 'unanalyzed' | 'analyzing' | 'completed';
  }
): void {
  try {
    const games = loadSavedStudioGames();
    const existingIdx = games.findIndex((g) => g.id === gameId);
    if (existingIdx >= 0) {
      const existingGame = games[existingIdx];
      if (!existingGame) return;

      const mergedEvals = {
        ...(existingGame.evaluations || {}),
        ...evaluations,
      };

      const evalKeys = Object.keys(mergedEvals);
      // In Shogi, moves exist from ply 0 (initial position) to ply totalPlies (totalPlies + 1 positions),
      // or at minimum totalPlies plies.
      const isComplete = existingGame.totalPlies > 0 && evalKeys.length >= existingGame.totalPlies;

      games[existingIdx] = {
        ...existingGame,
        evaluations: mergedEvals,
        analyzedPliesCount: evalKeys.length,
        analysisEngineId: meta?.engineId ?? existingGame.analysisEngineId,
        analysisDepth: meta?.depth ?? existingGame.analysisDepth,
        analysisStatus: meta?.status ?? (isComplete ? 'completed' : 'analyzing'),
        updatedAt: new Date().toISOString(),
      };
      persistStudioGames(games);
    }
  } catch (err) {
    console.error('Failed to update studio game evaluations:', err);
  }
}

/**
 * Updates tags for an existing studio game record and syncs to KifuRecords if present.
 */
export function updateStudioGameTags(gameId: string, tags: string[]): SavedStudioGame | null {
  try {
    const games = loadSavedStudioGames();
    const existingIdx = games.findIndex((g) => g.id === gameId);
    if (existingIdx < 0) return null;
    const existing = games[existingIdx];
    if (!existing) return null;

    const updated: SavedStudioGame = {
      ...existing,
      tags: [...tags],
      updatedAt: new Date().toISOString(),
    };
    games[existingIdx] = updated;
    persistStudioGames(games);

    // Also update KifuRecord if present
    updateKifuRecord(gameId, { tags });

    return updated;
  } catch (err) {
    console.error('Failed to update studio game tags:', err);
    return null;
  }
}

/**
 * Deletes a studio game from localStorage by ID.
 */
export function deleteStudioGame(id: string): void {
  try {
    const games = loadSavedStudioGames().filter((g) => g.id !== id);
    persistStudioGames(games);
    markKifuRecordDeleted(id);
    void deleteCachedKifuPayload(id);
  } catch (err) {
    console.error('Failed to delete studio game:', err);
  }
}

/**
 * Inspects a JKF (JSONKifuFormat) structure or raw KIF string to determine the game winner.
 * Detects resignations, checkmates, impasse, repetitions, fouls, and header results.
 */
export function detectGameWinner(
  kifuData?: { header?: Record<string, string>; moves?: Array<{ special?: string; move?: { color?: number } }> } | null,
  rawKif?: string
): 'sente' | 'gote' | 'draw' | 'unknown' {
  if (!kifuData && !rawKif) return 'unknown';

  const header = kifuData?.header || {};

  // 1. Check direct header outcome keywords
  const resultHeader = header['結果'] || header['勝敗'] || header['対局結果'] || '';
  if (resultHeader) {
    if (resultHeader.includes('先手勝') || resultHeader.includes('先手の勝ち') || resultHeader.includes('☗勝')) {
      return 'sente';
    }
    if (resultHeader.includes('後手勝') || resultHeader.includes('後手の勝ち') || resultHeader.includes('☖勝')) {
      return 'gote';
    }
    if (resultHeader.includes('千日手') || resultHeader.includes('持将棋') || resultHeader.includes('引き分け')) {
      return 'draw';
    }
  }

  // 2. Inspect raw KIF lines if available
  if (rawKif) {
    if (rawKif.includes('先手の勝ち') || rawKif.includes('先手勝ち') || rawKif.includes('先手の反則勝ち')) {
      return 'sente';
    }
    if (rawKif.includes('後手の勝ち') || rawKif.includes('後手勝ち') || rawKif.includes('後手の反則勝ち')) {
      return 'gote';
    }
    if (rawKif.includes('千日手') || rawKif.includes('持将棋') || rawKif.includes('引き分け')) {
      return 'draw';
    }
  }

  // 3. Inspect moves array in JKF
  if (kifuData && Array.isArray(kifuData.moves) && kifuData.moves.length > 0) {
    const moves = kifuData.moves;
    const lastMoveItem = moves[moves.length - 1];

    if (lastMoveItem?.special) {
      const special = lastMoveItem.special;

      if (special === 'SENNICHITE' || special === 'JISHOGI' || special === 'HIKIWAKE' || special === 'CHUDAN') {
        return 'draw';
      }

      // Calculate the move index (ply number) of the special event
      // moves[0] is initial board comments/state, ply 1 is moves[1]
      const specialPly = moves.length - 1;
      // If specialPly is odd (1, 3, 5...), it was Black's (Sente) turn to move.
      // If specialPly is even (2, 4, 6...), it was White's (Gote) turn to move.
      const isSenteTurn = specialPly % 2 === 1;

      if (special === 'TORYO' || special === 'TIME_UP' || special === 'ILLEGAL_MOVE') {
        // Resignation, timeout, or foul: The side whose turn it was lost, so the opponent won.
        return isSenteTurn ? 'gote' : 'sente';
      }

      if (special === '+ILLEGAL_ACTION') {
        // Black made an illegal action -> Gote wins
        return 'gote';
      }
      if (special === '-ILLEGAL_ACTION') {
        // White made an illegal action -> Sente wins
        return 'sente';
      }

      if (special === 'TSUMI' || special === 'KACHI') {
        // TSUMI: The side that made the last physical move delivered mate.
        // If specialPly is odd, the resignation/mate was called on Sente's turn (after Gote moved at ply - 1)
        // or Sente declared win. So the delivering side is opponent of current turn.
        return isSenteTurn ? 'gote' : 'sente';
      }
    }
  }

  return 'unknown';
}

/**
 * Calculates the total number of playable moves across the tree and the maximum path length.
 * Finds all branch leaf endpoints with their ForkPointer paths.
 */
export function getTreeBranchStats(moves: Formats.MoveFormat[]): {
  longestStreamPlies: number;
  longestStreamForkPointers: ForkPointer[];
  totalUniqueNodes: number;
} {
  let longestPlies = Math.max(0, moves.length - 1);
  let bestPointers: ForkPointer[] = [];
  let totalNodes = moves.length;

  function traverseStream(
    stream: Formats.MoveFormat[],
    basePly: number,
    currentPointers: ForkPointer[],
    isRoot: boolean
  ) {
    const streamMoveCount = isRoot ? Math.max(0, stream.length - 1) : stream.length;
    const reachPly = basePly + streamMoveCount;
    if (reachPly > longestPlies) {
      longestPlies = reachPly;
      bestPointers = [...currentPointers];
    }

    const startIndex = isRoot ? 1 : 0;
    for (let idx = startIndex; idx < stream.length; idx++) {
      const item = stream[idx];
      const movePly = isRoot ? basePly + idx : basePly + idx + 1;

      if (item && item.forks && item.forks.length > 0) {
        for (let fIdx = 0; fIdx < item.forks.length; fIdx++) {
          const forkStream = item.forks[fIdx];
          if (!forkStream || forkStream.length === 0) continue;
          totalNodes += forkStream.length;
          // In JKF: fork replaces the move at movePly.
          // Therefore, the position BEFORE the fork is movePly - 1.
          const nextPointers = [...currentPointers, { te: movePly, forkIndex: fIdx }];
          traverseStream(forkStream, movePly - 1, nextPointers, false);
        }
      }
    }
  }

  traverseStream(moves, 0, [], true);

  return {
    longestStreamPlies: longestPlies,
    longestStreamForkPointers: bestPointers,
    totalUniqueNodes: totalNodes,
  };
}

/**
 * Migration helper: Scans all existing saved games,
 * detects missing winners, and backfills `sentePlayerId` and `gotePlayerId`.
 */
export function migrateExistingGamesPlayers(
  resolvePlayerFn: (name: string, defaultCategory: 'pro' | 'ai' | 'user') => { id: string; name: string }
): SavedStudioGame[] {
  try {
    const games = loadSavedStudioGames();
    let hasChanges = false;

    const updatedGames = games.map((game) => {
      let changed = false;
      let sId = game.sentePlayerId;
      let gId = game.gotePlayerId;
      let winner = game.winner;

      // Determine category hint from game title or player name
      const getCategoryHint = (name: string): 'pro' | 'ai' | 'user' => {
        const lower = name.toLowerCase();
        if (lower.includes('ピヨ') || lower.includes('stockfish') || lower.includes('ai') || lower.includes('cpu')) {
          return 'ai';
        }
        if (lower.includes('あなた') || lower.includes('自分') || lower.includes('プレイヤー')) {
          return 'user';
        }
        return 'pro';
      };

      const skipPlayerResolution =
        game.gameKind === 'other' || game.id.startsWith('tactic_');

      if (!skipPlayerResolution && !sId && game.senteName && !isGenericPlaceholderPlayerName(game.senteName)) {
        const cat = getCategoryHint(game.senteName);
        const resolved = resolvePlayerFn(game.senteName, cat);
        if (resolved.id) {
          sId = resolved.id;
          changed = true;
        }
      }

      if (!skipPlayerResolution && !gId && game.goteName && !isGenericPlaceholderPlayerName(game.goteName)) {
        const cat = getCategoryHint(game.goteName);
        const resolved = resolvePlayerFn(game.goteName, cat);
        if (resolved.id) {
          gId = resolved.id;
          changed = true;
        }
      }

      // Backfill missing winner
      if (!winner || winner === 'unknown') {
        let parsedJkf: { header?: Record<string, string>; moves?: Array<{ special?: string; move?: { color?: number } }> } | undefined;
        try {
          if (game.jkfJson) {
            parsedJkf = JSON.parse(game.jkfJson);
          }
        } catch {
          // ignore
        }
        const detected = detectGameWinner(parsedJkf, game.rawKif);
        if (detected !== 'unknown') {
          winner = detected;
          changed = true;
        }
      }

      // Check if analysis status should be 'completed' when evaluations cover the game
      let analysisStatus = game.analysisStatus;
      let totalPlies = game.totalPlies;
      if (game.jkfJson) {
        try {
          const parsed = JSON.parse(game.jkfJson);
          if (parsed.moves) {
            const stats = getTreeBranchStats(parsed.moves);
            if (stats.longestStreamPlies > 0 && stats.longestStreamPlies !== totalPlies) {
              totalPlies = stats.longestStreamPlies;
              changed = true;
            }
          }
        } catch {
          // ignore
        }
      }

      if (game.evaluations) {
        const evalCount = Object.keys(game.evaluations).length;
        if (evalCount >= totalPlies && totalPlies > 0 && analysisStatus !== 'completed') {
          analysisStatus = 'completed';
          changed = true;
        }
      }

      if (changed) {
        hasChanges = true;
        return {
          ...game,
          sentePlayerId: sId,
          gotePlayerId: gId,
          winner,
          totalPlies,
          analysisStatus,
        };
      }
      return game;
    });

    if (hasChanges) {
      persistStudioGames(updatedGames);
    }

    return updatedGames;
  } catch (err) {
    console.error('Failed to migrate existing games player IDs:', err);
    return loadSavedStudioGames();
  }
}
