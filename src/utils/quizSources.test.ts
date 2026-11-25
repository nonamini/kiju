import { describe, expect, it } from 'vitest';
import { MatchRecord } from '../types/match';
import { matchRecordToQuizSource, parsedKifToQuizSource, gameMergeInputToQuizSource } from './quizSources';
import { ParsedKifResult } from './kifParser';
import { GameMergeInput } from './treeMerger';

describe('quizSources', () => {
  it('converts MatchRecord to QuizSourceGame cleanly', () => {
    const record: MatchRecord = {
      id: 'match-123',
      userId: 'user-abc',
      openingId: 'kakugawari',
      startedAt: '2026-10-25T10:00:00Z',
      endedAt: '2026-10-25T10:15:00Z',
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
          isDrop: false,
          promote: false,
          kifString: '▲７六歩(77)',
          sfenMove: '7g7f',
        },
      ],
      result: 'win',
      aiEngine: 'Fairy-Stockfish 14 Wasm',
      aiDepth: 14,
      isMergedIntoTree: false,
    };

    const source = matchRecordToQuizSource(record);
    expect(source.gameId).toBe('match-123');
    expect(source.openingId).toBe('kakugawari');
    expect(source.startSfen).toBe(record.startSfen);
    expect(source.moves).toEqual(record.moves);
  });

  it('converts ParsedKifResult to QuizSourceGame cleanly', () => {
    const kif: ParsedKifResult = {
      game: {
        id: 'game-kif-1',
        userId: 'u1',
        openingId: 'yagura',
        title: 'Title 1',
        senteName: 'Sente',
        goteName: 'Gote',
        plyCount: 1,
        rawKif: '',
        isIncluded: true,
        isAnalyzed: false,
        createdAt: '',
        updatedAt: '',
      },
      moves: [
        {
          ply: 1,
          color: 'b',
          to: { file: 7, rank: 6 },
          piece: 'FU',
          isDrop: false,
          kifString: '▲７六歩',
          sfenMove: '7g7f',
        },
      ],
      variations: [],
    };

    const source = parsedKifToQuizSource(kif);
    expect(source.gameId).toBe('game-kif-1');
    expect(source.openingId).toBe('yagura');
    expect(source.startSfen).toBe('startpos');
    expect(source.moves).toEqual(kif.moves);
  });

  it('converts GameMergeInput to QuizSourceGame', () => {
    const input: GameMergeInput = {
      game: {
        id: 'game-mem-1',
        userId: 'u1',
        openingId: 'other',
        title: 'Memory Game',
        senteName: 'Sente',
        goteName: 'Gote',
        plyCount: 1,
        rawKif: '',
        isIncluded: true,
        isAnalyzed: true,
        createdAt: '',
        updatedAt: '',
      },
      moves: [
        {
          ply: 1,
          color: 'b',
          to: { file: 2, rank: 6 },
          piece: 'FU',
          isDrop: false,
          kifString: '▲２六歩',
          sfenMove: '2g2f',
        },
      ],
    };

    const source = gameMergeInputToQuizSource(input);
    expect(source.gameId).toBe('game-mem-1');
    expect(source.openingId).toBe('other');
    expect(source.startSfen).toBe('startpos');
    expect(source.moves).toEqual(input.moves);
  });
});
