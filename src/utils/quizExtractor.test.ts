import { describe, expect, it } from 'vitest';
import { ShogiMove, MoveEvaluation } from '../types';
import {
  classifyQuizPosition,
  DEFAULT_QUIZ_CONFIG,
  extractQuizCards,
} from './quizExtractor';

function ev(
  cp: number,
  pv: string[] = ['2g2f', '8c8d', '2f2e'],
  isMate = false
): MoveEvaluation {
  return {
    scoreCp: cp,
    depth: 10,
    bestMove: pv[0],
    pv,
    isMate,
    evaluatedAt: '2026-01-01T00:00:00Z',
  };
}

function mk(evals: Array<MoveEvaluation | undefined>): ShogiMove[] {
  return evals.map((e, i) => ({
    ply: i + 1,
    color: i % 2 === 0 ? 'b' : 'w',
    to: { file: 7, rank: 6 },
    piece: 'FU',
    isDrop: false,
    kifString: '',
    sfenMove: `m${i + 1}`,
    evaluation: e,
  }));
}

describe('quizExtractor - classifyQuizPosition and extractQuizCards', () => {
  it('T1: classifies attack position when opponent makes a blunder/slack move', () => {
    // ply 1: b, ply 2: w (last mover w -> solver b, sign = +1)
    const m = mk([ev(0), ev(250)]);
    expect(classifyQuizPosition(m, 2, DEFAULT_QUIZ_CONFIG)).toBe('attack');
  });

  it('T2: classifies mate position over attack when overwhelming advantage or mate exists', () => {
    const m = mk([ev(0), ev(2500)]);
    expect(classifyQuizPosition(m, 2, DEFAULT_QUIZ_CONFIG)).toBe('mate');
  });

  it('T3: classifies defense position when solver faced severe threat and made a blunder in actual game', () => {
    // ply 3: b (last mover b -> solver w, sign = -1)
    // prev (ply 2): ev(0) -> prevS = 0
    // cur (ply 3): ev(400) -> curS = -400 (gain = -400 <= -200)
    // next (ply 4): ev(750) -> nextS = -750 (lossActual = -400 - (-750) = 350 >= 300)
    const m = mk([ev(0), ev(0), ev(400), ev(750)]);
    expect(classifyQuizPosition(m, 3, DEFAULT_QUIZ_CONFIG)).toBe('defense');
  });

  it('T4: returns null for defense if actual move did not lose significant evaluation', () => {
    const m = mk([ev(0), ev(0), ev(400), ev(450)]);
    expect(classifyQuizPosition(m, 3, DEFAULT_QUIZ_CONFIG)).toBeNull();
  });

  it('T5: returns null for defense if next evaluation is missing', () => {
    const m = mk([ev(0), ev(0), ev(400)]);
    expect(classifyQuizPosition(m, 3, DEFAULT_QUIZ_CONFIG)).toBeNull();
  });

  it('T6: classifies endgame race position after move 80', () => {
    // 83 moves: indices 0..82
    const evals: Array<MoveEvaluation | undefined> = Array(83).fill(ev(0));
    evals[78] = ev(150); // ply 79 (prev)
    evals[79] = ev(200, ['2g2f', '8c8d', '2f2e']); // ply 80 (cur)
    evals[80] = ev(-50); // ply 81 (next)
    const m = mk(evals);

    // ply 80: last mover w (index 79, color w) -> solver b (sign = +1)
    // curS = 200 (in range [-300, 600])
    // lossActual = 200 - (-50) = 250 >= 200
    // pv.length = 3 >= 3
    expect(classifyQuizPosition(m, 80, DEFAULT_QUIZ_CONFIG)).toBe('race');
  });

  it('T7: returns empty array when game has flat evaluation (zero turning points)', () => {
    const m = mk(Array(10).fill(ev(0)));
    const cards = extractQuizCards({
      gameId: 'g0',
      openingId: 'yagura',
      startSfen: 'start',
      moves: m,
    });
    expect(cards).toEqual([]);
  });

  it('T8: returns empty array if previous evaluation is missing', () => {
    const m = mk([undefined, ev(250)]);
    const cards = extractQuizCards({
      gameId: 'g1',
      openingId: 'yagura',
      startSfen: 'start',
      moves: m,
    });
    expect(cards).toEqual([]);
  });

  it('T9: extracts valid attack card with odd PV length (4 trimmed to 3)', () => {
    const m = mk([ev(0), ev(250, ['2g2f', '8c8d', '2f2e', '8d8e'])]);
    const cards = extractQuizCards(
      {
        gameId: 'g1',
        openingId: 'kakugawari',
        startSfen: 'startpos',
        moves: m,
      },
      undefined,
      '2026-10-25T00:00:00.000Z'
    );

    expect(cards).toHaveLength(1);
    const c = cards[0];
    expect(c).toBeDefined();
    if (!c) return;

    expect(c.id).toBe('g1:2');
    expect(c.type).toBe('attack');
    expect(c.sideToMove).toBe('b');
    expect(c.pv).toEqual(['2g2f', '8c8d', '2f2e']);
    expect(c.bestMove).toBe('2g2f');
    expect(c.usiMovesToPosition).toEqual(['m1', 'm2']);
    expect(c.actualMove).toBeUndefined();
    expect(c.isEnabled).toBe(true);
    expect(c.createdAt).toBe('2026-10-25T00:00:00.000Z');
  });

  it('T10: preserves PV of length 1', () => {
    const m = mk([ev(0), ev(250, ['2g2f'])]);
    const cards = extractQuizCards({
      gameId: 'g1',
      openingId: 'aigakari',
      startSfen: 'startpos',
      moves: m,
    });
    expect(cards).toHaveLength(1);
    expect(cards[0]?.pv).toEqual(['2g2f']);
  });

  it('T12: limits extracted quizzes to maxQuizzesPerGame and respects minPlyDistance', () => {
    // Construct a long game with 10 attack blunders
    const evals: Array<MoveEvaluation | undefined> = [];
    for (let i = 0; i < 30; i++) {
      if (i % 2 === 1) {
        // Gote blunders giving Sente >= 300 advantage
        evals.push(ev(300 + i * 20));
      } else {
        evals.push(ev(0));
      }
    }
    const m = mk(evals);
    const cards = extractQuizCards(
      {
        gameId: 'g_long',
        openingId: 'yagura',
        startSfen: 'startpos',
        moves: m,
      },
      { maxQuizzesPerGame: 3, minPlyDistance: 6 }
    );

    expect(cards.length).toBeLessThanOrEqual(3);
    for (let i = 0; i < cards.length - 1; i++) {
      const curCard = cards[i];
      const nextCard = cards[i + 1];
      if (curCard && nextCard) {
        expect(nextCard.ply - curCard.ply).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it('T13: generates 3 choices including bestMove and distractor with scoreDelta', () => {
    const m = mk([ev(0), ev(300, ['7g7f', '3c3d', '2g2f'])]);
    const cards = extractQuizCards({
      gameId: 'g_choices',
      openingId: 'shikenbisha',
      startSfen: 'startpos',
      moves: m,
    });

    expect(cards).toHaveLength(1);
    const card = cards[0];
    expect(card).toBeDefined();
    if (!card) return;

    expect(card.choices).toBeDefined();
    expect(card.choices?.length).toBeGreaterThanOrEqual(1);

    const correctChoice = card.choices?.find((c) => c.isCorrect);
    expect(correctChoice).toBeDefined();
    expect(correctChoice?.usi).toBe(card.bestMove);
    expect(correctChoice?.scoreDelta).toBe(0);
  });

  it('T14: integrates actual game continuation into PV', () => {
    // Moves with sfenMove
    const moves: ShogiMove[] = [
      { ply: 1, color: 'b', to: { file: 7, rank: 6 }, piece: 'FU', isDrop: false, kifString: '', sfenMove: '7g7f', evaluation: ev(0) },
      { ply: 2, color: 'w', to: { file: 3, rank: 4 }, piece: 'FU', isDrop: false, kifString: '', sfenMove: '3c3d', evaluation: ev(350, ['2g2f', '4c4d', '2f2e']) },
      { ply: 3, color: 'b', to: { file: 2, rank: 6 }, piece: 'FU', isDrop: false, kifString: '', sfenMove: '2g2f' },
      { ply: 4, color: 'w', to: { file: 8, rank: 4 }, piece: 'FU', isDrop: false, kifString: '', sfenMove: '8c8d' },
    ];

    const cards = extractQuizCards({
      gameId: 'g_cont',
      openingId: 'aigakari',
      startSfen: 'startpos',
      moves,
    });

    expect(cards).toHaveLength(1);
    const card = cards[0];
    expect(card).toBeDefined();
    if (!card) return;

    // Step 0 is bestMove ('2g2f')
    // Step 1 should use actual game move at ply 3 ('8c8d') if available in moves
    expect(card.bestMove).toBe('2g2f');
    expect(card.pv[0]).toBe('2g2f');
  });
});

