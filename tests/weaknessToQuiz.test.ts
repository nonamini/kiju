import { describe, it, expect } from 'vitest';
import { weaknessToQuizCard } from '../src/utils/weaknessToQuiz';
import { WeaknessPosition } from '../src/types/weakness';
import { MergedKifuTree } from '../src/types/tree';

describe('weaknessToQuizCard', () => {
  const sampleWeakness: WeaknessPosition = {
    id: 'kakugawari:17:2f2e',
    openingId: 'kakugawari',
    openingName: 'Bishop Exchange',
    ply: 17,
    sfen: 'lnsgkg1nl/1r5s1/pppppp1pp/6p2/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL b - 7',
    usiMovesToPosition: ['7g7f', '8c8d', '2g2f', '8d8e'],
    playerColor: 'b',
    lossCount: 3,
    matchCount: 3,
    lastLossAt: '2026-10-24T18:30:00Z',
    playedMoveUsi: '2f2e',
    bookMovesUsi: ['7i6h', '8h2b+'],
    sourceMatchIds: ['match-001', 'match-002'],
  };

  it('converts a WeaknessPosition to a TacticalQuizCard with correct metadata', () => {
    const card = weaknessToQuizCard(sampleWeakness);

    expect(card.id).toBe('weakness:kakugawari:17:2f2e');
    expect(card.openingId).toBe('kakugawari');
    expect(card.type).toBe('defense');
    expect(card.ply).toBe(17);
    expect(card.sideToMove).toBe('b');
    expect(card.bestMove).toBe('7i6h');
    expect(card.actualMove).toBe('2f2e');
    expect(card.isEnabled).toBe(true);
    expect(card.pv).toEqual(['7i6h']);
  });

  it('extracts multi-ply PV from opening tree when available', () => {
    const tree: MergedKifuTree = {
      openingId: 'kakugawari',
      openingName: 'Bishop Exchange',
      rootSfen: 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1',
      totalGames: 1,
      updatedAt: '2026-10-20T10:00:00Z',
      rootNodes: [
        {
          id: '7g7f',
          sfen: '...',
          move: {
            ply: 1,
            color: 'b',
            from: { file: 7, rank: 7 },
            to: { file: 7, rank: 6 },
            piece: 'FU',
            promote: false,
            isDrop: false,
            kifString: '▲７六歩',
            sfenMove: '7g7f',
          },
          gameCount: 1,
          wins: { sente: 1, gote: 0, draw: 0 },
          gameRefs: [],
          children: [
            {
              id: '8c8d',
              sfen: '...',
              move: {
                ply: 2,
                color: 'w',
                from: { file: 8, rank: 8 },
                to: { file: 8, rank: 4 },
                piece: 'FU',
                promote: false,
                isDrop: false,
                kifString: '△８四歩',
                sfenMove: '8c8d',
              },
              gameCount: 1,
              wins: { sente: 1, gote: 0, draw: 0 },
              gameRefs: [],
              children: [
                {
                  id: '2g2f',
                  sfen: '...',
                  move: {
                    ply: 3,
                    color: 'b',
                    from: { file: 2, rank: 7 },
                    to: { file: 2, rank: 6 },
                    piece: 'FU',
                    promote: false,
                    isDrop: false,
                    kifString: '▲２六歩',
                    sfenMove: '2g2f',
                  },
                  gameCount: 1,
                  wins: { sente: 1, gote: 0, draw: 0 },
                  gameRefs: [],
                  children: [
                    {
                      id: '8d8e',
                      sfen: '...',
                      move: {
                        ply: 4,
                        color: 'w',
                        from: { file: 8, rank: 4 },
                        to: { file: 8, rank: 5 },
                        piece: 'FU',
                        promote: false,
                        isDrop: false,
                        kifString: '△８五歩',
                        sfenMove: '8d8e',
                      },
                      gameCount: 1,
                      wins: { sente: 1, gote: 0, draw: 0 },
                      gameRefs: [],
                      children: [
                        {
                          id: '7i6h',
                          sfen: '...',
                          move: {
                            ply: 5,
                            color: 'b',
                            from: { file: 7, rank: 9 },
                            to: { file: 6, rank: 8 },
                            piece: 'GI',
                            promote: false,
                            isDrop: false,
                            kifString: '▲６八銀',
                            sfenMove: '7i6h',
                          },
                          gameCount: 1,
                          wins: { sente: 1, gote: 0, draw: 0 },
                          gameRefs: [],
                          children: [
                            {
                              id: '3c3d',
                              sfen: '...',
                              move: {
                                ply: 6,
                                color: 'w',
                                from: { file: 3, rank: 3 },
                                to: { file: 3, rank: 4 },
                                piece: 'FU',
                                promote: false,
                                isDrop: false,
                                kifString: '△３四歩',
                                sfenMove: '3c3d',
                              },
                              gameCount: 1,
                              wins: { sente: 1, gote: 0, draw: 0 },
                              gameRefs: [],
                              children: [
                                {
                                  id: '2f2e',
                                  sfen: '...',
                                  move: {
                                    ply: 7,
                                    color: 'b',
                                    from: { file: 2, rank: 6 },
                                    to: { file: 2, rank: 5 },
                                    piece: 'FU',
                                    promote: false,
                                    isDrop: false,
                                    kifString: '▲２五歩',
                                    sfenMove: '2f2e',
                                  },
                                  gameCount: 1,
                                  wins: { sente: 1, gote: 0, draw: 0 },
                                  gameRefs: [],
                                  children: [],
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const card = weaknessToQuizCard(sampleWeakness, tree);
    expect(card.pv).toEqual(['7i6h', '3c3d', '2f2e']);
    expect(card.bestMove).toBe('7i6h');
  });
});
