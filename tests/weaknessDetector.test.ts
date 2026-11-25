import { describe, it, expect } from 'vitest';
import { detectWeaknessPositions } from '../src/utils/weaknessDetector';
import { MatchRecord } from '../src/types/match';
import { MergedKifuTree } from '../src/types/tree';

describe('detectWeaknessPositions', () => {
  const sampleTree: MergedKifuTree = {
    openingId: 'yagura',
    openingName: 'Fortress (矢倉)',
    rootSfen: 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1',
    totalGames: 5,
    updatedAt: '2026-10-20T10:00:00Z',
    rootNodes: [
      {
        id: '7g7f',
        sfen: 'lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 2',
        move: {
          ply: 1,
          color: 'b',
          from: { file: 7, rank: 7 },
          to: { file: 7, rank: 6 },
          piece: 'FU',
          promote: false,
          isDrop: false,
          kifString: '▲７六歩(77)',
          sfenMove: '7g7f',
        },
        gameCount: 5,
        wins: { sente: 3, gote: 2, draw: 0 },
        gameRefs: [],
        children: [
          {
            id: '8c8d',
            sfen: 'lnsgkgsnl/1r5b1/p1ppppppp/1p7/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL b - 3',
            move: {
              ply: 2,
              color: 'w',
              from: { file: 8, rank: 8 },
              to: { file: 8, rank: 4 },
              piece: 'FU',
              promote: false,
              isDrop: false,
              kifString: '△８四歩(83)',
              sfenMove: '8c8d',
            },
            gameCount: 5,
            wins: { sente: 3, gote: 2, draw: 0 },
            gameRefs: [],
            children: [
              {
                id: '6g6f',
                sfen: 'lnsgkgsnl/1r5b1/p1ppppppp/1p7/9/2P2P3/PP1PP1PPP/1B5R1/LNSGKGSNL w - 4',
                move: {
                  ply: 3,
                  color: 'b',
                  from: { file: 6, rank: 7 },
                  to: { file: 6, rank: 6 },
                  piece: 'FU',
                  promote: false,
                  isDrop: false,
                  kifString: '▲６六歩(67)',
                  sfenMove: '6g6f',
                },
                gameCount: 5,
                wins: { sente: 3, gote: 2, draw: 0 },
                gameRefs: [],
                children: [],
              },
            ],
          },
        ],
      },
    ],
  };

  const createLossRecord = (
    id: string,
    outOfBookPly: number,
    divergenceMove: string,
    endedAt: string
  ): MatchRecord => ({
    id,
    userId: 'user1',
    openingId: 'yagura',
    startedAt: '2026-10-20T10:00:00Z',
    endedAt,
    userColor: 'b',
    startPly: 0,
    startSfen: 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1',
    moves: [
      {
        ply: 1,
        color: 'b',
        from: { file: 7, rank: 7 },
        to: { file: 7, rank: 6 },
        piece: 'FU',
        promote: false,
        isDrop: false,
        kifString: '▲７六歩(77)',
        sfenMove: '7g7f',
      },
      {
        ply: 2,
        color: 'w',
        from: { file: 8, rank: 8 },
        to: { file: 8, rank: 4 },
        piece: 'FU',
        promote: false,
        isDrop: false,
        kifString: '△８四歩(83)',
        sfenMove: '8c8d',
      },
      {
        ply: 3,
        color: 'b',
        from: { file: 2, rank: 7 },
        to: { file: 2, rank: 6 },
        piece: 'FU',
        promote: false,
        isDrop: false,
        kifString: '▲２六歩(27)',
        sfenMove: divergenceMove,
      },
    ],
    outOfBookPly,
    result: 'loss',
    reason: 'resignation',
    aiEngine: 'Fairy-Stockfish',
    aiDepth: 12,
    isMergedIntoTree: false,
  });

  it('ignores winning or aborted records', () => {
    const winRecord: MatchRecord = {
      ...createLossRecord('m1', 3, '2g2f', '2026-10-20T12:00:00Z'),
      result: 'win',
    };
    const abortedRecord: MatchRecord = {
      ...createLossRecord('m2', 3, '2g2f', '2026-10-20T12:00:00Z'),
      result: 'aborted',
    };

    const result = detectWeaknessPositions([winRecord, abortedRecord]);
    expect(result).toHaveLength(0);
  });

  it('aggregates multiple losses at the same divergence point', () => {
    const r1 = createLossRecord('m1', 3, '2g2f', '2026-10-20T12:00:00Z');
    const r2 = createLossRecord('m2', 3, '2g2f', '2026-10-21T14:00:00Z');
    const r3 = createLossRecord('m3', 3, '2g2f', '2026-10-22T16:00:00Z');

    const result = detectWeaknessPositions([r1, r2, r3], {
      trees: { yagura: sampleTree },
    });

    expect(result).toHaveLength(1);
    const item = result[0];
    expect(item.openingId).toBe('yagura');
    expect(item.ply).toBe(3);
    expect(item.playedMoveUsi).toBe('2g2f');
    expect(item.lossCount).toBe(3);
    expect(item.matchCount).toBe(3);
    expect(item.lastLossAt).toBe('2026-10-22T16:00:00Z');
    expect(item.bookMovesUsi).toEqual(['6g6f']); // Book move at ply 3
    expect(item.sourceMatchIds).toEqual(['m1', 'm2', 'm3']);
  });

  it('respects minLosses option', () => {
    const r1 = createLossRecord('m1', 3, '2g2f', '2026-10-20T12:00:00Z');

    const resultMin2 = detectWeaknessPositions([r1], { minLosses: 2 });
    expect(resultMin2).toHaveLength(0);

    const resultMin1 = detectWeaknessPositions([r1], { minLosses: 1 });
    expect(resultMin1).toHaveLength(1);
  });

  it('sorts by lossCount descending, then recent loss date', () => {
    const highLoss1 = createLossRecord('m1', 3, '2g2f', '2026-10-20T10:00:00Z');
    const highLoss2 = createLossRecord('m2', 3, '2g2f', '2026-10-20T11:00:00Z');
    const singleLoss = createLossRecord('m3', 3, '7g7e', '2026-10-21T10:00:00Z');

    const result = detectWeaknessPositions([highLoss1, highLoss2, singleLoss]);
    expect(result).toHaveLength(2);
    expect(result[0].playedMoveUsi).toBe('2g2f');
    expect(result[0].lossCount).toBe(2);
    expect(result[1].playedMoveUsi).toBe('7g7e');
    expect(result[1].lossCount).toBe(1);
  });
});
