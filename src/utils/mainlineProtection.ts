/**
 * Mainline Protection & Diff Utilities (Issue #36).
 * Guards imported official/match kifu records ('pro' | 'ladies' | 'amateur' | 'self')
 * against accidental mainline alteration or overwrite while allowing branch study.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import type { KifuGameKind, KifuRecord } from '../types/kifuRecord';
import { resolveGameKind } from './gameKindClassifier';

export const PROTECTED_MATCH_GAME_KINDS: ReadonlySet<KifuGameKind> = new Set([
  'pro',
  'ladies',
  'amateur',
  'self',
]);

interface JkfMainlineMoveEntry {
  special?: string;
  move?: {
    color?: number;
    from?: { x: number; y: number };
    to?: { x: number; y: number };
    piece?: string;
    promote?: boolean;
  };
}

interface JkfMainlineContainer {
  moves?: JkfMainlineMoveEntry[];
}

/**
 * Returns true if the given KifuRecord represents an imported/played match
 * whose mainline serves as canonical data for player stats and opening trees.
 */
export function isProtectedMatchRecord(record: KifuRecord | null | undefined): boolean {
  if (!record || record.deletedAt) return false;
  return PROTECTED_MATCH_GAME_KINDS.has(resolveGameKind(record));
}

/**
 * Extracts a canonical sequence of mainline move signatures from a JKF JSON string.
 * Comments, evaluations, and variation forks are intentionally ignored so adding
 * study notes or variation branches does not mark the mainline as modified.
 */
export function extractMainlineMoveSignature(jkfJson: string): string[] {
  try {
    const parsed = JSON.parse(jkfJson) as JkfMainlineContainer;
    if (!Array.isArray(parsed.moves)) return [];

    const signatures: string[] = [];
    for (const entry of parsed.moves) {
      if (entry.special) {
        signatures.push(`special:${entry.special}`);
      } else if (entry.move) {
        const fromStr = entry.move.from
          ? `${entry.move.from.x},${entry.move.from.y}`
          : 'drop';
        const toStr = entry.move.to
          ? `${entry.move.to.x},${entry.move.to.y}`
          : '';
        const promoteFlag = entry.move.promote ? 1 : 0;
        signatures.push(
          `${entry.move.color ?? ''}:${fromStr}>${toStr}:${entry.move.piece ?? ''}:${promoteFlag}`
        );
      }
    }
    return signatures;
  } catch {
    return [];
  }
}

/**
 * Checks whether the mainline move sequence differs between the saved original JKF
 * and the current JKF in the study studio.
 */
export function hasMainlineChanged(
  originalJkfJson: string | undefined,
  currentJkfJson: string
): boolean {
  if (!originalJkfJson) return false;
  const origMoves = extractMainlineMoveSignature(originalJkfJson);
  const curMoves = extractMainlineMoveSignature(currentJkfJson);
  if (origMoves.length !== curMoves.length) return true;
  for (let i = 0; i < origMoves.length; i++) {
    if (origMoves[i] !== curMoves[i]) return true;
  }
  return false;
}
