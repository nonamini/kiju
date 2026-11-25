/**
 * Shogi Opening Classifier.
 * Identifies major Shogi opening systems (Kakugawari, Aigakari, Yagura, Furibisha variants)
 * from KIF header text and early move sequences.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import { ShogiMove } from '../types/shogi';

export interface OpeningCategory {
  id: string;
  nameKey: string;
}

export const OPENING_CATEGORIES: OpeningCategory[] = [
  { id: 'kakugawari', nameKey: 'openings.kakugawari' },
  { id: 'yagura', nameKey: 'openings.yagura' },
  { id: 'aigakari', nameKey: 'openings.aigakari' },
  { id: 'shikenbisha', nameKey: 'openings.shikenbisha' },
  { id: 'sankenbisha', nameKey: 'openings.sankenbisha' },
  { id: 'nakabisha', nameKey: 'openings.nakabisha' },
  { id: 'mukaibisha', nameKey: 'openings.mukaibisha' },
  { id: 'furibisha_other', nameKey: 'openings.furibisha_other' },
  { id: 'ibisha_other', nameKey: 'openings.ibisha_other' },
  { id: 'unclassified', nameKey: 'openings.unclassified' },
];

/**
 * Classifies the opening system from header string and early moves.
 *
 * @param moves Move sequence of the game
 * @param headerForm Form string from KIF header (戦型) if present
 * @returns Identified OpeningCategory
 */
export function classifyOpening(
  moves: ShogiMove[],
  headerForm?: string
): OpeningCategory {
  const normHeader = (headerForm ?? '').trim();

  // 1. Check explicit header form
  if (normHeader.includes('角換わり') || normHeader.includes('角換り')) {
    return { id: 'kakugawari', nameKey: 'openings.kakugawari' };
  }
  if (normHeader.includes('矢倉')) {
    return { id: 'yagura', nameKey: 'openings.yagura' };
  }
  if (normHeader.includes('相掛かり') || normHeader.includes('相掛り') || normHeader.includes('相懸かり')) {
    return { id: 'aigakari', nameKey: 'openings.aigakari' };
  }
  if (normHeader.includes('四間飛車') || normHeader.includes('四間')) {
    return { id: 'shikenbisha', nameKey: 'openings.shikenbisha' };
  }
  if (normHeader.includes('三間飛車') || normHeader.includes('三間')) {
    return { id: 'sankenbisha', nameKey: 'openings.sankenbisha' };
  }
  if (normHeader.includes('中飛車') || normHeader.includes('ゴキゲン')) {
    return { id: 'nakabisha', nameKey: 'openings.nakabisha' };
  }
  if (normHeader.includes('向かい飛車') || normHeader.includes('向飛車')) {
    return { id: 'mukaibisha', nameKey: 'openings.mukaibisha' };
  }
  if (normHeader.includes('振り飛車') || normHeader.includes('振飛車')) {
    return { id: 'furibisha_other', nameKey: 'openings.furibisha_other' };
  }

  // 2. Classify based on move heuristics in the first 24 plies
  const earlyMoves = moves.slice(0, 24);

  // Check for Bishop exchange (Kakugawari)
  const hasBishopExchange = earlyMoves.some(
    (m) =>
      (m.piece === 'KA' && m.promote) ||
      (m.sfenMove.endsWith('7g+') || m.sfenMove.endsWith('2b+') || m.sfenMove.startsWith('2b7g') || m.sfenMove.startsWith('8h2b'))
  );
  if (hasBishopExchange) {
    return { id: 'kakugawari', nameKey: 'openings.kakugawari' };
  }

  // Check for Rook moves across the files (Swinging Rook)
  for (const m of earlyMoves) {
    if (m.piece === 'HI') {
      const destFile = m.to.file;
      if (m.color === 'b') {
        // Sente Rook initially at file 2
        if (destFile === 5) return { id: 'nakabisha', nameKey: 'openings.nakabisha' };
        if (destFile === 6) return { id: 'shikenbisha', nameKey: 'openings.shikenbisha' };
        if (destFile === 7) return { id: 'sankenbisha', nameKey: 'openings.sankenbisha' };
        if (destFile === 8) return { id: 'mukaibisha', nameKey: 'openings.mukaibisha' };
        if (destFile !== 2) return { id: 'furibisha_other', nameKey: 'openings.furibisha_other' };
      } else {
        // Gote Rook initially at file 8
        if (destFile === 5) return { id: 'nakabisha', nameKey: 'openings.nakabisha' };
        if (destFile === 4) return { id: 'shikenbisha', nameKey: 'openings.shikenbisha' };
        if (destFile === 3) return { id: 'sankenbisha', nameKey: 'openings.sankenbisha' };
        if (destFile === 2) return { id: 'mukaibisha', nameKey: 'openings.mukaibisha' };
        if (destFile !== 8) return { id: 'furibisha_other', nameKey: 'openings.furibisha_other' };
      }
    }
  }

  // Check for Aigakari: both players advance rook pawns early without closing bishop diagonals
  const senteAdvancedRookPawn = earlyMoves.some((m) => m.color === 'b' && m.sfenMove === '2f2e');
  const goteAdvancedRookPawn = earlyMoves.some((m) => m.color === 'w' && m.sfenMove === '8d8e');
  if (senteAdvancedRookPawn && goteAdvancedRookPawn) {
    return { id: 'aigakari', nameKey: 'openings.aigakari' };
  }

  // Check for Yagura: 7g7f, 8c8d, 7h6h or 6h7g, 3c3d
  const has7g7f = earlyMoves.some((m) => m.sfenMove === '7g7f');
  const has8c8d = earlyMoves.some((m) => m.sfenMove === '8c8d');
  const hasSilver6h = earlyMoves.some((m) => m.sfenMove === '7i6h' || m.sfenMove === '6h7g');
  if (has7g7f && has8c8d && hasSilver6h) {
    return { id: 'yagura', nameKey: 'openings.yagura' };
  }

  // Default to Ibisha or Unclassified
  if (has7g7f || earlyMoves.some((m) => m.sfenMove === '2g2f')) {
    return { id: 'ibisha_other', nameKey: 'openings.ibisha_other' };
  }

  return { id: 'unclassified', nameKey: 'openings.unclassified' };
}
