/**
 * Pure block manipulation helpers for Tactics Note Free Space (Issue #176 Phase 4).
 * Supports adding, updating, reordering (up/down), and removing text, live kifu,
 * and partial board diagram blocks immutably.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import type { KifuRecord } from '../types/kifuRecord';
import type {
  TacticsMoveEval,
  TacticsNoteBlock,
  TacticsNoteItem,
} from '../types/tacticsNote';

export const MAX_EMBEDDED_KIFU_PLAYERS = 5;

export function createBlockId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function addNoteBlock(
  blocks: TacticsNoteBlock[],
  block: TacticsNoteBlock
): TacticsNoteBlock[] {
  return [...blocks, block];
}

/**
 * Inserts `block` at `index` (clamped safely to `0..blocks.length`).
 */
export function insertNoteBlockAt(
  blocks: TacticsNoteBlock[],
  block: TacticsNoteBlock,
  index: number
): TacticsNoteBlock[] {
  const safeIndex = Number.isFinite(index)
    ? Math.max(0, Math.min(blocks.length, Math.round(index)))
    : blocks.length;
  return [...blocks.slice(0, safeIndex), block, ...blocks.slice(safeIndex)];
}

/**
 * Resolves the initial ordered block list for a TacticsNoteItem:
 * preserves explicit `freeBlocks` (including `[]` if user cleared everything),
 * or promotes an existing built-in board sequence to an editable `legacy_tactic` block.
 */
export function resolveInitialTacticsBlocks(
  item: TacticsNoteItem
): TacticsNoteBlock[] {
  if (item.freeBlocks !== undefined) {
    return item.freeBlocks;
  }
  const hasOwnBoard = Boolean(
    item.jkfJson || (item.moves && item.moves.length > 0) || item.sfen
  );
  if (hasOwnBoard) {
    return [{ id: 'legacy_main', type: 'legacy_tactic' }];
  }
  return [];
}

export function updateNoteBlock(
  blocks: TacticsNoteBlock[],
  id: string,
  updater: (b: TacticsNoteBlock) => TacticsNoteBlock
): TacticsNoteBlock[] {
  return blocks.map((b) => (b.id === id ? updater(b) : b));
}

export function moveNoteBlock(
  blocks: TacticsNoteBlock[],
  id: string,
  direction: 'up' | 'down'
): TacticsNoteBlock[] {
  const idx = blocks.findIndex((b) => b.id === id);
  if (idx < 0) return blocks;
  const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= blocks.length) return blocks;

  const next = [...blocks];
  const current = next[idx]!;
  next[idx] = next[targetIdx]!;
  next[targetIdx] = current;
  return next;
}

export function removeNoteBlock(
  blocks: TacticsNoteBlock[],
  id: string
): TacticsNoteBlock[] {
  return blocks.filter((b) => b.id !== id);
}

/**
 * Counts how many kifu blocks are configured as full interactive board players.
 */
export function countEmbeddedKifuPlayers(blocks: TacticsNoteBlock[]): number {
  return blocks.filter(
    (b) => b.type === 'kifu' && (b.displayMode ?? 'player') === 'player'
  ).length;
}

/**
 * Adapts a KifuRecord into a lightweight TacticsNoteItem compatible with TacticsDetailPlayer.
 */
export function kifuRecordToTacticsPlayerItem(rec: KifuRecord): TacticsNoteItem {
  const evalHistory: TacticsMoveEval[] | undefined = rec.evaluations
    ? Object.entries(rec.evaluations)
        .map(([plyStr, ev]) => ({
          ply: Number(plyStr),
          scoreCp: ev.scoreCp,
          isMate: ev.isMate,
        }))
        .filter((e) => !Number.isNaN(e.ply))
        .sort((a, b) => a.ply - b.ply)
    : undefined;

  return {
    id: rec.id,
    category: 'custom',
    title: rec.title,
    tag: rec.tags[0] || rec.openingName || 'joseki',
    summary: rec.notes || '',
    jkfJson: rec.jkfJson,
    evalHistory: evalHistory && evalHistory.length > 0 ? evalHistory : undefined,
    updatedAt: rec.updatedAt,
  };
}
