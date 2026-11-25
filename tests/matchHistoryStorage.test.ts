import { describe, it, expect, beforeEach } from 'vitest';
import {
  calculateMatchHistoryStats,
  clearAllMatchRecords,
  convertMatchToGameMergeInput,
  deleteMatchRecord,
  loadMatchRecords,
  saveMatchRecord,
  updateMatchRecord,
  MATCH_HISTORY_STORAGE_KEY,
} from '../src/utils/matchHistoryStorage';
import { MatchRecord } from '../src/types/match';
import { mergeGamesIntoTree } from '../src/utils/treeMerger';
import { ShogiBoard } from '../src/utils/shogiBoard';
import { createInteractiveMove } from '../src/utils/shogiRules';

describe('matchHistoryStorage', () => {
  beforeEach(() => {
    clearAllMatchRecords();
  });

  const sampleRecord: MatchRecord = {
    id: 'test_match_1',
    userId: 'user_123',
    openingId: 'yagura',
    startedAt: '2026-10-18T10:00:00.000Z',
    endedAt: '2026-10-18T10:05:00.000Z',
    userColor: 'b',
    startPly: 0,
    startSfen: 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1',
    moves: [],
    outOfBookPly: 3,
    result: 'win',
    reason: 'checkmate',
    aiEngine: 'Fairy-Stockfish 14 Wasm',
    aiDepth: 12,
    isMergedIntoTree: false,
  };

  it('saves and loads match records correctly', () => {
    expect(loadMatchRecords()).toEqual([]);

    saveMatchRecord(sampleRecord);
    const loaded = loadMatchRecords();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.id).toBe('test_match_1');
    expect(loaded[0]?.result).toBe('win');
  });

  it('updates an existing match record (marking isMergedIntoTree = true)', () => {
    saveMatchRecord(sampleRecord);
    const updated = updateMatchRecord('test_match_1', { isMergedIntoTree: true });
    expect(updated[0]?.isMergedIntoTree).toBe(true);

    const reloaded = loadMatchRecords();
    expect(reloaded[0]?.isMergedIntoTree).toBe(true);
  });

  it('deletes a match record by ID', () => {
    saveMatchRecord(sampleRecord);
    const remaining = deleteMatchRecord('test_match_1');
    expect(remaining).toHaveLength(0);
    expect(loadMatchRecords()).toHaveLength(0);
  });

  it('calculates aggregate match history statistics correctly', () => {
    const records: MatchRecord[] = [
      { ...sampleRecord, id: '1', result: 'win' },
      { ...sampleRecord, id: '2', result: 'loss' },
      { ...sampleRecord, id: '3', result: 'win' },
      { ...sampleRecord, id: '4', result: 'draw' },
      { ...sampleRecord, id: '5', result: 'aborted' },
    ];

    const stats = calculateMatchHistoryStats(records);
    expect(stats.totalMatches).toBe(5);
    expect(stats.wins).toBe(2);
    expect(stats.losses).toBe(1);
    expect(stats.draws).toBe(1);
    expect(stats.aborted).toBe(1);
    // completed = 2 wins + 1 loss = 3. 2 / 3 = 66.7%
    expect(stats.winRatePct).toBe(66.7);
  });

  it('converts MatchRecord to GameMergeInput and merges with sparring comment tag', () => {
    const board = new ShogiBoard();
    const move1 = createInteractiveMove(board, 1, 'b', { file: 7, rank: 7 }, { file: 7, rank: 6 }, false);
    board.applyMove(move1);
    const move2 = createInteractiveMove(board, 2, 'w', { file: 3, rank: 3 }, { file: 3, rank: 4 }, false);
    board.applyMove(move2);

    const recordWithMoves: MatchRecord = {
      ...sampleRecord,
      moves: [move1, move2],
      outOfBookPly: 2,
    };

    const mergeInput = convertMatchToGameMergeInput(recordWithMoves);
    expect(mergeInput.game.id).toBe('sparring_test_match_1');
    expect(mergeInput.game.winner).toBe('b');
    expect(mergeInput.game.title).toContain('[Sparring]');

    // Merge into tree
    const mergedTree = mergeGamesIntoTree([mergeInput]);
    expect(mergedTree.rootNodes).toHaveLength(1);
    const node1 = mergedTree.rootNodes[0]!;
    expect(node1.children).toHaveLength(1);
    const node2 = node1.children[0]!;
    expect(node2.comment).toContain('[Sparring]');
  });
});
