import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadTsumegoProblems,
  saveTsumegoProblem,
  deleteTsumegoProblem,
  recordTsumegoAttempt,
  getTsumegoAttempts,
  clearTsumegoStorage,
} from '../src/utils/tsumegoStorage';
import { judgeTsumegoMove } from '../src/utils/tsumegoJudge';
import { ShogiBoard } from '../src/utils/shogiBoard';
import { PRESET_TSUMEGO_SEEDS } from '../src/utils/tsumegoSeeds';
import { parseUsiMove, getAllStrictLegalMoves } from '../src/utils/shogiRules';
import { TsumegoProblem } from '../src/types/tsumego';

describe('Tsumego Storage & Preset Seeds', () => {
  beforeEach(() => {
    clearTsumegoStorage();
  });

  it('loads preset seeds on empty storage', () => {
    const problems = loadTsumegoProblems();
    expect(problems).toEqual(PRESET_TSUMEGO_SEEDS);
  });

  it('saves and deletes a custom tsumego problem', () => {
    const custom: TsumegoProblem = {
      id: 'custom-tsume-01',
      title: 'テスト詰将棋',
      source: 'manual',
      kind: 'attack',
      startSfen: '8k/9/7S1/9/9/9/9/9/9 b G 1',
      sideToMove: 'b',
      moveLimit: 1,
      solutionPv: ['G*1b'],
      tags: ['テスト'],
      createdAt: Date.now(),
    };
    saveTsumegoProblem(custom);

    let all = loadTsumegoProblems();
    expect(all.find((p) => p.id === 'custom-tsume-01')).toBeDefined();

    deleteTsumegoProblem('custom-tsume-01');
    all = loadTsumegoProblems();
    expect(all.find((p) => p.id === 'custom-tsume-01')).toBeUndefined();
  });

  it('records solving attempts', () => {
    recordTsumegoAttempt({
      problemId: 'seed-tsume-1p-01',
      solved: true,
      movesCount: 1,
      hintsUsed: 0,
      elapsedMs: 2500,
      timestamp: Date.now(),
    });

    const attempts = getTsumegoAttempts('seed-tsume-1p-01');
    expect(attempts.length).toBe(1);
    expect(attempts[0]?.solved).toBe(true);
  });
});

describe('Tsumego Move Judge', () => {
  // Gote King on 1a ('8k'), Sente Silver on 2c (file 2, rank 3 -> '7S1') protecting 1b, hand Gold
  // SFEN: 8k/9/7S1/9/9/9/9/9/9 b G 1
  // Square 1b is completely empty, so G*1b is a legal drop.
  // G*1b checks 1a King directly. 2c Silver defends 1b.
  // King on 1a cannot escape:
  // - 1a1b: defended by 2c Silver.
  // - 1a2a: controlled by 1b Gold and 2c Silver.
  // - 1a2b: controlled by 1b Gold and 2c Silver.
  const sample1Move: TsumegoProblem = {
    id: 'test-1p',
    title: '頭金テスト',
    source: 'preset',
    kind: 'attack',
    startSfen: '8k/9/7S1/9/9/9/9/9/9 b G 1',
    sideToMove: 'b',
    moveLimit: 1,
    solutionPv: ['G*1b'],
    acceptAllMatingMoves: false,
    tags: ['1手詰'],
    createdAt: Date.now(),
  };

  it('rejects moves that do not give check on attack problems', () => {
    const board = ShogiBoard.fromSfen(sample1Move.startSfen);
    // Dropping Gold on 5e (does not check King on 1a)
    const result = judgeTsumegoMove(sample1Move, 0, board, 'G*5e');
    expect(result.isCheck).toBe(false);
    expect(result.isCorrect).toBe(false);
    expect(result.errorMessage).toContain('Move must give check');
  });

  it('accepts correct 1-move checkmate and completes problem', () => {
    const board = ShogiBoard.fromSfen(sample1Move.startSfen);
    const result = judgeTsumegoMove(sample1Move, 0, board, 'G*1b');
    expect(result.isCheck).toBe(true);
    expect(result.isCorrect).toBe(true);
    expect(result.isCompleted).toBe(true);
  });

  it('verifies all preset seeds for accurate checkmate completion', () => {
    for (const seed of PRESET_TSUMEGO_SEEDS) {
      let b = ShogiBoard.fromSfen(seed.startSfen);
      let stepPly = 0;
      let lastJudgeResult: any = null;

      while (stepPly < seed.solutionPv.length) {
        const moveUsi = seed.solutionPv[stepPly];
        lastJudgeResult = judgeTsumegoMove(seed, stepPly, b, moveUsi);
        expect(lastJudgeResult.isCorrect, `Seed ${seed.id} failed at ply ${stepPly} with move ${moveUsi}`).toBe(true);

        if (lastJudgeResult.isCompleted) {
          break;
        }

        b = ShogiBoard.fromSfen(lastJudgeResult.nextBoardSfen);
        stepPly += 2; // user move + opponent response
      }

      expect(lastJudgeResult.isCompleted, `Seed ${seed.id} should be completed at the end of solution line`).toBe(true);
    }
  });
});
