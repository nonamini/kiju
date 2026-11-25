import { describe, expect, it } from 'vitest';
import type { SavedStudioGame } from '../../utils/studioKifuStorage';
import {
  buildMainlineTreeFromGames,
  filterGamesByKindScope,
} from './JosekiTreeVisualizer';

function makeGame(
  id: string,
  gameKind: SavedStudioGame['gameKind'],
  openingLine: NonNullable<SavedStudioGame['openingLine']>
): SavedStudioGame {
  const now = '2026-11-16T00:00:00.000Z';
  return {
    id,
    title: `Game ${id}`,
    senteName: 'Sente',
    goteName: 'Gote',
    openingId: 'kakugawari',
    openingName: '角換わり',
    totalPlies: openingLine.length,
    forkCount: 0,
    jkfJson: '{}',
    tags: [],
    gameKind,
    openingLine,
    createdAt: now,
    updatedAt: now,
  };
}

describe('JosekiTreeVisualizer gameKind scope & overlay counts (Issue #73)', () => {
  const sharedMove = { usi: '7g7f', japaneseMove: '▲７六歩', sfen: 'sfen-1' };
  const proBranch = { usi: '8c8d', japaneseMove: '△８四歩', sfen: 'sfen-pro' };
  const selfBranch = { usi: '3c3d', japaneseMove: '△３四歩', sfen: 'sfen-self' };

  const games: SavedStudioGame[] = [
    makeGame('pro-1', 'pro', [sharedMove, proBranch]),
    makeGame('self-1', 'self', [sharedMove, selfBranch]),
    makeGame('other-1', 'other', [sharedMove]),
  ];

  it('filters games by scope without mutating source data', () => {
    expect(filterGamesByKindScope(games, 'pro').map((g) => g.id)).toEqual([
      'pro-1',
    ]);
    expect(filterGamesByKindScope(games, 'self').map((g) => g.id)).toEqual([
      'self-1',
    ]);
    expect(filterGamesByKindScope(games, 'all').map((g) => g.id)).toEqual([
      'pro-1',
      'self-1',
      'other-1',
    ]);
  });

  it('tracks proCount, selfCount, and otherCount across shared and diverged nodes', () => {
    const root = buildMainlineTreeFromGames(games, 30);
    expect(root.proCount).toBe(1);
    expect(root.selfCount).toBe(1);
    expect(root.otherCount).toBe(1);

    const node1 = root.children.find((c) => c.usi === '7g7f');
    expect(node1?.proCount).toBe(1);
    expect(node1?.selfCount).toBe(1);
    expect(node1?.otherCount).toBe(1);

    const proNode = node1?.children.find((c) => c.usi === '8c8d');
    expect(proNode?.proCount).toBe(1);
    expect(proNode?.selfCount).toBe(0);

    const selfNode = node1?.children.find((c) => c.usi === '3c3d');
    expect(selfNode?.proCount).toBe(0);
    expect(selfNode?.selfCount).toBe(1);
  });
});
