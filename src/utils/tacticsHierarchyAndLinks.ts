/**
 * Tactics Note Hierarchy Grouping & Automatic Library Kifu Linkage (Issue #18).
 * Organizes TacticsNoteItems into collapsible hierarchy categories
 * (e.g. 居飛車 / 振り飛車 / 相振り飛車 / 囲い・手筋 / その他) and resolves
 * library games reaching the tactic's key position.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import type { KifuRecord } from '../types/kifuRecord';
import type { TacticsNoteItem } from '../types/tacticsNote';
import {
  searchLibraryByPositionSfenAsync,
  SfenReverseMatch,
} from './sfenReverseSearch';
import { createJkfPlayerFromTactic } from './tacticsJkfConverter';

export const DEFAULT_TACTICS_HIERARCHY_GROUPS = [
  '居飛車',
  '振り飛車',
  '相振り飛車',
  '囲い・手筋',
  'その他',
] as const;

/**
 * Resolves the hierarchy group for a tactics note, preferring an explicit
 * `hierarchyGroup` and otherwise inferring from title, tag, and category.
 */
export function inferTacticsHierarchyGroup(item: TacticsNoteItem): string {
  const explicit = item.hierarchyGroup?.trim();
  if (explicit) return explicit;

  const text = `${item.title} ${item.tag}`;
  if (/相振り|相振飛車/.test(text)) {
    return '相振り飛車';
  }
  if (/振り飛車|四間飛車|三間飛車|中飛車|向かい飛車|ゴキゲン|石田流|美濃|穴熊|角交換振り飛車/.test(text)) {
    return '振り飛車';
  }
  if (/居飛車|矢倉|角換わり|相掛かり|横歩|雁木|エルモ|船囲い|右四間|棒銀|急戦/.test(text)) {
    return '居飛車';
  }
  if (item.category === 'castles' || /囲い|手筋/.test(text)) {
    return '囲い・手筋';
  }
  return 'その他';
}

/**
 * Groups tactics notes by hierarchy category while ordering default categories first.
 */
export function groupTacticsByHierarchy(
  items: TacticsNoteItem[]
): Array<{ group: string; items: TacticsNoteItem[] }> {
  const map = new Map<string, TacticsNoteItem[]>();
  for (const item of items) {
    const group = inferTacticsHierarchyGroup(item);
    const list = map.get(group);
    if (list) {
      list.push(item);
    } else {
      map.set(group, [item]);
    }
  }

  const defaultOrder = new Map<string, number>(
    DEFAULT_TACTICS_HIERARCHY_GROUPS.map((g, idx) => [g, idx])
  );

  return Array.from(map.entries())
    .sort(([a], [b]) => {
      const ia = defaultOrder.get(a);
      const ib = defaultOrder.get(b);
      if (ia !== undefined && ib !== undefined) return ia - ib;
      if (ia !== undefined) return -1;
      if (ib !== undefined) return 1;
      return a.localeCompare(b, 'ja');
    })
    .map(([group, groupItems]) => ({ group, items: groupItems }));
}

/**
 * Extracts the representative SFEN of a tactics note (end of mainline up to 40 plies,
 * or custom starting SFEN) so matching real games in the Kifu Library can be found.
 * Returns null for notes without board/move data to avoid matching every Hirate game.
 */
export function extractTacticTargetSfen(item: TacticsNoteItem): string | null {
  const hasJkf = Boolean(
    item.jkfJson && item.jkfJson.trim() && item.jkfJson.trim() !== '{}'
  );
  const hasMoves = Array.isArray(item.moves) && item.moves.length > 0;
  const hasCustomSfen = Boolean(item.sfen && item.sfen.trim());

  if (!hasJkf && !hasMoves && !hasCustomSfen) {
    return null;
  }

  try {
    const player = createJkfPlayerFromTactic(item);
    const maxTesuu = player.getMaxTesuu();
    if (maxTesuu === 0 && !hasCustomSfen) {
      return null;
    }
    const targetPly = Math.min(maxTesuu, 40);
    if (targetPly > 0) {
      player.goto(targetPly);
    }
    return player.shogi.toSFENString();
  } catch {
    return hasCustomSfen ? item.sfen!.trim() : null;
  }
}

/**
 * Searches non-deleted KifuLibrary records for games reaching this tactic's key position.
 */
export async function findMatchingLibraryGamesForTactic(
  item: TacticsNoteItem,
  records: KifuRecord[]
): Promise<{ targetSfen: string | null; matches: SfenReverseMatch[] }> {
  const targetSfen = extractTacticTargetSfen(item);
  if (!targetSfen) {
    return { targetSfen: null, matches: [] };
  }

  const activeRecords = records.filter((r) => !r.deletedAt);
  const matches = await searchLibraryByPositionSfenAsync(
    targetSfen,
    activeRecords
  );
  return { targetSfen, matches };
}
