import { describe, expect, it } from 'vitest';
import { ShogiBoard } from '../src/utils/shogiBoard';
import {
  checkPromotion,
  createInteractiveMove,
  findKing,
  formatShogiMove,
  getLegalDropsForPiece,
  getLegalMovesForSquare,
  getStrictLegalDropsForPiece,
  getStrictLegalMovesForSquare,
  isCheckmate,
  isGameOver,
  isKingInCheck,
  isSquareAttacked,
  parseUsiMove,
  pickFallbackAiMove,
  rankToUsiChar,
  usiCharToRank,
} from '../src/utils/shogiRules';

describe('shogiRules unit tests', () => {
  it('converts rank to USI char and back', () => {
    expect(rankToUsiChar(1)).toBe('a');
    expect(rankToUsiChar(7)).toBe('g');
    expect(rankToUsiChar(9)).toBe('i');

    expect(usiCharToRank('a')).toBe(1);
    expect(usiCharToRank('g')).toBe(7);
    expect(usiCharToRank('i')).toBe(9);
  });

  it('checks promotion rules accurately', () => {
    // Sente Pawn moving to rank 3 (can promote, not forced)
    const sentePawnRank3 = checkPromotion('P', 4, 3, 'b');
    expect(sentePawnRank3.canPromote).toBe(true);
    expect(sentePawnRank3.forcePromote).toBe(false);

    // Sente Pawn moving to rank 1 (must promote)
    const sentePawnRank1 = checkPromotion('P', 2, 1, 'b');
    expect(sentePawnRank1.canPromote).toBe(true);
    expect(sentePawnRank1.forcePromote).toBe(true);

    // Sente Knight moving to rank 2 (must promote)
    const senteKnightRank2 = checkPromotion('N', 4, 2, 'b');
    expect(senteKnightRank2.canPromote).toBe(true);
    expect(senteKnightRank2.forcePromote).toBe(true);

    // Gold or King cannot promote
    expect(checkPromotion('G', 4, 2, 'b').canPromote).toBe(false);
    expect(checkPromotion('K', 4, 2, 'b').canPromote).toBe(false);

    // Moving outside promotion zone
    expect(checkPromotion('P', 7, 6, 'b').canPromote).toBe(false);
  });

  it('calculates legal moves from initial Hirate position', () => {
    const board = new ShogiBoard();

    // Sente Pawn at 7g (7, 7) can only move to 7f (7, 6)
    const pawnMoves = getLegalMovesForSquare(board, { file: 7, rank: 7 });
    expect(pawnMoves).toHaveLength(1);
    const firstMove = pawnMoves[0];
    expect(firstMove).toBeDefined();
    expect(firstMove?.to).toEqual({ file: 7, rank: 6 });
    expect(firstMove?.canPromote).toBe(false);

    // Sente Bishop at 8h (8, 8) can move diagonally to 7g, but 7g is blocked by own Pawn
    const bishopMoves = getLegalMovesForSquare(board, { file: 8, rank: 8 });
    // In initial position, bishop is blocked in all directions by pawns/lances/knights
    expect(bishopMoves).toHaveLength(0);

    // Open bishop diagonal: 7g7f
    const move7g7f = parseUsiMove('7g7f', board, 1, 'b');
    expect(move7g7f).not.toBeNull();
    if (move7g7f) board.applyMove(move7g7f);

    // Now bishop at 8h can reach 7g, 6f, 5e, 4d, and capture Gote pawn at 3c (3, 3)
    // It cannot jump OVER 3c to reach 2b!
    const bishopMovesAfterOpen = getLegalMovesForSquare(board, { file: 8, rank: 8 });
    const targetSquares = bishopMovesAfterOpen.map((m) => `${m.to.file}${m.to.rank}`);
    expect(targetSquares).toContain('77');
    expect(targetSquares).toContain('66');
    expect(targetSquares).toContain('55');
    expect(targetSquares).toContain('44');
    expect(targetSquares).toContain('33');
    expect(targetSquares).not.toContain('22');
  });

  it('handles Nifu (two pawns on same file) for piece drops', () => {
    const board = new ShogiBoard();
    // In initial position, Sente already has pawns on files 1 to 9
    const pawnDrops = getLegalDropsForPiece(board, 'P', 'b');
    // All files have pawns, so 0 valid squares for pawn drop!
    expect(pawnDrops).toHaveLength(0);

    // Silver drops on any empty square
    const silverDrops = getLegalDropsForPiece(board, 'S', 'b');
    // Ranks 4, 5, 6 across 9 files are empty = 27 empty squares, plus empty squares on ranks 2/8 (7 on rank 2, 7 on rank 8)
    expect(silverDrops.length).toBeGreaterThanOrEqual(27);
  });

  it('parses USI moves and builds KIF string properly', () => {
    const board = new ShogiBoard();
    const move = parseUsiMove('7g7f', board, 1, 'b');
    expect(move).not.toBeNull();
    expect(move?.from).toEqual({ file: 7, rank: 7 });
    expect(move?.to).toEqual({ file: 7, rank: 6 });
    expect(move?.piece).toBe('FU');
    expect(move?.kifString).toBe('▲７六歩(77)');
    expect(move?.sfenMove).toBe('7g7f');
  });

  it('creates interactive moves with proper notation', () => {
    const board = new ShogiBoard();
    const move = createInteractiveMove(
      board,
      1,
      'b',
      { file: 7, rank: 7 },
      { file: 7, rank: 6 },
      false
    );
    expect(move.sfenMove).toBe('7g7f');
    expect(move.kifString).toBe('▲７六歩(77)');
  });

  it('formats raw or legacy moves with formatShogiMove', () => {
    const legacyMove = {
      ply: 2,
      color: 'w' as const,
      from: { file: 8, rank: 3 },
      to: { file: 8, rank: 4 },
      piece: 'FU' as const,
      isDrop: false,
      kifString: '8c8d',
      sfenMove: '8c8d',
    };
    expect(formatShogiMove(legacyMove)).toBe('△８四歩(83)');
  });

  it('detects squares attacked by pieces accurately', () => {
    const board = new ShogiBoard();
    // In initial position, Gote pawn at 5c (5, 3) attacks 5d (5, 4)
    expect(isSquareAttacked(board, { file: 5, rank: 4 }, 'w')).toBe(true);
    // 5e is empty and not attacked by Gote in initial position
    expect(isSquareAttacked(board, { file: 5, rank: 5 }, 'w')).toBe(false);

    // Sente King at 5i (5, 9)
    const senteKing = findKing(board, 'b');
    expect(senteKing).toEqual({ file: 5, rank: 9 });
    expect(isKingInCheck(board, 'b')).toBe(false);
  });

  it('prevents King from moving into check (suicide moves)', () => {
    // Construct a position where King is on 6f, Gote has Pawn on 5d and Dragon on 5e
    const board = new ShogiBoard();
    board.setSquare(6, 6, 'K'); // Sente King at 6f
    board.setSquare(5, 4, 'p'); // Gote Pawn at 5d (defending 5e)
    board.setSquare(5, 5, '+r'); // Gote Dragon at 5e

    // Sente King moves: pseudo moves include 5e (capturing dragon)
    const pseudoMoves = getLegalMovesForSquare(board, { file: 6, rank: 6 });
    expect(pseudoMoves.some((m) => m.to.file === 5 && m.to.rank === 5)).toBe(true);

    // Strict legal moves: 5e is defended by 5d pawn, so capturing 5e leaves King in check!
    const strictMoves = getStrictLegalMovesForSquare(board, { file: 6, rank: 6 });
    expect(strictMoves.some((m) => m.to.file === 5 && m.to.rank === 5)).toBe(false);
  });

  it('detects checkmate when King has no legal escape', () => {
    // Classic corner checkmate:
    // Gote King at 1a (1, 1), Gote Pawn at 1b (1, 2) blocking escape forward,
    // Sente Gold at 2a (2, 1) checking King, defended by Sente Silver at 3a (3, 1).
    const board = new ShogiBoard();
    for (let f = 1; f <= 9; f++) {
      for (let r = 1; r <= 9; r++) {
        board.setSquare(f, r, null);
      }
    }
    board.setSquare(1, 1, 'k'); // Gote King at 1a
    board.setSquare(1, 2, 'p'); // Gote Pawn at 1b (blocks king from moving down)
    board.setSquare(2, 1, 'G'); // Sente Gold at 2a (checks 1a king)
    board.setSquare(2, 2, 'S'); // Sente Silver at 2b (defends 2a Gold forward)

    expect(isKingInCheck(board, 'w')).toBe(true);
    expect(isCheckmate(board, 'w')).toBe(true);
    const gameOver = isGameOver(board, 'w');
    expect(gameOver.isOver).toBe(true);
    expect(gameOver.isCheckmate).toBe(true);
  });

  it('does NOT declare checkmate when King has legal escape squares', () => {
    // Sente Horse at 7a (7, 1), Dragon at 2b (2, 2)
    // Gote King at 5b (5, 2) - checked by Dragon on rank 2
    // King can escape forward to 5c (5, 3) or 4c (4, 3) or 6c (6, 3)
    const board = new ShogiBoard();
    for (let f = 1; f <= 9; f++) {
      for (let r = 1; r <= 9; r++) {
        board.setSquare(f, r, null);
      }
    }
    board.setSquare(7, 1, '+B'); // Sente Horse at 7a
    board.setSquare(2, 2, '+R'); // Sente Dragon at 2b (checks 5b King along rank 2)
    board.setSquare(5, 2, 'k');  // Gote King at 5b

    expect(isKingInCheck(board, 'w')).toBe(true);
    expect(isCheckmate(board, 'w')).toBe(false);

    const escapeMoves = getStrictLegalMovesForSquare(board, { file: 5, rank: 2 });
    expect(escapeMoves.length).toBeGreaterThan(0);
    // 5c (53) is on the diagonal ray of Horse at 7a (71 -> 62 -> 53)
    // King can escape to 4c (43) or 6c (63)
    const targetCoords = escapeMoves.map((m) => `${m.to.file}${m.to.rank}`);
    expect(targetCoords).toContain('43');
    expect(targetCoords).toContain('63');
    expect(targetCoords).not.toContain('53');

    const gameOver = isGameOver(board, 'w');
    expect(gameOver.isOver).toBe(false);
    expect(gameOver.isCheckmate).toBe(false);
  });

  it('parses realistic tactical quiz move sequences and identifies last move correctly', () => {
    const b = new ShogiBoard();
    const moves = ['7g7f', '8c8d', '2g2f', '8d8e', '7i7h', '3c3d', '8h2b+', '3a2b', 'B*4e'];
    let prevTo: { file: number; rank: number } | undefined = undefined;
    let ply = 1;
    let lastMove: any = undefined;

    for (const usi of moves) {
      const turn = b.getTurn();
      const move = parseUsiMove(usi, b, ply, turn, prevTo);
      expect(move).not.toBeNull();
      if (move) {
        b.applyMove(move);
        prevTo = move.to;
        ply++;
        lastMove = move;
      }
    }

    expect(lastMove).toBeDefined();
    expect(lastMove?.sfenMove).toBe('B*4e');
    expect(lastMove?.kifString).toBe('▲４五角打');
    expect(lastMove?.ply).toBe(9);
    expect(b.getTurn()).toBe('w');
  });
});

