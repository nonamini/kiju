/**
 * Unit tests for Tsumego Move Judge & Refutation Logic.
 * Strictly English code, comments, and identifiers (Rule 1).
 */

import { describe, expect, it } from 'vitest';
import { TsumegoProblem } from '../types/tsumego';
import { ShogiBoard } from './shogiBoard';
import { judgeTsumegoMove } from './tsumegoJudge';

function makeProblem(partial: Partial<TsumegoProblem> & Pick<TsumegoProblem, 'startSfen' | 'moveLimit' | 'solutionPv'>): TsumegoProblem {
  return {
    id: partial.id ?? 'test-tsumego',
    title: partial.title ?? 'Test Problem',
    source: partial.source ?? 'manual',
    kind: partial.kind ?? 'attack',
    startSfen: partial.startSfen,
    sideToMove: partial.sideToMove ?? 'b',
    moveLimit: partial.moveLimit,
    solutionPv: partial.solutionPv,
    acceptAllMatingMoves: partial.acceptAllMatingMoves ?? true,
    tags: partial.tags ?? [],
    createdAt: partial.createdAt ?? 0,
  };
}

describe('tsumegoJudge', () => {
  it('distinguishes promoted mate from unpromoted escape with refutationMove', () => {
    // Sente Silver 4c -> 5b+ checkmates King on 5a; unpromoted 4c5b lets King escape to 4b.
    const problem = makeProblem({
      startSfen: '3lkl3/3p5/4PS3/9/9/9/9/9/9 b - 1',
      moveLimit: 1,
      solutionPv: ['4c5b+'],
    });
    const board = ShogiBoard.fromSfen(problem.startSfen);

    const promotedRes = judgeTsumegoMove(problem, 0, board, '4c5b+');
    expect(promotedRes.isCorrect).toBe(true);
    expect(promotedRes.isCompleted).toBe(true);

    const unpromotedRes = judgeTsumegoMove(problem, 0, board, '4c5b');
    expect(unpromotedRes.isCheck).toBe(true);
    expect(unpromotedRes.isCorrect).toBe(false);
    expect(unpromotedRes.isRefuted).toBe(true);
    expect(unpromotedRes.errorCode).toBe('refuted');
    expect(unpromotedRes.refutationMove).toBe('5a4b');
    expect(unpromotedRes.boardAfterPlayerSfen).toBeDefined();
    expect(unpromotedRes.nextBoardSfen).not.toBe(unpromotedRes.boardAfterPlayerSfen);
  });

  it('requires unpromoted Knight check when promotion fails to give check', () => {
    // Sente Knight 6e -> 7c (unpromoted) mates King on 6a; 6e7c+ does not give check.
    const problem = makeProblem({
      startSfen: '2lkl4/2npp4/9/9/3N5/9/9/9/9 b - 1',
      moveLimit: 1,
      solutionPv: ['6e7c'],
    });
    const board = ShogiBoard.fromSfen(problem.startSfen);

    const stayRes = judgeTsumegoMove(problem, 0, board, '6e7c');
    expect(stayRes.isCorrect).toBe(true);
    expect(stayRes.isCompleted).toBe(true);

    const promoRes = judgeTsumegoMove(problem, 0, board, '6e7c+');
    expect(promoRes.isCheck).toBe(false);
    expect(promoRes.isCorrect).toBe(false);
    expect(promoRes.errorCode).toBe('not_check');
    expect(promoRes.isRefuted).toBeUndefined();
  });

  it('advances PV reply on correct move and returns refutation move on wrong check in 3-ply tsumego', () => {
    const problem = makeProblem({
      startSfen: '7nk/7p1/6+RsP/9/9/9/9/9/7L1 b G 1',
      moveLimit: 3,
      solutionPv: ['G*1b', '2c1b', '3c2b'],
    });
    const board = ShogiBoard.fromSfen(problem.startSfen);

    const correctRes = judgeTsumegoMove(problem, 0, board, 'G*1b');
    expect(correctRes.isCorrect).toBe(true);
    expect(correctRes.isCompleted).toBe(false);
    expect(correctRes.opponentReply).toBe('2c1b');
    expect(correctRes.boardAfterPlayerSfen).toBeDefined();

    // Capturing 2b with Dragon allows King 1a2b (△同玉) without 3-ply mate
    const wrongCheck = judgeTsumegoMove(problem, 0, board, '3c2b');
    expect(wrongCheck.isCheck).toBe(true);
    expect(wrongCheck.isCorrect).toBe(false);
    expect(wrongCheck.isRefuted).toBe(true);
    expect(wrongCheck.errorCode).toBe('refuted');
    expect(wrongCheck.refutationMove).toBe('1a2b');
    expect(wrongCheck.boardAfterPlayerSfen).toBeDefined();
    expect(wrongCheck.nextBoardSfen).not.toBe(wrongCheck.boardAfterPlayerSfen);
  });

  it('rejects non-check moves with not_check errorCode and no refutation', () => {
    const problem = makeProblem({
      startSfen: '7nk/7p1/6+RsP/9/9/9/9/9/7L1 b G 1',
      moveLimit: 3,
      solutionPv: ['G*1b', '2c1b', '3c2b'],
    });
    const board = ShogiBoard.fromSfen(problem.startSfen);

    const res = judgeTsumegoMove(problem, 0, board, '2i2h');
    expect(res.isCheck).toBe(false);
    expect(res.isCorrect).toBe(false);
    expect(res.isRefuted).toBeUndefined();
    expect(res.errorCode).toBe('not_check');
  });
});
