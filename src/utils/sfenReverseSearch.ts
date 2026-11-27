/**
 * Pure SFEN reverse lookup across KifuRecord library items (Issue #10).
 * Normalizes SFEN positions (board + turn + captured hands, ignoring ply count)
 * so transpositions converging at different ply numbers still match cleanly.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict without any (Rule 2).
 */

import { Formats, JKFPlayer } from 'json-kifu-format';
import type { KifuRecord } from '../types/kifuRecord';
import { getCachedKifuPayload } from './kifuPayloadCache';

export const INITIAL_HIRATE_SFEN_KEY =
  'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b -';

export interface SfenReverseMatch {
  record: KifuRecord;
  matchedPly: number;
  nextMoveLabel?: string;
}

/**
 * Strips optional "sfen " prefix and ply count, leaving "<board> <turn> <hand>".
 */
export function normalizePositionSfenKey(sfen: string): string {
  const cleaned = sfen.trim().replace(/^sfen\s+/i, '');
  if (!cleaned) return '';
  const parts = cleaned.split(/\s+/);
  if (parts.length < 3) return '';
  return `${parts[0]} ${parts[1]} ${parts[2]}`;
}

function createPlayerForRecord(record: KifuRecord): JKFPlayer | null {
  try {
    if (record.jkfJson && record.jkfJson !== '{}') {
      const parsed = JSON.parse(record.jkfJson) as Formats.JSONKifuFormat;
      if (parsed && Array.isArray(parsed.moves)) {
        return new JKFPlayer(parsed);
      }
    }
    if (record.rawKif && record.rawKif.trim().length > 0) {
      return JKFPlayer.parseKIF(record.rawKif);
    }
    return null;
  } catch {
    return null;
  }
}

function matchOpeningLine(
  record: KifuRecord,
  targetKey: string
): SfenReverseMatch | null {
  const line = record.openingLine;
  if (!Array.isArray(line) || line.length === 0) return null;

  if (targetKey === INITIAL_HIRATE_SFEN_KEY) {
    return {
      record,
      matchedPly: 0,
      nextMoveLabel: line[0]?.japaneseMove || undefined,
    };
  }

  for (let idx = 0; idx < line.length; idx++) {
    const entry = line[idx];
    if (entry && normalizePositionSfenKey(entry.sfen) === targetKey) {
      return {
        record,
        matchedPly: idx + 1,
        nextMoveLabel: line[idx + 1]?.japaneseMove || undefined,
      };
    }
  }
  return null;
}

function matchRecordMainline(
  record: KifuRecord,
  targetKey: string
): SfenReverseMatch | null {
  const openingMatch = matchOpeningLine(record, targetKey);
  if (openingMatch) return openingMatch;

  const player = createPlayerForRecord(record);
  if (!player) {
    if (Array.isArray(record.positionSfens)) {
      for (let ply = 0; ply < record.positionSfens.length; ply++) {
        const sfen = record.positionSfens[ply];
        if (sfen && normalizePositionSfenKey(sfen) === targetKey) {
          return { record, matchedPly: ply };
        }
      }
    }
    return null;
  }

  try {
    if (normalizePositionSfenKey(player.shogi.toSFENString()) === targetKey) {
      const nextMove =
        player.getMaxTesuu() >= 1 ? player.getReadableKifu(1) || undefined : undefined;
      return {
        record,
        matchedPly: 0,
        nextMoveLabel: nextMove,
      };
    }

    const maxIterations = Math.max(player.getMaxTesuu() + 5, 1);
    for (let step = 0; step < maxIterations; step++) {
      if (!player.forward()) break;
      const currentPly = player.tesuu;
      if (normalizePositionSfenKey(player.shogi.toSFENString()) === targetKey) {
        const hasNext = currentPly < player.getMaxTesuu();
        const nextMove = hasNext
          ? player.getReadableKifu(currentPly + 1) || undefined
          : undefined;
        return {
          record,
          matchedPly: currentPly,
          nextMoveLabel: nextMove,
        };
      }
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Searches non-deleted library records for positions matching `targetSfen`,
 * regardless of move number (supports transpositions).
 */
export function searchLibraryByPositionSfen(
  targetSfen: string,
  records: KifuRecord[]
): SfenReverseMatch[] {
  const targetKey = normalizePositionSfenKey(targetSfen);
  if (!targetKey) return [];

  const matches: SfenReverseMatch[] = [];
  for (const record of records) {
    if (record.deletedAt) continue;
    const match = matchRecordMainline(record, targetKey);
    if (match) {
      matches.push(match);
    }
  }

  matches.sort((a, b) => {
    const da = a.record.matchDate || a.record.updatedAt || '';
    const db = b.record.matchDate || b.record.updatedAt || '';
    return db.localeCompare(da);
  });

  return matches;
}

/**
 * Asynchronous version that starts with the fast openingLine / in-memory pass
 * and also inspects cached IndexedDB full payloads for plies beyond openingLine (31+).
 */
export async function searchLibraryByPositionSfenAsync(
  targetSfen: string,
  records: KifuRecord[]
): Promise<SfenReverseMatch[]> {
  const targetKey = normalizePositionSfenKey(targetSfen);
  if (!targetKey) return [];

  const matches: SfenReverseMatch[] = [];
  const matchedIds = new Set<string>();
  const remainingStripped: KifuRecord[] = [];

  for (const record of records) {
    if (record.deletedAt) continue;
    const match = matchRecordMainline(record, targetKey);
    if (match) {
      matches.push(match);
      matchedIds.add(record.id);
    } else if (
      (!record.jkfJson || record.jkfJson === '{}') &&
      (!record.rawKif || !record.rawKif.trim())
    ) {
      remainingStripped.push(record);
    }
  }

  for (const record of remainingStripped) {
    if (matchedIds.has(record.id)) continue;
    const payload = await getCachedKifuPayload(record.id);
    if (!payload) continue;
    const hydrated: KifuRecord = {
      ...record,
      jkfJson: payload.jkfJson || record.jkfJson,
      rawKif: payload.rawKif ?? record.rawKif,
    };
    const deepMatch = matchRecordMainline(hydrated, targetKey);
    if (deepMatch) {
      matches.push({ ...deepMatch, record });
      matchedIds.add(record.id);
    }
  }

  matches.sort((a, b) => {
    const da = a.record.matchDate || a.record.updatedAt || '';
    const db = b.record.matchDate || b.record.updatedAt || '';
    return db.localeCompare(da);
  });

  return matches;
}
