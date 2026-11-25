/**
 * Pure Engine Logic for 5-Type Selective Hints in SRS Drills.
 * Computes individual hint clues (Rank, File, Piece, Board/Hand, Answer)
 * and calculates penalty weights for SM-2 spaced repetition scoring.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import { Color, PieceType, ShogiMove, Square } from '../types/shogi';
import { HintType } from '../types/srs';
import { ShogiBoard } from './shogiBoard';

export interface RankHintResult {
  rankRange: '1-3' | '4-6' | '7-9' | 'drop';
  labelKey: string;
  highlightSquares: Square[];
  isDrop: boolean;
}

export interface FileHintResult {
  fileRange: '1-3' | '4-6' | '7-9' | 'drop';
  labelKey: string;
  highlightSquares: Square[];
  isDrop: boolean;
}

export interface PieceHintResult {
  piece: PieceType;
  labelKey: string;
  candidateSquares: Square[];
  inHand: boolean;
}

export interface BoardOrHandHintResult {
  isDrop: boolean;
  labelKey: string;
}

export interface AnswerHintResult {
  sfenMove: string;
  kifString: string;
  to: Square;
  from?: Square;
  isDrop: boolean;
  highlightSquares: Square[];
}

/**
 * Penalty weights for SRS scoring when hints are revealed.
 * Lightweight clues carry 1 pt, piece identity carries 2 pts,
 * and direct answer reveal carries 5 pts (maximum difficulty penalty).
 */
export const HINT_PENALTY_WEIGHTS: Record<HintType, number> = {
  rank: 1,
  file: 1,
  boardOrHand: 1,
  piece: 2,
  answer: 5,
};

/**
 * Generates all squares covering a specified range of ranks (horizontal band).
 */
function getRankBandSquares(minRank: number, maxRank: number): Square[] {
  const squares: Square[] = [];
  for (let r = minRank; r <= maxRank; r++) {
    for (let f = 1; f <= 9; f++) {
      squares.push({ file: f, rank: r });
    }
  }
  return squares;
}

/**
 * Generates all squares covering a specified range of files.
 */
function getFileBandSquares(minFile: number, maxFile: number): Square[] {
  const squares: Square[] = [];
  for (let f = minFile; f <= maxFile; f++) {
    for (let r = 1; r <= 9; r++) {
      squares.push({ file: f, rank: r });
    }
  }
  return squares;
}

/**
 * Extracts Rank Area hint (Upper 1-3, Middle 4-6, Lower 7-9).
 * Highlights the corresponding 3-row tier of the board based on piece origin (move.from).
 * For hand drops (move.isDrop or !move.from), indicates drop from hand without square highlights.
 */
export function getRankHint(move: ShogiMove, userColor: Color = 'b'): RankHintResult {
  if (move.isDrop || !move.from) {
    return {
      rankRange: 'drop',
      labelKey: 'srs.hint_rank_drop',
      highlightSquares: [],
      isDrop: true,
    };
  }

  const { rank } = move.from;

  if (rank <= 3) {
    return {
      rankRange: '1-3',
      labelKey: userColor === 'b' ? 'srs.hint_rank_1_3_sente' : 'srs.hint_rank_1_3_gote',
      highlightSquares: getRankBandSquares(1, 3),
      isDrop: false,
    };
  }

  if (rank <= 6) {
    return {
      rankRange: '4-6',
      labelKey: 'srs.hint_rank_4_6',
      highlightSquares: getRankBandSquares(4, 6),
      isDrop: false,
    };
  }

  return {
    rankRange: '7-9',
    labelKey: userColor === 'b' ? 'srs.hint_rank_7_9_sente' : 'srs.hint_rank_7_9_gote',
    highlightSquares: getRankBandSquares(7, 9),
    isDrop: false,
  };
}

/**
 * Extracts File Area hint (Right 1-3, Center 4-6, Left 7-9).
 * Highlights the corresponding 3-column band across the board based on piece origin (move.from).
 * For hand drops (move.isDrop or !move.from), indicates drop from hand without square highlights.
 */
export function getFileHint(move: ShogiMove, userColor: Color = 'b'): FileHintResult {
  if (move.isDrop || !move.from) {
    return {
      fileRange: 'drop',
      labelKey: 'srs.hint_file_drop',
      highlightSquares: [],
      isDrop: true,
    };
  }

  const { file } = move.from;

  if (file <= 3) {
    return {
      fileRange: '1-3',
      labelKey: userColor === 'b' ? 'srs.hint_file_1_3_sente' : 'srs.hint_file_1_3_gote',
      highlightSquares: getFileBandSquares(1, 3),
      isDrop: false,
    };
  }

  if (file <= 6) {
    return {
      fileRange: '4-6',
      labelKey: 'srs.hint_file_4_6',
      highlightSquares: getFileBandSquares(4, 6),
      isDrop: false,
    };
  }

  return {
    fileRange: '7-9',
    labelKey: userColor === 'b' ? 'srs.hint_file_7_9_sente' : 'srs.hint_file_7_9_gote',
    highlightSquares: getFileBandSquares(7, 9),
    isDrop: false,
  };
}

/**
 * Checks if a piece on the board matches the piece type and side of the move,
 * strictly distinguishing promoted pieces (e.g., 'TO' !== 'FU', 'UM' !== 'KA').
 */
function isMatchingBoardPiece(boardChar: string, piece: PieceType, color: Color): boolean {
  if (!boardChar) return false;

  const isSentePiece = boardChar === boardChar.toUpperCase();
  const pieceColor: Color = isSentePiece ? 'b' : 'w';
  if (pieceColor !== color) return false;

  const normalized = boardChar.toUpperCase();

  switch (piece) {
    case 'FU': return normalized === 'P';
    case 'KY': return normalized === 'L';
    case 'KE': return normalized === 'N';
    case 'GI': return normalized === 'S';
    case 'KI': return normalized === 'G';
    case 'KA': return normalized === 'B';
    case 'HI': return normalized === 'R';
    case 'OU': return normalized === 'K';
    case 'TO': return normalized === '+P';
    case 'NY': return normalized === '+L';
    case 'NK': return normalized === '+N';
    case 'NG': return normalized === '+S';
    case 'UM': return normalized === '+B';
    case 'RY': return normalized === '+R';
    default: return false;
  }
}

/**
 * Extracts Piece Type hint and locates all candidate piece squares on the board.
 */
export function getPieceHint(move: ShogiMove, board?: ShogiBoard): PieceHintResult {
  const candidateSquares: Square[] = [];
  let inHand = false;

  if (board) {
    for (let r = 1; r <= 9; r++) {
      for (let f = 1; f <= 9; f++) {
        const pieceChar = board.getSquare(f, r);
        if (pieceChar && isMatchingBoardPiece(pieceChar, move.piece, move.color)) {
          candidateSquares.push({ file: f, rank: r });
        }
      }
    }

    const hand = board.getHand(move.color);
    if (hand && typeof hand === 'object') {
      const pieceCount = (hand as Record<string, number>)[move.piece] ?? 0;
      inHand = pieceCount > 0;
    }
  } else if (move.from) {
    candidateSquares.push(move.from);
  }

  return {
    piece: move.piece,
    labelKey: `srs.hint_piece_${move.piece.toLowerCase()}`,
    candidateSquares,
    inHand,
  };
}

/**
 * Extracts Board vs Hand drop hint.
 */
export function getBoardOrHandHint(move: ShogiMove): BoardOrHandHintResult {
  return {
    isDrop: move.isDrop,
    labelKey: move.isDrop ? 'srs.hint_hand_drop' : 'srs.hint_board_move',
  };
}

/**
 * Extracts full Answer hint with board highlight squares and arrow coordinates.
 */
export function getAnswerHint(move: ShogiMove): AnswerHintResult {
  const highlightSquares: Square[] = [move.to];
  if (move.from) {
    highlightSquares.unshift(move.from);
  }

  return {
    sfenMove: move.sfenMove,
    kifString: move.kifString,
    to: move.to,
    from: move.from,
    isDrop: move.isDrop,
    highlightSquares,
  };
}

/**
 * Calculates total penalty score from a set of revealed hints.
 */
export function calculateHintPenalty(revealedHints: Iterable<HintType>): number {
  let penalty = 0;
  for (const hint of revealedHints) {
    penalty += HINT_PENALTY_WEIGHTS[hint] ?? 1;
  }
  return penalty;
}
