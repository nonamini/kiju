/**
 * Shogi Rules & Move Validation Helper.
 * Computes legal destination squares, drop squares, handles promotions,
 * and parses/formats USI move notations.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import { Color, PieceType, ShogiMove, Square } from '../types/shogi';
import { BoardPiece, ShogiBoard } from './shogiBoard';

export const RAW_PROMOTABLE_KINDS = new Set(['FU', 'KY', 'KE', 'GI', 'KA', 'HI']);
export const PROMOTED_KINDS = new Set(['TO', 'NY', 'NK', 'NG', 'UM', 'RY']);

export interface TargetSquare {
  to: Square;
  canPromote: boolean;
  forcePromote: boolean;
}

const PIECE_TYPE_MAP: Record<string, PieceType> = {
  P: 'FU',
  L: 'KY',
  N: 'KE',
  S: 'GI',
  G: 'KI',
  B: 'KA',
  R: 'HI',
  K: 'OU',
  '+P': 'TO',
  '+L': 'NY',
  '+N': 'NK',
  '+S': 'NG',
  '+B': 'UM',
  '+R': 'RY',
};

const PIECE_KANJI_SIMPLE: Record<PieceType, string> = {
  FU: '歩',
  KY: '香',
  KE: '桂',
  GI: '銀',
  KI: '金',
  KA: '角',
  HI: '飛',
  OU: '玉',
  TO: 'と',
  NY: '成香',
  NK: '成桂',
  NG: '成銀',
  UM: '馬',
  RY: '竜',
};

const FILE_KANJI = ['', '１', '２', '３', '４', '５', '６', '７', '８', '９'];
const RANK_KANJI = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/**
 * Converts a 1-based rank number (1-9) to USI letter ('a'-'i').
 */
export function rankToUsiChar(rank: number): string {
  return String.fromCharCode(96 + rank);
}

/**
 * Converts a USI rank char ('a'-'i') to 1-based number (1-9).
 */
export function usiCharToRank(char: string): number {
  return char.charCodeAt(0) - 96;
}

/**
 * Checks if coordinates are within the 9x9 Shogi board boundaries.
 */
export function isInsideBoard(file: number, rank: number): boolean {
  return file >= 1 && file <= 9 && rank >= 1 && rank <= 9;
}

/**
 * Determines whether a piece can or must promote when moving between fromRank and toRank.
 */
export function checkPromotion(
  pieceChar: string,
  fromRank: number,
  toRank: number,
  color: Color
): { canPromote: boolean; forcePromote: boolean } {
  const upper = pieceChar.toUpperCase();
  // Already promoted or king/gold cannot promote
  if (pieceChar.startsWith('+') || upper === 'K' || upper === 'G') {
    return { canPromote: false, forcePromote: false };
  }

  const isEnemyZone = color === 'b' ? toRank <= 3 || fromRank <= 3 : toRank >= 7 || fromRank >= 7;
  if (!isEnemyZone) {
    return { canPromote: false, forcePromote: false };
  }

  // Mandatory promotion conditions
  let forcePromote = false;
  if (color === 'b') {
    if (upper === 'P' || upper === 'L') {
      forcePromote = toRank === 1;
    } else if (upper === 'N') {
      forcePromote = toRank <= 2;
    }
  } else {
    if (upper === 'P' || upper === 'L') {
      forcePromote = toRank === 9;
    } else if (upper === 'N') {
      forcePromote = toRank >= 8;
    }
  }

  return { canPromote: true, forcePromote };
}

/**
 * Calculates legal destination squares for a piece at the specified square.
 */
export function getLegalMovesForSquare(board: ShogiBoard, square: Square): TargetSquare[] {
  const piece = board.getSquare(square.file, square.rank);
  if (!piece) return [];

  const isSentePiece = piece === piece.toUpperCase();
  const color: Color = isSentePiece ? 'b' : 'w';
  const baseType = piece.toUpperCase();

  const results: TargetSquare[] = [];

  const addMoveIfValid = (targetFile: number, targetRank: number): boolean => {
    if (!isInsideBoard(targetFile, targetRank)) return false;
    const destPiece = board.getSquare(targetFile, targetRank);
    if (destPiece) {
      const isDestSente = destPiece === destPiece.toUpperCase();
      // Blocked by friendly piece
      if (isDestSente === isSentePiece) return false;
    }

    const { canPromote, forcePromote } = checkPromotion(piece, square.rank, targetRank, color);
    results.push({
      to: { file: targetFile, rank: targetRank },
      canPromote,
      forcePromote,
    });

    // If square was occupied by opponent piece, cannot step further along this ray
    return destPiece === null;
  };

  const addRay = (df: number, dr: number) => {
    let f = square.file + df;
    let r = square.rank + dr;
    while (addMoveIfValid(f, r)) {
      f += df;
      r += dr;
    }
  };

  const fwd = color === 'b' ? -1 : 1;

  switch (baseType) {
    case 'P': // Pawn: 1 square forward
      addMoveIfValid(square.file, square.rank + fwd);
      break;

    case 'L': // Lance: forward ray
      addRay(0, fwd);
      break;

    case 'N': // Knight: 2 forward, 1 left or right
      addMoveIfValid(square.file - 1, square.rank + fwd * 2);
      addMoveIfValid(square.file + 1, square.rank + fwd * 2);
      break;

    case 'S': // Silver: 5 directions (3 forward diagonals/front, 2 backward diagonals)
      addMoveIfValid(square.file - 1, square.rank + fwd);
      addMoveIfValid(square.file, square.rank + fwd);
      addMoveIfValid(square.file + 1, square.rank + fwd);
      addMoveIfValid(square.file - 1, square.rank - fwd);
      addMoveIfValid(square.file + 1, square.rank - fwd);
      break;

    case 'G': // Gold & promoted minors
    case '+P':
    case '+L':
    case '+N':
    case '+S':
      // 6 directions: 3 forward, 2 sideways, 1 backward
      addMoveIfValid(square.file - 1, square.rank + fwd);
      addMoveIfValid(square.file, square.rank + fwd);
      addMoveIfValid(square.file + 1, square.rank + fwd);
      addMoveIfValid(square.file - 1, square.rank);
      addMoveIfValid(square.file + 1, square.rank);
      addMoveIfValid(square.file, square.rank - fwd);
      break;

    case 'K': // King: all 8 directions
      for (let df = -1; df <= 1; df++) {
        for (let dr = -1; dr <= 1; dr++) {
          if (df !== 0 || dr !== 0) {
            addMoveIfValid(square.file + df, square.rank + dr);
          }
        }
      }
      break;

    case 'R': // Rook: orthogonal rays
      addRay(1, 0);
      addRay(-1, 0);
      addRay(0, 1);
      addRay(0, -1);
      break;

    case 'B': // Bishop: diagonal rays
      addRay(1, 1);
      addRay(1, -1);
      addRay(-1, 1);
      addRay(-1, -1);
      break;

    case '+R': // Promoted Rook (Dragon): Rook + 1 square diagonally
      addRay(1, 0);
      addRay(-1, 0);
      addRay(0, 1);
      addRay(0, -1);
      addMoveIfValid(square.file + 1, square.rank + 1);
      addMoveIfValid(square.file + 1, square.rank - 1);
      addMoveIfValid(square.file - 1, square.rank + 1);
      addMoveIfValid(square.file - 1, square.rank - 1);
      break;

    case '+B': // Promoted Bishop (Horse): Bishop + 1 square orthogonally
      addRay(1, 1);
      addRay(1, -1);
      addRay(-1, 1);
      addRay(-1, -1);
      addMoveIfValid(square.file + 1, square.rank);
      addMoveIfValid(square.file - 1, square.rank);
      addMoveIfValid(square.file, square.rank + 1);
      addMoveIfValid(square.file, square.rank - 1);
      break;
  }

  return results;
}

/**
 * Calculates legal empty drop squares for a piece from hand.
 */
export function getLegalDropsForPiece(
  board: ShogiBoard,
  pieceUpper: string,
  color: Color
): Square[] {
  const drops: Square[] = [];
  const upper = pieceUpper.toUpperCase();

  // Find files that already have an unpromoted friendly pawn (二歩 / Nifu check)
  const nifuFiles = new Set<number>();
  if (upper === 'P') {
    const friendlyPawn = color === 'b' ? 'P' : 'p';
    for (let f = 1; f <= 9; f++) {
      for (let r = 1; r <= 9; r++) {
        if (board.getSquare(f, r) === friendlyPawn) {
          nifuFiles.add(f);
          break;
        }
      }
    }
  }

  for (let f = 1; f <= 9; f++) {
    if (upper === 'P' && nifuFiles.has(f)) continue;

    for (let r = 1; r <= 9; r++) {
      if (board.getSquare(f, r) !== null) continue;

      // Cannot drop where piece has no legal forward moves
      if (color === 'b') {
        if ((upper === 'P' || upper === 'L') && r === 1) continue;
        if (upper === 'N' && r <= 2) continue;
      } else {
        if ((upper === 'P' || upper === 'L') && r === 9) continue;
        if (upper === 'N' && r >= 8) continue;
      }

      drops.push({ file: f, rank: r });
    }
  }

  return drops;
}

/**
 * Parses a standard USI move string (e.g. "7g7f", "8h2b+", "P*5e") into a ShogiMove object.
 */
/**
 * Single source of truth for whether a move is eligible for promotion.
 */
export function canPromoteMove(params: {
  fromY: number;
  toY: number;
  piece: string;
  isDrop: boolean;
  isSente: boolean;
}): boolean {
  const { fromY, toY, piece, isDrop, isSente } = params;
  if (isDrop || fromY <= 0 || toY <= 0) return false;
  const promotable = ['FU', 'KY', 'KE', 'GI', 'KA', 'HI', 'P', 'L', 'N', 'S', 'B', 'R'];
  if (!promotable.includes(piece.toUpperCase())) return false;
  return isSente ? fromY <= 3 || toY <= 3 : fromY >= 7 || toY >= 7;
}

/**
 * Strips spurious "不成" from a Japanese move string when the move is not eligible for promotion.
 */
export function sanitizeJapaneseMoveFunari(
  japaneseMove: string,
  usi: string,
  isSente: boolean
): string {
  if (!japaneseMove.includes('不成')) return japaneseMove;
  if (usi.includes('*') || usi.endsWith('+')) {
    return japaneseMove.replace(/不成/g, '');
  }
  const match = usi.match(/^[1-9]([a-i])[1-9]([a-i])$/);
  if (!match || !match[1] || !match[2]) return japaneseMove;
  const fromY = match[1].charCodeAt(0) - 96;
  const toY = match[2].charCodeAt(0) - 96;
  const nonPromotableKanji = ['金', '玉', '王', 'と', '杏', '圭', '全', '馬', '竜', '龍'];
  const isNonPromotable = nonPromotableKanji.some((k) => japaneseMove.includes(k));
  const canPromote =
    !isNonPromotable &&
    canPromoteMove({ fromY, toY, piece: 'FU', isDrop: false, isSente });
  return canPromote ? japaneseMove : japaneseMove.replace(/不成/g, '');
}

export function parseUsiMove(
  usi: string,
  board: ShogiBoard,
  ply: number,
  color: Color,
  previousDestination?: Square
): ShogiMove | null {
  const trimmed = usi.trim();
  if (!trimmed || trimmed === 'none' || trimmed === 'resign') return null;

  const prefix = color === 'b' ? '▲' : '△';

  // Drop move: e.g. "P*5e"
  const dropMatch = trimmed.match(/^([A-Za-z])\*([1-9])([a-i])$/);
  if (dropMatch && dropMatch[1] && dropMatch[2] && dropMatch[3]) {
    const pieceChar = dropMatch[1].toUpperCase();
    const toFile = parseInt(dropMatch[2], 10);
    const toRank = usiCharToRank(dropMatch[3]);
    const pieceType = PIECE_TYPE_MAP[pieceChar] ?? 'FU';

    const isSameDest =
      previousDestination &&
      previousDestination.file === toFile &&
      previousDestination.rank === toRank;

    const destStr = isSameDest ? '同　' : `${FILE_KANJI[toFile]}${RANK_KANJI[toRank]}`;
    const kifString = `${prefix}${destStr}${PIECE_KANJI_SIMPLE[pieceType]}打`;

    return {
      ply,
      color,
      to: { file: toFile, rank: toRank },
      piece: pieceType,
      isDrop: true,
      promote: false,
      kifString,
      sfenMove: trimmed,
    };
  }

  // Board movement: e.g. "7g7f" or "8h2b+"
  const moveMatch = trimmed.match(/^([1-9])([a-i])([1-9])([a-i])(\+)?$/);
  if (moveMatch && moveMatch[1] && moveMatch[2] && moveMatch[3] && moveMatch[4]) {
    const fromFile = parseInt(moveMatch[1], 10);
    const fromRank = usiCharToRank(moveMatch[2]);
    const toFile = parseInt(moveMatch[3], 10);
    const toRank = usiCharToRank(moveMatch[4]);
    const promote = Boolean(moveMatch[5]);

    const sourcePiece = board.getSquare(fromFile, fromRank);
    let rawType: PieceType = 'FU';
    if (sourcePiece) {
      const baseChar = sourcePiece.toUpperCase();
      rawType = PIECE_TYPE_MAP[baseChar] ?? 'FU';
    } else {
      // Fallback: Infer piece from geometric move vector if board square is empty/out-of-sync
      const dx = Math.abs(toFile - fromFile);
      const dy = toRank - fromRank;
      if (dx === 1 && ((color === 'b' && dy === -2) || (color === 'w' && dy === 2))) {
        rawType = 'KE';
      } else if (dx > 1 || Math.abs(dy) > 1) {
        rawType = dx === Math.abs(dy) ? 'KA' : 'HI';
      } else {
        rawType = 'FU';
      }
    }

    let pieceType = rawType;
    if (promote) {
      if (rawType === 'FU') pieceType = 'TO';
      else if (rawType === 'KY') pieceType = 'NY';
      else if (rawType === 'KE') pieceType = 'NK';
      else if (rawType === 'GI') pieceType = 'NG';
      else if (rawType === 'KA') pieceType = 'UM';
      else if (rawType === 'HI') pieceType = 'RY';
    }

    const isSameDest =
      previousDestination &&
      previousDestination.file === toFile &&
      previousDestination.rank === toRank;

    const destStr = isSameDest ? '同　' : `${FILE_KANJI[toFile]}${RANK_KANJI[toRank]}`;
    const pieceKanji = PIECE_KANJI_SIMPLE[promote ? rawType : pieceType];
    const promoteStr = promote ? '成' : '';
    const kifString = `${prefix}${destStr}${pieceKanji}${promoteStr}(${fromFile}${fromRank})`;

    return {
      ply,
      color,
      from: { file: fromFile, rank: fromRank },
      to: { file: toFile, rank: toRank },
      piece: pieceType,
      isDrop: false,
      promote,
      kifString,
      sfenMove: trimmed,
    };
  }

  return null;
}

/**
 * Creates a ShogiMove from an interactive user action (board move or drop).
 */
export function createInteractiveMove(
  board: ShogiBoard,
  ply: number,
  color: Color,
  from: Square | undefined,
  to: Square,
  promote: boolean,
  dropPieceChar?: string,
  previousDestination?: Square
): ShogiMove {
  const prefix = color === 'b' ? '▲' : '△';

  if (from) {
    const sfenMove = `${from.file}${rankToUsiChar(from.rank)}${to.file}${rankToUsiChar(to.rank)}${promote ? '+' : ''}`;
    const parsed = parseUsiMove(sfenMove, board, ply, color, previousDestination);
    if (parsed) return parsed;

    return {
      ply,
      color,
      from,
      to,
      piece: 'FU',
      isDrop: false,
      promote,
      kifString: `${prefix}${FILE_KANJI[to.file]}${RANK_KANJI[to.rank]}動(${from.file}${from.rank})`,
      sfenMove,
    };
  } else {
    const pieceUpper = (dropPieceChar ?? 'P').toUpperCase();
    const sfenMove = `${pieceUpper}*${to.file}${rankToUsiChar(to.rank)}`;
    const parsed = parseUsiMove(sfenMove, board, ply, color, previousDestination);
    if (parsed) return parsed;

    return {
      ply,
      color,
      to,
      piece: PIECE_TYPE_MAP[pieceUpper] ?? 'FU',
      isDrop: true,
      promote: false,
      kifString: `${prefix}${FILE_KANJI[to.file]}${RANK_KANJI[to.rank]}${pieceUpper}打`,
      sfenMove,
    };
  }
}

/**
 * Formats any ShogiMove into standard Japanese KIF move notation (e.g. "▲７六歩(77)" or "△８四歩(83)").
 */
export function formatShogiMove(
  move: ShogiMove,
  previousDestination?: Square
): string {
  const prefix = move.color === 'b' ? '▲' : '△';

  // If kifString is already standard Japanese notation (contains kanji)
  if (move.kifString && /[一二三四五六七八九歩香桂銀金角飛玉王と馬竜打成同]/.test(move.kifString)) {
    if (move.kifString.startsWith('▲') || move.kifString.startsWith('△')) {
      return move.kifString;
    }
    return `${prefix}${move.kifString}`;
  }

  // Fallback: construct standard Japanese Shogi notation from move properties
  const isSameDest =
    previousDestination &&
    previousDestination.file === move.to.file &&
    previousDestination.rank === move.to.rank;

  const destStr = isSameDest
    ? '同　'
    : `${FILE_KANJI[move.to.file] ?? move.to.file}${RANK_KANJI[move.to.rank] ?? move.to.rank}`;
  const pieceKanji = PIECE_KANJI_SIMPLE[move.piece] ?? '歩';

  if (move.isDrop) {
    return `${prefix}${destStr}${pieceKanji}打`;
  }

  const promoteStr = move.promote ? '成' : '';
  const fromStr = move.from ? `(${move.from.file}${move.from.rank})` : '';

  return `${prefix}${destStr}${pieceKanji}${promoteStr}${fromStr}`;
}

/**
 * Checks whether a target square is attacked/defended by any piece of the specified color.
 */
export function isSquareAttacked(board: ShogiBoard, target: Square, byColor: Color): boolean {
  const fwd = byColor === 'b' ? -1 : 1;
  const tf = target.file;
  const tr = target.rank;

  for (let f = 1; f <= 9; f++) {
    for (let r = 1; r <= 9; r++) {
      const piece = board.getSquare(f, r);
      if (!piece) continue;
      const pieceColor: Color = piece === piece.toUpperCase() ? 'b' : 'w';
      if (pieceColor !== byColor) continue;

      const upper = piece.toUpperCase();
      const df = tf - f;
      const dr = tr - r;

      switch (upper) {
        case 'P': // Pawn: 1 forward step
          if (df === 0 && dr === fwd) return true;
          break;

        case 'L': // Lance: forward ray
          if (df === 0 && dr * fwd > 0) {
            let blocked = false;
            let step = r + fwd;
            while (step !== tr) {
              if (board.getSquare(f, step) !== null) {
                blocked = true;
                break;
              }
              step += fwd;
            }
            if (!blocked) return true;
          }
          break;

        case 'N': // Knight: 2 forward, 1 left or right
          if (Math.abs(df) === 1 && dr === fwd * 2) return true;
          break;

        case 'S': // Silver: 3 forward, 2 backward diagonals
          if (
            (dr === fwd && Math.abs(df) <= 1) ||
            (dr === -fwd && Math.abs(df) === 1)
          ) {
            return true;
          }
          break;

        case 'G': // Gold & promoted minors (+P, +L, +N, +S)
        case '+P':
        case '+L':
        case '+N':
        case '+S':
          if (
            (dr === fwd && Math.abs(df) <= 1) ||
            (dr === 0 && Math.abs(df) === 1) ||
            (dr === -fwd && df === 0)
          ) {
            return true;
          }
          break;

        case 'K': // King: all 8 adjacent squares
          if (Math.abs(df) <= 1 && Math.abs(dr) <= 1 && (df !== 0 || dr !== 0)) {
            return true;
          }
          break;

        case 'B': // Bishop: diagonal rays
          if (Math.abs(df) === Math.abs(dr) && df !== 0) {
            let blocked = false;
            const stepF = Math.sign(df);
            const stepR = Math.sign(dr);
            let curF = f + stepF;
            let curR = r + stepR;
            while (curF !== tf || curR !== tr) {
              if (board.getSquare(curF, curR) !== null) {
                blocked = true;
                break;
              }
              curF += stepF;
              curR += stepR;
            }
            if (!blocked) return true;
          }
          break;

        case '+B': // Promoted Bishop (Horse): Bishop rays + 1 orthogonal step
          if (Math.abs(df) + Math.abs(dr) === 1) return true;
          if (Math.abs(df) === Math.abs(dr) && df !== 0) {
            let blocked = false;
            const stepF = Math.sign(df);
            const stepR = Math.sign(dr);
            let curF = f + stepF;
            let curR = r + stepR;
            while (curF !== tf || curR !== tr) {
              if (board.getSquare(curF, curR) !== null) {
                blocked = true;
                break;
              }
              curF += stepF;
              curR += stepR;
            }
            if (!blocked) return true;
          }
          break;

        case 'R': // Rook: orthogonal rays
          if ((df === 0 || dr === 0) && (df !== 0 || dr !== 0)) {
            let blocked = false;
            const stepF = Math.sign(df);
            const stepR = Math.sign(dr);
            let curF = f + stepF;
            let curR = r + stepR;
            while (curF !== tf || curR !== tr) {
              if (board.getSquare(curF, curR) !== null) {
                blocked = true;
                break;
              }
              curF += stepF;
              curR += stepR;
            }
            if (!blocked) return true;
          }
          break;

        case '+R': // Promoted Rook (Dragon): Rook rays + 1 diagonal step
          if (Math.abs(df) === 1 && Math.abs(dr) === 1) return true;
          if ((df === 0 || dr === 0) && (df !== 0 || dr !== 0)) {
            let blocked = false;
            const stepF = Math.sign(df);
            const stepR = Math.sign(dr);
            let curF = f + stepF;
            let curR = r + stepR;
            while (curF !== tf || curR !== tr) {
              if (board.getSquare(curF, curR) !== null) {
                blocked = true;
                break;
              }
              curF += stepF;
              curR += stepR;
            }
            if (!blocked) return true;
          }
          break;
      }
    }
  }

  return false;
}

/**
 * Finds the King square for the given color.
 */
export function findKing(board: ShogiBoard, color: Color): Square | null {
  const kingChar = color === 'b' ? 'K' : 'k';
  for (let f = 1; f <= 9; f++) {
    for (let r = 1; r <= 9; r++) {
      if (board.getSquare(f, r) === kingChar) {
        return { file: f, rank: r };
      }
    }
  }
  return null;
}

/**
 * Checks if the King of the specified color is currently in check.
 */
export function isKingInCheck(board: ShogiBoard, color: Color): boolean {
  const kingSquare = findKing(board, color);
  if (!kingSquare) return false;
  const enemyColor: Color = color === 'b' ? 'w' : 'b';
  return isSquareAttacked(board, kingSquare, enemyColor);
}

/**
 * Tests if executing a move leaves own King in check (suicide/illegal move).
 */
function doesMoveLeaveKingInCheck(
  board: ShogiBoard,
  from: Square,
  to: Square,
  promote: boolean,
  color: Color
): boolean {
  const piece = board.getSquare(from.file, from.rank);
  if (!piece) return true;

  const movingPiece = piece;
  const destPiece = board.getSquare(to.file, to.rank);

  let finalPiece = movingPiece;
  if (promote && !movingPiece.startsWith('+')) {
    finalPiece = ('+' + movingPiece) as BoardPiece;
  }

  board.setSquare(from.file, from.rank, null);
  board.setSquare(to.file, to.rank, finalPiece);

  const inCheck = isKingInCheck(board, color);

  board.setSquare(from.file, from.rank, movingPiece);
  board.setSquare(to.file, to.rank, destPiece);

  return inCheck;
}

/**
 * Tests if dropping a piece leaves own King in check.
 */
function doesDropLeaveKingInCheck(
  board: ShogiBoard,
  square: Square,
  pieceUpper: string,
  color: Color
): boolean {
  const pieceChar = (color === 'b' ? pieceUpper.toUpperCase() : pieceUpper.toLowerCase()) as BoardPiece;
  board.setSquare(square.file, square.rank, pieceChar);
  const inCheck = isKingInCheck(board, color);
  board.setSquare(square.file, square.rank, null);
  return inCheck;
}

/**
 * Checks whether dropping a pawn causes Uchifuzume (pawn drop checkmate, illegal in Shogi).
 */
function isPawnDropCheckmate(board: ShogiBoard, square: Square, color: Color): boolean {
  const oppColor: Color = color === 'b' ? 'w' : 'b';
  const pieceChar = (color === 'b' ? 'P' : 'p') as BoardPiece;

  board.setSquare(square.file, square.rank, pieceChar);
  const oppInCheck = isKingInCheck(board, oppColor);
  let isMate = false;
  if (oppInCheck) {
    isMate = !hasAnyStrictLegalMove(board, oppColor, false);
  }
  board.setSquare(square.file, square.rank, null);
  return isMate;
}

/**
 * Calculates strictly legal moves for a piece on the board,
 * eliminating suicide moves and moves that do not evade check.
 */
export function getStrictLegalMovesForSquare(board: ShogiBoard, square: Square): TargetSquare[] {
  const piece = board.getSquare(square.file, square.rank);
  if (!piece) return [];
  const color: Color = piece === piece.toUpperCase() ? 'b' : 'w';

  const pseudoMoves = getLegalMovesForSquare(board, square);
  return pseudoMoves.filter((m) => {
    return !doesMoveLeaveKingInCheck(board, square, m.to, m.forcePromote, color);
  });
}

/**
 * Calculates strictly legal drop squares for a piece from hand,
 * eliminating drops that leave king in check and Uchifuzume.
 */
export function getStrictLegalDropsForPiece(
  board: ShogiBoard,
  pieceUpper: string,
  color: Color
): Square[] {
  const pseudoDrops = getLegalDropsForPiece(board, pieceUpper, color);
  const upper = pieceUpper.toUpperCase();

  return pseudoDrops.filter((sq) => {
    if (doesDropLeaveKingInCheck(board, sq, upper, color)) {
      return false;
    }
    if (upper === 'P') {
      if (isPawnDropCheckmate(board, sq, color)) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Determines whether the specified player has at least one strictly legal move.
 */
export function hasAnyStrictLegalMove(
  board: ShogiBoard,
  color: Color,
  checkUchifuzume = true
): boolean {
  // 1. Check all board pieces belonging to color
  for (let f = 1; f <= 9; f++) {
    for (let r = 1; r <= 9; r++) {
      const piece = board.getSquare(f, r);
      if (!piece) continue;
      const pieceColor: Color = piece === piece.toUpperCase() ? 'b' : 'w';
      if (pieceColor !== color) continue;

      const pseudoMoves = getLegalMovesForSquare(board, { file: f, rank: r });
      for (const m of pseudoMoves) {
        if (!doesMoveLeaveKingInCheck(board, { file: f, rank: r }, m.to, m.forcePromote, color)) {
          return true;
        }
      }
    }
  }

  // 2. Check pieces in hand
  const hand = board.getHand(color);
  for (const [pieceKey, count] of Object.entries(hand)) {
    if (count <= 0) continue;
    const pseudoDrops = getLegalDropsForPiece(board, pieceKey, color);
    for (const sq of pseudoDrops) {
      if (!doesDropLeaveKingInCheck(board, sq, pieceKey, color)) {
        if (checkUchifuzume && pieceKey.toUpperCase() === 'P') {
          if (isPawnDropCheckmate(board, sq, color)) continue;
        }
        return true;
      }
    }
  }

  return false;
}

/**
 * Checks if the specified color is checkmated (king in check and no legal moves).
 */
export function isCheckmate(board: ShogiBoard, color: Color): boolean {
  return isKingInCheck(board, color) && !hasAnyStrictLegalMove(board, color);
}

/**
 * Evaluates game termination for the side to move (checkmate or no legal moves).
 */
export function isGameOver(
  board: ShogiBoard,
  color: Color
): { isOver: boolean; isCheckmate: boolean } {
  const hasMoves = hasAnyStrictLegalMove(board, color);
  if (!hasMoves) {
    const inCheck = isKingInCheck(board, color);
    return { isOver: true, isCheckmate: inCheck };
  }
  return { isOver: false, isCheckmate: false };
}

export interface LegalUsiMove {
  usi: string;
  from?: Square;
  to: Square;
  promote: boolean;
  dropPiece?: string;
  scoreWeight: number; // Heuristic weighting for reasonable sparring moves
}

/**
 * Returns all strictly legal moves for the current side to move, formatted as USI strings.
 */
export function getAllStrictLegalMoves(board: ShogiBoard, color: Color): LegalUsiMove[] {
  const moves: LegalUsiMove[] = [];

  // 1. Board moves
  for (let f = 1; f <= 9; f++) {
    for (let r = 1; r <= 9; r++) {
      const piece = board.getSquare(f, r);
      if (!piece) continue;
      const pieceColor: Color = piece === piece.toUpperCase() ? 'b' : 'w';
      if (pieceColor !== color) continue;

      const fromSq = { file: f, rank: r };
      const targets = getStrictLegalMovesForSquare(board, fromSq);

      for (const t of targets) {
        const destPiece = board.getSquare(t.to.file, t.to.rank);
        let captureScore = 0;
        if (destPiece) {
          const destUpper = destPiece.toUpperCase();
          if (destUpper === 'K') captureScore = 10000;
          else if (destUpper.includes('R')) captureScore = 500;
          else if (destUpper.includes('B')) captureScore = 450;
          else if (destUpper.includes('G') || destUpper.includes('S')) captureScore = 300;
          else if (destUpper.includes('N') || destUpper.includes('L')) captureScore = 200;
          else captureScore = 100;
        }

        const centerDistance = Math.abs(5 - t.to.file) + Math.abs(5 - t.to.rank);
        const centerBonus = Math.max(0, 10 - centerDistance);

        // Check if destination is attacked by opponent
        const oppColor: Color = color === 'b' ? 'w' : 'b';
        const isTargetAttacked = isSquareAttacked(board, t.to, oppColor);
        let safetyPenalty = 0;
        if (isTargetAttacked) {
          const movingPieceUpper = piece.toUpperCase();
          if (movingPieceUpper.includes('K')) {
            safetyPenalty = 2000;
          } else if (movingPieceUpper.includes('R') || movingPieceUpper.includes('B')) {
            safetyPenalty = 600;
          } else if (movingPieceUpper.includes('G') || movingPieceUpper.includes('S')) {
            safetyPenalty = 300;
          } else {
            safetyPenalty = 80;
          }
        }

        // Development bonus in opening / early game
        let devBonus = 0;
        const upper = piece.toUpperCase();
        const ply = board.getPly();
        if (ply <= 24) {
          if (upper === 'S' || upper === 'G') {
            devBonus = 12; // Encourage activating silver and gold generals
          } else if (upper === 'B') {
            devBonus = 15; // Encourage bishop diagonal opening / activation
          } else if (upper === 'P') {
            // Discourage premature pawn pushes far into enemy territory without pieces backing it up
            if (color === 'w' && t.to.rank >= 5) {
              devBonus = -10;
            } else if (color === 'b' && t.to.rank <= 5) {
              devBonus = -10;
            }
          }
        }

        const baseScore = captureScore + centerBonus + devBonus - safetyPenalty;

        if (t.forcePromote) {
          const usi = `${f}${rankToUsiChar(r)}${t.to.file}${rankToUsiChar(t.to.rank)}+`;
          moves.push({
            usi,
            from: fromSq,
            to: t.to,
            promote: true,
            scoreWeight: baseScore + 35,
          });
        } else if (t.canPromote) {
          // Promote option
          moves.push({
            usi: `${f}${rankToUsiChar(r)}${t.to.file}${rankToUsiChar(t.to.rank)}+`,
            from: fromSq,
            to: t.to,
            promote: true,
            scoreWeight: baseScore + 30,
          });
          // Non-promote option
          moves.push({
            usi: `${f}${rankToUsiChar(r)}${t.to.file}${rankToUsiChar(t.to.rank)}`,
            from: fromSq,
            to: t.to,
            promote: false,
            scoreWeight: baseScore,
          });
        } else {
          moves.push({
            usi: `${f}${rankToUsiChar(r)}${t.to.file}${rankToUsiChar(t.to.rank)}`,
            from: fromSq,
            to: t.to,
            promote: false,
            scoreWeight: baseScore,
          });
        }
      }
    }
  }

  // 2. Drop moves
  const hand = board.getHand(color);
  for (const [pieceKey, count] of Object.entries(hand)) {
    if (count <= 0) continue;
    const dropSqs = getStrictLegalDropsForPiece(board, pieceKey, color);
    const pieceUpper = pieceKey.toUpperCase();

    for (const sq of dropSqs) {
      const usi = `${pieceUpper}*${sq.file}${rankToUsiChar(sq.rank)}`;
      const centerDist = Math.abs(5 - sq.file) + Math.abs(5 - sq.rank);
      const oppColor: Color = color === 'b' ? 'w' : 'b';
      const isAttacked = isSquareAttacked(board, sq, oppColor);
      const penalty = isAttacked ? 100 : 0;
      moves.push({
        usi,
        to: sq,
        promote: false,
        dropPiece: pieceKey,
        scoreWeight: 5 - centerDist - penalty,
      });
    }
  }

  return moves;
}

/**
 * Selects a high-quality heuristic move from legal moves when Wasm AI engine is restricted.
 */
export function pickFallbackAiMove(board: ShogiBoard, color: Color): string | null {
  const legalMoves = getAllStrictLegalMoves(board, color);
  if (legalMoves.length === 0) return null;

  // Sort by heuristic weight descending, with slight randomness for variability
  legalMoves.sort((a, b) => {
    const diff = b.scoreWeight - a.scoreWeight;
    if (diff !== 0) return diff;
    return 0.5 - Math.random();
  });

  return legalMoves[0]?.usi ?? null;
}

