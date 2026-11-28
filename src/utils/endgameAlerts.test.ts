import { describe, expect, it } from 'vitest';
import type { MoveEvaluation } from '../types/shogi';
import { detectEndgameAlerts } from './endgameAlerts';

const makeEval = (partial: Partial<MoveEvaluation>): MoveEvaluation => ({
  scoreCp: 0,
  depth: 8,
  evaluatedAt: '2026-11-28T00:00:00.000Z',
  ...partial,
});

describe('endgameAlerts (Issue #23)', () => {
  it('returns empty list for balanced middlegame positions', () => {
    const alerts = detectEndgameAlerts({
      turnColor: 0,
      curEval: makeEval({ scoreCp: 120 }),
      nullMoveEval: makeEval({ scoreCp: -250 }),
    });
    expect(alerts).toEqual([]);
  });

  it('detects spoiler-free enemy_mate when current side has forced mate', () => {
    const alerts = detectEndgameAlerts({
      turnColor: 1,
      curEval: makeEval({
        scoreCp: -30000, // Gote advantage mate
        isMate: true,
        matePly: 5,
        pv: ['G*5h', '5i6h', '4g5h'],
      }),
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      kind: 'enemy_mate',
      turnColor: 1,
      matePly: 5,
      spoilerPv: ['G*5h', '5i6h', '4g5h'],
    });
  });

  it('detects own_hisshi when forced mate exists against current side even with defense', () => {
    const alerts = detectEndgameAlerts({
      turnColor: 0,
      curEval: makeEval({ scoreCp: -30000, isMate: true, matePly: 3 }),
      nullMoveEval: makeEval({ scoreCp: -30000, isMate: true, matePly: 1 }),
    });
    expect(alerts.map((a) => a.kind)).toEqual(['own_hisshi']);
  });

  it('detects own_tsumero when passing allows forced mate while curEval still avoids mate', () => {
    const alerts = detectEndgameAlerts({
      turnColor: 0,
      curEval: makeEval({ scoreCp: -400, isMate: false }),
      nullMoveEval: makeEval({ scoreCp: -30000, isMate: true, matePly: 3 }),
    });
    expect(alerts.map((a) => a.kind)).toEqual(['own_tsumero']);
  });

  it('detects enemy_decisive on overwhelming >=2500cp non-mate advantage', () => {
    const alerts = detectEndgameAlerts({
      turnColor: 0,
      curEval: makeEval({ scoreCp: 2800, isMate: false }),
    });
    expect(alerts.map((a) => a.kind)).toEqual(['enemy_decisive']);
  });
});
