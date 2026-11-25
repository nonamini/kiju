import { describe, expect, it } from 'vitest';
import { ShogiMove } from '../src/types/shogi';
import { ShogiBoard } from '../src/utils/shogiBoard';
import {
  calculateHintPenalty,
  getAnswerHint,
  getBoardOrHandHint,
  getFileHint,
  getPieceHint,
  getRankHint,
  HINT_PENALTY_WEIGHTS,
} from '../src/utils/srsHintEngine';

describe('srsHintEngine', () => {
  const pawnMove: ShogiMove = {
    ply: 1,
    color: 'b',
    from: { file: 7, rank: 7 },
    to: { file: 7, rank: 6 },
    piece: 'FU',
    isDrop: false,
    kifString: '７六歩(77)',
    sfenMove: '7g7f',
  };

  const goldDropMove: ShogiMove = {
    ply: 25,
    color: 'w',
    to: { file: 5, rank: 2 },
    piece: 'KI',
    isDrop: true,
    kifString: '☖５二金打',
    sfenMove: 'G*5b',
  };

  const rookMoveRight: ShogiMove = {
    ply: 30,
    color: 'b',
    from: { file: 2, rank: 8 },
    to: { file: 2, rank: 4 },
    piece: 'HI',
    isDrop: false,
    kifString: '▲２四飛(28)',
    sfenMove: '2h2d',
  };

  const bishopExchangeMove: ShogiMove = {
    ply: 7,
    color: 'b',
    from: { file: 8, rank: 8 },
    to: { file: 2, rank: 2 },
    piece: 'KA',
    isPromote: true,
    isDrop: false,
    kifString: '▲２二角成(88)',
    sfenMove: '8h2b+',
  };

  it('correctly extracts Rank hint based on move origin (1-3, 4-6, 7-9 or drop)', () => {
    // 8h2b+ -> origin 8h (rank 8, lower 7-9 for Sente)
    const hintBishop = getRankHint(bishopExchangeMove, 'b');
    expect(hintBishop.rankRange).toBe('7-9');
    expect(hintBishop.labelKey).toBe('srs.hint_rank_7_9_sente');
    expect(hintBishop.highlightSquares).toHaveLength(27);
    expect(hintBishop.highlightSquares.some((s) => s.rank === 8 && s.file === 8)).toBe(true);

    // 7g7f -> origin 7g (rank 7, lower 7-9 for Sente)
    const hintPawn = getRankHint(pawnMove, 'b');
    expect(hintPawn.rankRange).toBe('7-9');
    expect(hintPawn.labelKey).toBe('srs.hint_rank_7_9_sente');
    expect(hintPawn.highlightSquares).toHaveLength(27);

    // G*5b -> hand drop, no origin square
    const hintDrop = getRankHint(goldDropMove, 'w');
    expect(hintDrop.rankRange).toBe('drop');
    expect(hintDrop.labelKey).toBe('srs.hint_rank_drop');
    expect(hintDrop.highlightSquares).toHaveLength(0);
    expect(hintDrop.isDrop).toBe(true);
  });

  it('correctly extracts File hint based on move origin (1-3, 4-6, 7-9 or drop)', () => {
    // 8h2b+ -> origin 8h (file 8, left 7-9 for Sente)
    const hintBishop = getFileHint(bishopExchangeMove, 'b');
    expect(hintBishop.fileRange).toBe('7-9');
    expect(hintBishop.labelKey).toBe('srs.hint_file_7_9_sente');
    expect(hintBishop.highlightSquares).toHaveLength(27);
    expect(hintBishop.highlightSquares.some((s) => s.rank === 8 && s.file === 8)).toBe(true);

    // 7g7f -> origin 7g (file 7, left 7-9 for Sente)
    const hintPawn = getFileHint(pawnMove, 'b');
    expect(hintPawn.fileRange).toBe('7-9');
    expect(hintPawn.labelKey).toBe('srs.hint_file_7_9_sente');
    expect(hintPawn.highlightSquares).toHaveLength(27);

    // 2h2d -> origin 2h (file 2, right 1-3 for Sente)
    const hintRook = getFileHint(rookMoveRight, 'b');
    expect(hintRook.fileRange).toBe('1-3');
    expect(hintRook.labelKey).toBe('srs.hint_file_1_3_sente');
    expect(hintRook.highlightSquares).toHaveLength(27);

    // G*5b -> hand drop, no origin square
    const hintDrop = getFileHint(goldDropMove, 'w');
    expect(hintDrop.fileRange).toBe('drop');
    expect(hintDrop.labelKey).toBe('srs.hint_file_drop');
    expect(hintDrop.highlightSquares).toHaveLength(0);
    expect(hintDrop.isDrop).toBe(true);
  });

  it('correctly extracts Piece Type hint and locates candidate pieces on board', () => {
    const board = new ShogiBoard();
    const hint = getPieceHint(pawnMove, board);
    expect(hint.piece).toBe('FU');
    expect(hint.labelKey).toBe('srs.hint_piece_fu');
    // On starting board, Sente has 9 pawns on rank 7
    expect(hint.candidateSquares).toHaveLength(9);
    expect(hint.candidateSquares.some((s) => s.file === 7 && s.rank === 7)).toBe(true);
    expect(hint.inHand).toBe(false);
  });

  it('correctly extracts Board vs Hand Drop hint', () => {
    const hintBoard = getBoardOrHandHint(pawnMove);
    expect(hintBoard.isDrop).toBe(false);
    expect(hintBoard.labelKey).toBe('srs.hint_board_move');

    const hintDrop = getBoardOrHandHint(goldDropMove);
    expect(hintDrop.isDrop).toBe(true);
    expect(hintDrop.labelKey).toBe('srs.hint_hand_drop');
  });

  it('correctly extracts Answer hint with highlight coordinates', () => {
    const answer1 = getAnswerHint(pawnMove);
    expect(answer1.sfenMove).toBe('7g7f');
    expect(answer1.highlightSquares).toEqual([
      { file: 7, rank: 7 },
      { file: 7, rank: 6 },
    ]);
    expect(answer1.from).toEqual({ file: 7, rank: 7 });
    expect(answer1.to).toEqual({ file: 7, rank: 6 });

    const answerDrop = getAnswerHint(goldDropMove);
    expect(answerDrop.sfenMove).toBe('G*5b');
    expect(answerDrop.highlightSquares).toEqual([{ file: 5, rank: 2 }]);
  });

  it('calculates hint penalty weight according to SRS difficulty weighting', () => {
    expect(HINT_PENALTY_WEIGHTS.rank).toBe(1);
    expect(HINT_PENALTY_WEIGHTS.file).toBe(1);
    expect(HINT_PENALTY_WEIGHTS.boardOrHand).toBe(1);
    expect(HINT_PENALTY_WEIGHTS.piece).toBe(2);
    expect(HINT_PENALTY_WEIGHTS.answer).toBe(5);

    expect(calculateHintPenalty([])).toBe(0);
    expect(calculateHintPenalty(['rank', 'file'])).toBe(2);
    expect(calculateHintPenalty(['rank', 'piece'])).toBe(3);
    expect(calculateHintPenalty(['rank', 'file', 'piece', 'boardOrHand', 'answer'])).toBe(10);
  });
});
