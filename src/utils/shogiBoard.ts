/**
 * Lightweight Shogi Board State & SFEN Generator.
 * Tracks 9x9 board squares, piece stands (in-hand), and generates standard SFEN strings.
 * Strictly English code, variables, and comments (Rule 1).
 */

import { Color, PieceType, ShogiMove } from '../types/shogi';

export const INITIAL_HIRATE_SFEN =
  'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1';

export type BoardPiece =
  | 'p' | 'l' | 'n' | 's' | 'g' | 'b' | 'r' | 'k'
  | '+p' | '+l' | '+n' | '+s' | '+b' | '+r'
  | 'P' | 'L' | 'N' | 'S' | 'G' | 'B' | 'R' | 'K'
  | '+P' | '+L' | '+N' | '+S' | '+B' | '+R';

const HAND_ORDER_BLACK = ['R', 'B', 'G', 'S', 'N', 'L', 'P'] as const;
const HAND_ORDER_WHITE = ['r', 'b', 'g', 's', 'n', 'l', 'p'] as const;

const PIECE_TO_BASE: Record<string, string> = {
  '+p': 'p', '+l': 'l', '+n': 'n', '+s': 's', '+b': 'b', '+r': 'r',
  '+P': 'P', '+L': 'L', '+N': 'N', '+S': 'S', '+B': 'B', '+R': 'R',
};

const PIECE_TYPE_TO_CHAR: Record<PieceType, { b: string; w: string }> = {
  FU: { b: 'P', w: 'p' },
  KY: { b: 'L', w: 'l' },
  KE: { b: 'N', w: 'n' },
  GI: { b: 'S', w: 's' },
  KI: { b: 'G', w: 'g' },
  KA: { b: 'B', w: 'b' },
  HI: { b: 'R', w: 'r' },
  OU: { b: 'K', w: 'k' },
  TO: { b: '+P', w: '+p' },
  NY: { b: '+L', w: '+l' },
  NK: { b: '+N', w: '+n' },
  NG: { b: '+S', w: '+s' },
  UM: { b: '+B', w: '+b' },
  RY: { b: '+R', w: '+r' },
};

export class ShogiBoard {
  // 9x9 board: board[rank - 1][file - 1]
  // rank 1..9 (top to bottom), file 1..9 (right to left)
  private squares: (BoardPiece | null)[][];
  private handBlack: Map<string, number>;
  private handWhite: Map<string, number>;
  private turn: Color;
  private ply: number;

  constructor() {
    this.squares = Array.from({ length: 9 }, () => Array(9).fill(null));
    this.handBlack = new Map();
    this.handWhite = new Map();
    this.turn = 'b';
    this.ply = 1;
    this.setupInitialHirate();
  }

  /**
   * Sets up the standard Hirate (even) starting position.
   */
  public setupInitialHirate(): void {
    this.squares = Array.from({ length: 9 }, () => Array(9).fill(null));
    this.handBlack.clear();
    this.handWhite.clear();
    this.turn = 'b';
    this.ply = 1;

    // Rank 1 (Gote back rank)
    const goteBackRank: BoardPiece[] = ['l', 'n', 's', 'g', 'k', 'g', 's', 'n', 'l'];
    for (let f = 1; f <= 9; f++) {
      // index: file 9 is f=9 -> index 8
      const piece = goteBackRank[9 - f];
      if (piece) this.setSquare(f, 1, piece);
    }

    // Rank 2: Rook on 8b (file 8), Bishop on 2b (file 2)
    this.setSquare(8, 2, 'r');
    this.setSquare(2, 2, 'b');

    // Rank 3: Gote Pawns
    for (let f = 1; f <= 9; f++) {
      this.setSquare(f, 3, 'p');
    }

    // Rank 7: Sente Pawns
    for (let f = 1; f <= 9; f++) {
      this.setSquare(f, 7, 'P');
    }

    // Rank 8: Bishop on 8h (file 8), Rook on 2h (file 2)
    this.setSquare(8, 8, 'B');
    this.setSquare(2, 8, 'R');

    // Rank 9 (Sente back rank)
    const senteBackRank: BoardPiece[] = ['L', 'N', 'S', 'G', 'K', 'G', 'S', 'N', 'L'];
    for (let f = 1; f <= 9; f++) {
      const piece = senteBackRank[9 - f];
      if (piece) this.setSquare(f, 9, piece);
    }
  }

  public getSquare(file: number, rank: number): BoardPiece | null {
    if (file < 1 || file > 9 || rank < 1 || rank > 9) return null;
    return this.squares[rank - 1]?.[file - 1] ?? null;
  }

  public setSquare(file: number, rank: number, piece: BoardPiece | null): void {
    if (file < 1 || file > 9 || rank < 1 || rank > 9) return;
    const row = this.squares[rank - 1];
    if (row) {
      row[file - 1] = piece;
    }
  }

  /**
   * Applies a ShogiMove and advances the board state.
   */
  public applyMove(move: ShogiMove): void {
    const isBlack = move.color === 'b';
    const destPiece = this.getSquare(move.to.file, move.to.rank);

    if (move.isDrop || !move.from) {
      // Piece drop from hand
      const pieceChar = PIECE_TYPE_TO_CHAR[move.piece]?.[move.color];
      const baseChar = isBlack
        ? (PIECE_TYPE_TO_CHAR[move.piece]?.b ?? 'P')
        : (PIECE_TYPE_TO_CHAR[move.piece]?.w ?? 'p');

      const hand = isBlack ? this.handBlack : this.handWhite;
      const count = hand.get(baseChar) ?? 0;
      if (count > 1) {
        hand.set(baseChar, count - 1);
      } else {
        hand.delete(baseChar);
      }

      this.setSquare(move.to.file, move.to.rank, (pieceChar ?? (isBlack ? 'P' : 'p')) as BoardPiece);
    } else {
      // Board movement
      const movingPiece = this.getSquare(move.from.file, move.from.rank);
      this.setSquare(move.from.file, move.from.rank, null);

      // Handle capture
      if (destPiece) {
        // Demote if promoted
        const unpromoted = PIECE_TO_BASE[destPiece] ?? destPiece;
        const capturedChar = isBlack
          ? unpromoted.toUpperCase()
          : unpromoted.toLowerCase();

        const hand = isBlack ? this.handBlack : this.handWhite;
        hand.set(capturedChar, (hand.get(capturedChar) ?? 0) + 1);
      }

      // Handle promotion
      let finalPiece = movingPiece;
      if (movingPiece && move.promote) {
        if (!movingPiece.startsWith('+')) {
          finalPiece = ('+' + movingPiece) as BoardPiece;
        }
      }

      this.setSquare(move.to.file, move.to.rank, finalPiece);
    }

    this.turn = this.turn === 'b' ? 'w' : 'b';
    this.ply++;
  }

  /**
   * Deep clones the current board state.
   */
  public clone(): ShogiBoard {
    const next = new ShogiBoard();
    next.squares = this.squares.map((row) => [...row]);
    next.handBlack = new Map(this.handBlack);
    next.handWhite = new Map(this.handWhite);
    next.turn = this.turn;
    next.ply = this.ply;
    return next;
  }

  /**
   * Reconstructs a ShogiBoard instance from a standard USI SFEN string.
   */
  public static fromSfen(sfen: string): ShogiBoard {
    const board = new ShogiBoard();
    if (!sfen || sfen.trim() === '' || sfen === 'startpos') {
      return board;
    }

    const parts = sfen.trim().split(/\s+/);
    const boardPart = parts[0];
    const turnPart = parts[1] as Color | undefined;
    const handPart = parts[2];
    const plyPart = parts[3];

    // Clear board and hands
    board.squares = Array.from({ length: 9 }, () => Array(9).fill(null));
    board.handBlack.clear();
    board.handWhite.clear();

    if (boardPart) {
      const ranks = boardPart.split('/');
      for (let r = 1; r <= Math.min(9, ranks.length); r++) {
        const rankStr = ranks[r - 1];
        if (!rankStr) continue;

        let f = 9; // Files 9 down to 1
        let i = 0;
        while (i < rankStr.length && f >= 1) {
          const char = rankStr[i];
          if (!char) {
            i++;
            continue;
          }
          if (char >= '1' && char <= '9') {
            const emptyCount = parseInt(char, 10);
            f -= emptyCount;
            i++;
          } else if (char === '+') {
            // Promoted piece
            const nextChar = rankStr[i + 1];
            if (nextChar) {
              const piece = ('+' + nextChar) as BoardPiece;
              board.setSquare(f, r, piece);
              f--;
              i += 2;
            } else {
              i++;
            }
          } else {
            // Normal piece
            board.setSquare(f, r, char as BoardPiece);
            f--;
            i++;
          }
        }
      }
    }

    if (turnPart === 'b' || turnPart === 'w') {
      board.turn = turnPart;
    }

    if (handPart && handPart !== '-') {
      let count = 0;
      for (let i = 0; i < handPart.length; i++) {
        const char = handPart[i];
        if (!char) continue;
        if (char >= '0' && char <= '9') {
          count = count * 10 + parseInt(char, 10);
        } else {
          const pieceCount = count > 0 ? count : 1;
          const isBlack = char === char.toUpperCase();
          const targetHand = isBlack ? board.handBlack : board.handWhite;
          targetHand.set(char, (targetHand.get(char) ?? 0) + pieceCount);
          count = 0;
        }
      }
    }

    if (plyPart) {
      const parsedPly = parseInt(plyPart, 10);
      if (!isNaN(parsedPly)) {
        board.ply = parsedPly;
      }
    }

    return board;
  }

  /**
   * Generates standard USI SFEN string for the current board position.
   */
  public toSfen(): string {
    const ranks: string[] = [];

    // Rows 1 to 9 (rank 1 to 9)
    for (let r = 1; r <= 9; r++) {
      let rankStr = '';
      let emptyCount = 0;

      // Files 9 down to 1
      for (let f = 9; f >= 1; f--) {
        const piece = this.getSquare(f, r);
        if (piece === null) {
          emptyCount++;
        } else {
          if (emptyCount > 0) {
            rankStr += emptyCount.toString();
            emptyCount = 0;
          }
          rankStr += piece;
        }
      }

      if (emptyCount > 0) {
        rankStr += emptyCount.toString();
      }
      ranks.push(rankStr);
    }

    const boardPart = ranks.join('/');
    const turnPart = this.turn;

    // Piece in hand representation
    let handPart = '';
    for (const p of HAND_ORDER_BLACK) {
      const count = this.handBlack.get(p) ?? 0;
      if (count > 0) {
        handPart += (count > 1 ? count.toString() : '') + p;
      }
    }
    for (const p of HAND_ORDER_WHITE) {
      const count = this.handWhite.get(p) ?? 0;
      if (count > 0) {
        handPart += (count > 1 ? count.toString() : '') + p;
      }
    }
    if (!handPart) {
      handPart = '-';
    }

    return `${boardPart} ${turnPart} ${handPart} ${this.ply}`;
  }

  public getTurn(): Color {
    return this.turn;
  }

  public getPly(): number {
    return this.ply;
  }

  public getHand(color: Color): Record<string, number> {
    const hand = color === 'b' ? this.handBlack : this.handWhite;
    const result: Record<string, number> = {};
    const order = color === 'b' ? HAND_ORDER_BLACK : HAND_ORDER_WHITE;

    for (let i = 0; i < order.length; i++) {
      const p = order[i];
      if (p) {
        const standardKey = HAND_ORDER_BLACK[i] ?? p.toUpperCase();
        result[standardKey] = hand.get(p) ?? 0;
      }
    }
    return result;
  }
}
