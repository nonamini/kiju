import { describe, it, expect } from 'vitest';
import {
  insertGameIntoIndex,
  buildOrSyncOpeningTreeIndex,
  OpeningTreeIndexNode,
} from './openingTreeIndex';
import { KifuRecord } from '../types/kifuRecord';

function makeGame(id: string, moves: Array<{ usi: string; jp: string }>): KifuRecord {
  const now = '2026-11-19T00:00:00.000Z';
  return {
    id,
    title: id,
    contentHash: id,
    source: 'studio',
    senteName: 'Sente',
    goteName: 'Gote',
    openingId: 'unknown',
    openingName: '',
    totalPlies: moves.length,
    jkfJson: '{}',
    openingLine: moves.map((m, idx) => ({
      usi: m.usi,
      japaneseMove: m.jp,
      sfen: `sfen_${idx + 1}`,
    })),
    tags: [],
    isIncludedInTree: true,
    createdAt: now,
    updatedAt: now,
  };
}

describe('openingTreeIndex', () => {
  it('stops at 1-game leaf on first game and lazily expands on collision', () => {
    const g1 = makeGame('g1', [
      { usi: '2g2f', jp: '▲２六歩' },
      { usi: '3c3d', jp: '△３四歩' },
      { usi: '7g7f', jp: '▲７六歩' },
    ]);
    const g2 = makeGame('g2', [
      { usi: '2g2f', jp: '▲２六歩' },
      { usi: '8c8d', jp: '△８四歩' },
    ]);
    const map = new Map<string, KifuRecord>([
      ['g1', g1],
      ['g2', g2],
    ]);

    const root: OpeningTreeIndexNode = {
      ply: 0,
      usi: 'root',
      japaneseMove: '平手初期局面',
      sfen: 'start',
      gameIds: [],
      children: [],
    };

    insertGameIntoIndex(root, g1, map);
    expect(root.children).toHaveLength(1);
    expect(root.children[0]?.usi).toBe('2g2f');
    expect(root.children[0]?.gameIds).toEqual(['g1']);
    expect(root.children[0]?.children).toHaveLength(0);

    insertGameIntoIndex(root, g2, map);
    const first = root.children[0]!;
    expect(first.gameIds).toEqual(['g1', 'g2']);
    expect(first.children.map((c) => c.usi)).toEqual(['3c3d', '8c8d']);
  });

  it('syncs new games incrementally', () => {
    const g1 = makeGame('g1', [{ usi: '7g7f', jp: '▲７六歩' }]);
    const idx1 = buildOrSyncOpeningTreeIndex([g1]);
    expect(idx1.indexedGameIds).toEqual(['g1']);

    const g2 = makeGame('g2', [{ usi: '2g2f', jp: '▲２六歩' }]);
    const idx2 = buildOrSyncOpeningTreeIndex([g1, g2]);
    expect(idx2.indexedGameIds).toEqual(['g1', 'g2']);
    expect(idx2.root.children.map((c) => c.usi)).toEqual(['7g7f', '2g2f']);
  });
});
