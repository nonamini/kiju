/**
 * Extracts a lightweight mainline opening sequence (default 30 plies) from
 * jkfJson so JosekiTreeVisualizer can render the full repertoire tree from
 * metadata alone without downloading or parsing full game payloads.
 */

import { JKFPlayer } from 'json-kifu-format';
import { sanitizeJapaneseMoveFunari } from './shogiRules';
import type { KifuOpeningMove } from '../types/kifuRecord';

export const DEFAULT_OPENING_LINE_MAX_PLY = 30;

const RANK_CHARS = ['', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
const DROP_MAP: Record<string, string> = {
  FU: 'P',
  KY: 'L',
  KE: 'N',
  GI: 'S',
  KI: 'G',
  KA: 'B',
  HI: 'R',
};

export function extractOpeningLineFromJkf(
  jkfJson: string | undefined,
  maxPly: number = DEFAULT_OPENING_LINE_MAX_PLY
): KifuOpeningMove[] {
  if (!jkfJson || jkfJson === '{}') return [];
  try {
    const parsedJkf = JSON.parse(jkfJson);
    const player = new JKFPlayer(parsedJkf);
    player.goto(0);
    const totalGameMoves = Math.min(player.getMaxTesuu(), maxPly);
    const line: KifuOpeningMove[] = [];

    for (let p = 1; p <= totalGameMoves; p++) {
      const moveData = player.getMove(p);
      if (!moveData || !moveData.to) break;

      const fromX = moveData.from ? moveData.from.x : 0;
      const fromY = moveData.from ? moveData.from.y : 0;
      const toX = moveData.to.x;
      const toY = moveData.to.y;

      const usi =
        fromX === 0
          ? `${DROP_MAP[moveData.piece] || 'P'}*${toX}${RANK_CHARS[toY]}`
          : `${fromX}${RANK_CHARS[fromY]}${toX}${RANK_CHARS[toY]}${moveData.promote ? '+' : ''}`;

      player.goto(p);
      const japaneseMove = sanitizeJapaneseMoveFunari(
        player.getReadableKifu(p) || usi,
        usi,
        p % 2 === 1
      );
      const sfen = player.shogi.toSFENString();
      line.push({ usi, japaneseMove, sfen });
    }
    return line;
  } catch {
    return [];
  }
}
