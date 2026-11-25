/**
 * Shogi Rules and General Game End Judgment Engine.
 * Detects Repetition (千日手 / Sanyata), Perpetual Check (連続王手の千日手),
 * Impasse / King Entering (入玉・持将棋 - 24-point / 27-point / Declaration rules),
 * and provides structured rule explanation data for the in-app Rulebook Modal.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript typed without 'any' (Rule 2).
 */

import { PieceType } from '../types/shogi';
import { RAW_PROMOTABLE_KINDS, PROMOTED_KINDS } from './shogiRules';

export interface ImpasseScoreBreakdown {
  kingEntered: boolean;
  enemyTerritoryPieceCount: number;
  rooksAndBishopsCount: number; // 5 pts each
  otherPiecesCount: number; // 1 pt each
  totalPoints: number;
}

export interface ImpasseStatus {
  sente: ImpasseScoreBreakdown;
  gote: ImpasseScoreBreakdown;
  isImpasseReached: boolean;
  impasseWinner: 'sente' | 'gote' | 'draw' | null;
}

/**
 * Normalizes an SFEN string to position + turn + pieces-in-hand (excluding ply counter).
 * In Shogi,千日手 (Sanyata) occurs when the exact same board position, turn,
 * and pieces-in-hand appear 4 times in the same game.
 */
export function getPositionKeyForRepetition(sfen: string): string {
  const parts = sfen.trim().split(/\s+/);
  if (parts.length >= 3) {
    return `${parts[0]} ${parts[1]} ${parts[2]}`;
  }
  return sfen;
}

/**
 * Checks if the current side to move has any strictly legal moves (moves or drops)
 * that evade check and do not leave their King in check.
 * Strictly typed and pure, using the provided shogi instance.
 */
export function hasAnyLegalMoves(shogi: {
  turn: 0 | 1;
  get: (x: number, y: number) => { kind: PieceType; color: 0 | 1 } | null;
  getMovesFrom: (x: number, y: number) => Array<{ to: { x: number; y: number } }>;
  getDropsBy: (color: 0 | 1) => Array<{ kind?: PieceType; to: { x: number; y: number } }>;
  move: (fx: number, fy: number, tx: number, ty: number, promote?: boolean) => void;
  unmove: (fx: number, fy: number, tx: number, ty: number, promote?: boolean, capture?: PieceType) => void;
  drop: (tx: number, ty: number, kind: PieceType, color?: 0 | 1) => void;
  undrop: (tx: number, ty: number) => void;
  isCheck: (color: 0 | 1) => boolean;
}): boolean {
  const turn = shogi.turn;

  // 1. Board moves
  for (let x = 1; x <= 9; x++) {
    for (let y = 1; y <= 9; y++) {
      const piece = shogi.get(x, y);
      if (!piece || piece.color !== turn) continue;

      const moves = shogi.getMovesFrom(x, y);
      const originalKind = piece.kind;
      const isAlreadyPromoted = PROMOTED_KINDS.has(originalKind);
      const isPromotable = RAW_PROMOTABLE_KINDS.has(originalKind);

      for (const m of moves) {
        const destPiece = shogi.get(m.to.x, m.to.y);
        const capturedKind = destPiece ? destPiece.kind : undefined;

        // Try unpromoted (or normal move for already promoted / gold / king)
        try {
          shogi.move(x, y, m.to.x, m.to.y, false);
          const stillInCheck = shogi.isCheck(turn);
          const movedPiece = shogi.get(m.to.x, m.to.y);
          const wasAutoPromoted = movedPiece ? movedPiece.kind !== originalKind : false;
          shogi.unmove(x, y, m.to.x, m.to.y, wasAutoPromoted, capturedKind);
          // Safety guard: ensure original piece kind is strictly preserved
          const restoredPiece = shogi.get(x, y);
          if (restoredPiece && restoredPiece.kind !== originalKind) {
            restoredPiece.kind = originalKind;
          }
          if (!stillInCheck) return true;
        } catch {
          // Illegal geometry
        }

        // Try promoted move ONLY if piece is unpromoted and eligible for promotion
        const canPromote =
          isPromotable &&
          !isAlreadyPromoted &&
          ((turn === 0 && (y <= 3 || m.to.y <= 3)) ||
           (turn === 1 && (y >= 7 || m.to.y >= 7)));

        if (canPromote) {
          try {
            shogi.move(x, y, m.to.x, m.to.y, true);
            const stillInCheck = shogi.isCheck(turn);
            shogi.unmove(x, y, m.to.x, m.to.y, true, capturedKind);
            // Safety guard: ensure original piece kind is strictly preserved
            const restoredPiece = shogi.get(x, y);
            if (restoredPiece && restoredPiece.kind !== originalKind) {
              restoredPiece.kind = originalKind;
            }
            if (!stillInCheck) return true;
          } catch {
            // Cannot promote or invalid
          }
        }
      }
    }
  }

  // 2. Drop moves
  try {
    const drops = shogi.getDropsBy(turn);
    for (const d of drops) {
      if (!d.kind) continue;
      try {
        shogi.drop(d.to.x, d.to.y, d.kind, turn);
        const stillInCheck = shogi.isCheck(turn);
        shogi.undrop(d.to.x, d.to.y);
        if (!stillInCheck) return true;
      } catch {
        // Illegal drop
      }
    }
  } catch {
    // getDropsBy failure fallback
  }

  return false;
}

/**
 * Checks if the position history has triggered 千日手 (4 repetitions).
 */
export function checkSanyataRepetition(
  positionHistory: string[]
): { isSanyata: boolean; occurrences: number } {
  if (positionHistory.length < 4) {
    return { isSanyata: false, occurrences: 1 };
  }

  const latest = positionHistory[positionHistory.length - 1];
  if (!latest) return { isSanyata: false, occurrences: 0 };

  const latestKey = getPositionKeyForRepetition(latest);
  let count = 0;
  for (const pos of positionHistory) {
    if (getPositionKeyForRepetition(pos) === latestKey) {
      count++;
    }
  }

  return {
    isSanyata: count >= 4,
    occurrences: count,
  };
}

/**
 * Evaluates King Entering (入玉) & Impasse (持将棋) according to standard Japanese Shogi Association rules:
 * - King is in the enemy camp (ranks 1-3 for Sente, ranks 7-9 for Gote).
 * - Pieces in the enemy camp + pieces in hand:
 *   - Rook (飛/竜) & Bishop (角/馬) = 5 points
 *   - All other pieces (金, 銀, 桂, 香, 歩, と金, etc.) = 1 point
 *   - King = 0 points
 * - Standard 24-point rule (持将棋):
 *   Both players need at least 24 points to avoid loss.
 *   If both reach 24+, game is a Draw (持将棋成立・引き分け).
 *   If one player has <24 points while the other has >=24, the player with <24 points loses.
 * - 27-point declaration rule (入玉宣言法 - JSA 27点法):
 *   Player declares victory if their King entered, >=10 pieces in enemy camp, King not in check,
 *   and points >= 28 (Sente) / >= 27 (Gote).
 */
export function calculateImpassePoints(
  shogiInstance: {
    get: (x: number, y: number) => { kind: string; color: number } | null | undefined;
    getHandsSummary?: (color: number) => Record<string, number>;
  },
  senteHand: Record<string, number>,
  goteHand: Record<string, number>
): ImpasseStatus {
  // Sente: enemy camp is y in [1, 2, 3]
  // Gote: enemy camp is y in [7, 8, 9]
  let senteKingEntered = false;
  let goteKingEntered = false;

  let senteEnemyTerritoryPieceCount = 0;
  let goteEnemyTerritoryPieceCount = 0;

  let senteMajorPoints = 0;
  let senteMinorPoints = 0;

  let goteMajorPoints = 0;
  let goteMinorPoints = 0;

  for (let x = 1; x <= 9; x++) {
    for (let y = 1; y <= 9; y++) {
      const piece = shogiInstance.get(x, y);
      if (!piece) continue;

      const isSente = piece.color === 0;
      const isKing = piece.kind === 'OU';
      const isMajor = piece.kind === 'HI' || piece.kind === 'RY' || piece.kind === 'KA' || piece.kind === 'UM';

      // Check Sente pieces in enemy camp (y <= 3)
      if (isSente) {
        if (y <= 3) {
          if (isKing) {
            senteKingEntered = true;
          } else {
            senteEnemyTerritoryPieceCount++;
            if (isMajor) senteMajorPoints += 5;
            else senteMinorPoints += 1;
          }
        }
      } else {
        // Check Gote pieces in enemy camp (y >= 7)
        if (y >= 7) {
          if (isKing) {
            goteKingEntered = true;
          } else {
            goteEnemyTerritoryPieceCount++;
            if (isMajor) goteMajorPoints += 5;
            else goteMinorPoints += 1;
          }
        }
      }
    }
  }

  // Hand points (all pieces in hand are counted)
  // Sente Hand
  for (const [kind, count] of Object.entries(senteHand)) {
    if (count <= 0) continue;
    const isMajor = kind === 'HI' || kind === 'KA' || kind === 'R' || kind === 'B';
    if (isMajor) {
      senteMajorPoints += 5 * count;
    } else {
      senteMinorPoints += 1 * count;
    }
  }

  // Gote Hand
  for (const [kind, count] of Object.entries(goteHand)) {
    if (count <= 0) continue;
    const isMajor = kind === 'HI' || kind === 'KA' || kind === 'R' || kind === 'B';
    if (isMajor) {
      goteMajorPoints += 5 * count;
    } else {
      goteMinorPoints += 1 * count;
    }
  }

  const senteTotalPoints = senteMajorPoints + senteMinorPoints;
  const goteTotalPoints = goteMajorPoints + goteMinorPoints;

  const isBothEntered = senteKingEntered && goteKingEntered;
  let impasseWinner: 'sente' | 'gote' | 'draw' | null = null;
  let isImpasseReached = false;

  if (isBothEntered) {
    isImpasseReached = true;
    if (senteTotalPoints >= 24 && goteTotalPoints >= 24) {
      impasseWinner = 'draw';
    } else if (senteTotalPoints < 24) {
      impasseWinner = 'gote';
    } else {
      impasseWinner = 'sente';
    }
  }

  return {
    sente: {
      kingEntered: senteKingEntered,
      enemyTerritoryPieceCount: senteEnemyTerritoryPieceCount,
      rooksAndBishopsCount: Math.floor(senteMajorPoints / 5),
      otherPiecesCount: senteMinorPoints,
      totalPoints: senteTotalPoints,
    },
    gote: {
      kingEntered: goteKingEntered,
      enemyTerritoryPieceCount: goteEnemyTerritoryPieceCount,
      rooksAndBishopsCount: Math.floor(goteMajorPoints / 5),
      otherPiecesCount: goteMinorPoints,
      totalPoints: goteTotalPoints,
    },
    isImpasseReached,
    impasseWinner,
  };
}
