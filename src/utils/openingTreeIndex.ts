/**
 * Incremental Radix-style Opening Tree Index (#155).
 * Stores only branch points and 1-game leaf nodes with their gameIds,
 * lazily expanding a leaf only when a new game collides on the same move.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict without any (Rule 2).
 */

import { KifuRecord } from '../types/kifuRecord';
import { extractOpeningLineFromJkf } from './kifuOpeningLine';
import { sanitizeJapaneseMoveFunari } from './shogiRules';
import { getSafeStorage } from './matchHistoryStorage';

export const OPENING_TREE_INDEX_STORAGE_KEY = 'joseki_tree_opening_index_v1';
export const OPENING_TREE_MAX_PLY = 30;

export interface OpeningTreeIndexNode {
  ply: number;
  usi: string;
  japaneseMove: string;
  sfen: string;
  gameIds: string[];
  children: OpeningTreeIndexNode[];
}

export interface OpeningTreeIndex {
  version: 1;
  indexedGameIds: string[];
  root: OpeningTreeIndexNode;
}

function createRootIndexNode(): OpeningTreeIndexNode {
  return {
    ply: 0,
    usi: 'root',
    japaneseMove: '平手初期局面',
    sfen: 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1',
    gameIds: [],
    children: [],
  };
}

export interface OpeningTreeGameInput {
  id: string;
  jkfJson: string;
  openingLine?: KifuRecord['openingLine'];
}

function getGameOpeningLine(
  game: OpeningTreeGameInput,
  maxPly: number
): NonNullable<KifuRecord['openingLine']> {
  if (game.openingLine && game.openingLine.length > 0) {
    return game.openingLine.slice(0, maxPly);
  }
  return extractOpeningLineFromJkf(game.jkfJson, maxPly);
}

/**
 * Inserts a single game into the Radix-style index, stopping at the first
 * unique move (1-game leaf) and lazily expanding an existing 1-game leaf
 * only when a collision occurs.
 */
export function insertGameIntoIndex(
  root: OpeningTreeIndexNode,
  game: OpeningTreeGameInput,
  recordsMap: Map<string, OpeningTreeGameInput>,
  maxPly: number = OPENING_TREE_MAX_PLY
): void {
  if (!root.gameIds.includes(game.id)) {
    root.gameIds.push(game.id);
  }
  const line = getGameOpeningLine(game, maxPly);
  if (line.length === 0) return;

  let current = root;
  for (let i = 0; i < line.length; i++) {
    const mv = line[i];
    if (!mv) break;
    const ply = i + 1;
    const sanitizedMove = sanitizeJapaneseMoveFunari(mv.japaneseMove, mv.usi, ply % 2 === 1);

    let child = current.children.find((c) => c.usi === mv.usi);
    if (!child) {
      // Unique move reached: stop here and store gameId on this leaf
      child = {
        ply,
        usi: mv.usi,
        japaneseMove: sanitizedMove,
        sfen: mv.sfen,
        gameIds: [game.id],
        children: [],
      };
      current.children.push(child);
      return;
    }

    // Collision with an existing 1-game leaf: lazily expand the existing game by 1 ply
    if (child.gameIds.length === 1 && child.children.length === 0) {
      const existingId = child.gameIds[0];
      const existingGame = existingId ? recordsMap.get(existingId) : undefined;
      if (existingGame && existingId && existingId !== game.id) {
        const existingLine = getGameOpeningLine(existingGame, maxPly);
        const nextExistingMv = existingLine[ply];
        if (nextExistingMv) {
          child.children.push({
            ply: ply + 1,
            usi: nextExistingMv.usi,
            japaneseMove: sanitizeJapaneseMoveFunari(
              nextExistingMv.japaneseMove,
              nextExistingMv.usi,
              (ply + 1) % 2 === 1
            ),
            sfen: nextExistingMv.sfen,
            gameIds: [existingId],
            children: [],
          });
        }
      }
    }

    if (!child.gameIds.includes(game.id)) {
      child.gameIds.push(game.id);
    }
    current = child;
  }
}

/**
 * Loads the persisted opening tree index and incrementally syncs any newly
 * added games (or rebuilds if games were removed).
 */
export function buildOrSyncOpeningTreeIndex(records: OpeningTreeGameInput[]): OpeningTreeIndex {
  const recordsMap = new Map<string, OpeningTreeGameInput>();
  for (const r of records) {
    recordsMap.set(r.id, r);
  }

  let index: OpeningTreeIndex | null = null;
  try {
    const raw = getSafeStorage().getItem(OPENING_TREE_INDEX_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as OpeningTreeIndex;
      if (parsed && parsed.version === 1 && parsed.root && Array.isArray(parsed.indexedGameIds)) {
        index = parsed;
      }
    }
  } catch {
    index = null;
  }

  const currentIds = new Set(records.map((r) => r.id));
  const hasRemovedGames =
    index !== null && index.indexedGameIds.some((id) => !currentIds.has(id));

  if (!index || hasRemovedGames) {
    index = {
      version: 1,
      indexedGameIds: [],
      root: createRootIndexNode(),
    };
  }

  const indexedSet = new Set(index.indexedGameIds);
  let dirty = false;
  for (const rec of records) {
    if (!indexedSet.has(rec.id)) {
      insertGameIntoIndex(index.root, rec, recordsMap, OPENING_TREE_MAX_PLY);
      index.indexedGameIds.push(rec.id);
      indexedSet.add(rec.id);
      dirty = true;
    }
  }

  if (dirty) {
    try {
      getSafeStorage().setItem(OPENING_TREE_INDEX_STORAGE_KEY, JSON.stringify(index));
    } catch {
      // ignore storage quota errors
    }
  }

  return index;
}
