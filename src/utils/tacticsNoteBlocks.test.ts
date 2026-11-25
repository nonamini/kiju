import { describe, expect, it } from 'vitest';
import type { KifuRecord } from '../types/kifuRecord';
import type { TacticsNoteBlock, TacticsNoteItem } from '../types/tacticsNote';
import {
  MAX_EMBEDDED_KIFU_PLAYERS,
  addNoteBlock,
  countEmbeddedKifuPlayers,
  createBlockId,
  insertNoteBlockAt,
  kifuRecordToTacticsPlayerItem,
  moveNoteBlock,
  removeNoteBlock,
  resolveInitialTacticsBlocks,
  updateNoteBlock,
} from './tacticsNoteBlocks';

describe('tacticsNoteBlocks helpers', () => {
  const b1: TacticsNoteBlock = { id: 't1', type: 'text', title: 'Intro', content: 'Hello' };
  const b2: TacticsNoteBlock = { id: 'k1', type: 'kifu', kifuId: 'game-1', caption: 'Mainline' };
  const b3: TacticsNoteBlock = { id: 'd1', type: 'diagram', diagramId: 'diag-1', caption: 'Shape' };

  it('creates unique prefixed IDs', () => {
    const id = createBlockId('txt');
    expect(id.startsWith('txt_')).toBe(true);
  });

  it('adds, updates, and removes blocks immutably', () => {
    const added = addNoteBlock([b1], b2);
    expect(added).toHaveLength(2);
    expect(added[1]).toEqual(b2);

    const updated = updateNoteBlock(added, 'k1', (b) =>
      b.type === 'kifu' ? { ...b, caption: 'Updated Caption' } : b
    );
    expect(updated[1]).toMatchObject({ id: 'k1', caption: 'Updated Caption' });
    expect(added[1]).toMatchObject({ id: 'k1', caption: 'Mainline' });

    const removed = removeNoteBlock(updated, 't1');
    expect(removed.map((b) => b.id)).toEqual(['k1']);
  });

  it('moves blocks up and down while safely ignoring out-of-bounds moves', () => {
    const list = [b1, b2, b3];

    expect(moveNoteBlock(list, 't1', 'up').map((b) => b.id)).toEqual(['t1', 'k1', 'd1']);
    expect(moveNoteBlock(list, 'd1', 'down').map((b) => b.id)).toEqual(['t1', 'k1', 'd1']);
    expect(moveNoteBlock(list, 'missing', 'up').map((b) => b.id)).toEqual(['t1', 'k1', 'd1']);

    const movedUp = moveNoteBlock(list, 'k1', 'up');
    expect(movedUp.map((b) => b.id)).toEqual(['k1', 't1', 'd1']);

    const movedDown = moveNoteBlock(list, 'k1', 'down');
    expect(movedDown.map((b) => b.id)).toEqual(['t1', 'd1', 'k1']);
  });

  it('counts embedded kifu players using default "player" and ignores "link" blocks', () => {
    const blocks: TacticsNoteBlock[] = [
      { id: 't1', type: 'text', content: 'note' },
      { id: 'k1', type: 'kifu', kifuId: 'g1' },
      { id: 'k2', type: 'kifu', kifuId: 'g2', displayMode: 'player' },
      { id: 'k3', type: 'kifu', kifuId: 'g3', displayMode: 'link' },
      { id: 'd1', type: 'diagram', diagramId: 'diag-1' },
    ];
    expect(MAX_EMBEDDED_KIFU_PLAYERS).toBe(5);
    expect(countEmbeddedKifuPlayers(blocks)).toBe(2);
  });

  it('adapts KifuRecord into TacticsNoteItem for TacticsDetailPlayer', () => {
    const rec: KifuRecord = {
      id: 'kifu-1',
      title: 'Ishida Study',
      contentHash: 'h1',
      source: 'studio',
      senteName: 'Sente',
      goteName: 'Gote',
      openingId: 'sankenbisha',
      openingName: 'Sankenbisha',
      totalPlies: 24,
      jkfJson: '{"header":{},"moves":[{}]}',
      tags: ['石田流', '定跡'],
      gameKind: 'joseki',
      notes: 'Quick 7e break',
      isIncludedInTree: true,
      evaluations: {
        5: {
          scoreCp: 180,
          isMate: false,
          depth: 12,
          evaluatedAt: '2026-01-01T00:00:00.000Z',
        },
        2: {
          scoreCp: 40,
          isMate: false,
          depth: 12,
          evaluatedAt: '2026-01-01T00:00:00.000Z',
        },
      },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    };

    const adapted = kifuRecordToTacticsPlayerItem(rec);
    expect(adapted).toMatchObject({
      id: 'kifu-1',
      title: 'Ishida Study',
      tag: '石田流',
      summary: 'Quick 7e break',
      jkfJson: '{"header":{},"moves":[{}]}',
      evalHistory: [
        { ply: 2, scoreCp: 40, isMate: false },
        { ply: 5, scoreCp: 180, isMate: false },
      ],
    });
  });

  it('inserts blocks at arbitrary positions with clamped bounds', () => {
    const newB: TacticsNoteBlock = { id: 'inserted', type: 'text', content: 'middle' };
    expect(insertNoteBlockAt([b1, b2], newB, 0).map((b) => b.id)).toEqual([
      'inserted',
      't1',
      'k1',
    ]);
    expect(insertNoteBlockAt([b1, b2], newB, 1).map((b) => b.id)).toEqual([
      't1',
      'inserted',
      'k1',
    ]);
    expect(insertNoteBlockAt([b1, b2], newB, 99).map((b) => b.id)).toEqual([
      't1',
      'k1',
      'inserted',
    ]);
    expect(insertNoteBlockAt([b1, b2], newB, -3).map((b) => b.id)).toEqual([
      'inserted',
      't1',
      'k1',
    ]);
  });

  it('resolves initial blocks from explicit freeBlocks or promotes legacy board', () => {
    const baseItem: TacticsNoteItem = {
      id: 'n1',
      category: 'attacks',
      title: 'Test',
      tag: '急戦',
      summary: 'Summary',
      moves: ['7g7f', '3c3d'],
    };
    expect(resolveInitialTacticsBlocks(baseItem)).toEqual([
      { id: 'legacy_main', type: 'legacy_tactic' },
    ]);

    expect(
      resolveInitialTacticsBlocks({
        ...baseItem,
        freeBlocks: [],
      })
    ).toEqual([]);

    expect(
      resolveInitialTacticsBlocks({
        id: 'n2',
        category: 'custom',
        title: 'Blank',
        tag: 'カスタム',
        summary: 'Summary',
      })
    ).toEqual([]);
  });
});
