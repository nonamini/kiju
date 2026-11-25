/**
 * Generates the per-ply SFEN list for cloud analysis (#59).
 * Computed lazily at queue time (not import time) via JKFPlayer replay of
 * the main line. Index i holds the position after i plies (0 = initial),
 * matching the evaluations map convention where evaluations[ply] describes
 * the position reached after `ply` moves.
 * Follows Rule 1: strictly English code, comments, identifiers.
 * Follows Rule 2: strict TypeScript, zero any.
 */

import { Formats, JKFPlayer } from 'json-kifu-format';
import { KifuRecord } from '../types/kifuRecord';

/**
 * Returns sfens[0..N] for a record's main line, or null when the jkfJson
 * cannot be parsed or contains no playable moves.
 */
export function computeKifuPositionSfens(record: KifuRecord): string[] | null {
  try {
    let player: JKFPlayer | null = null;
    if (record.jkfJson && record.jkfJson !== '{}') {
      const parsed = JSON.parse(record.jkfJson) as Formats.JSONKifuFormat;
      if (parsed && Array.isArray(parsed.moves)) {
        player = new JKFPlayer(parsed);
      }
    }
    if (!player && record.rawKif && record.rawKif.trim().length > 0) {
      player = JKFPlayer.parseKIF(record.rawKif);
    }
    if (!player) return null;

    const sfens: string[] = [player.shogi.toSFENString()];

    // Walk the main line. forward() returns false on special/end moves;
    // cap iterations defensively against malformed trees.
    const maxIterations = Math.max(player.getMaxTesuu() + 5, 1);
    for (let i = 0; i < maxIterations; i++) {
      if (!player.forward()) break;
      sfens.push(player.shogi.toSFENString());
    }

    return sfens.length > 1 ? sfens : null;
  } catch {
    return null;
  }
}
