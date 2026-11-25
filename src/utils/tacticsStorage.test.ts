import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadTacticsItems,
  saveTacticsItem,
  deleteTacticsItem,
  resetTacticsToDefault,
  getTacticsItemById,
  updateTacticsMoveComment,
  exportTacticsAsJson,
  importTacticsFromJson,
  TACTICS_STORAGE_KEY,
  loadDeletedTacticIds,
} from './tacticsStorage';
import { DEFAULT_TACTICS_ITEMS } from '../data/defaultTactics';
import { TacticsNoteItem } from '../types/tacticsNote';
import { getSafeStorage } from './matchHistoryStorage';

describe('tacticsStorage', () => {
  beforeEach(() => {
    getSafeStorage().clear();
  });

  it('loads default tactics when storage is empty', () => {
    const items = loadTacticsItems();
    expect(items.length).toBe(DEFAULT_TACTICS_ITEMS.length);
    expect(items[0]?.id).toBe(DEFAULT_TACTICS_ITEMS[0]?.id);
  });

  it('saves and updates an existing tactics item', () => {
    const first = DEFAULT_TACTICS_ITEMS[0];
    if (!first) throw new Error('Expected default items');
    const updated: TacticsNoteItem = {
      ...first,
      summary: 'Updated summary by user',
    };
    const savedList = saveTacticsItem(updated);
    const found = savedList.find((it) => it.id === updated.id);
    expect(found?.summary).toBe('Updated summary by user');
    expect(found?.isCustom).toBe(true);

    const reloaded = loadTacticsItems();
    expect(reloaded.find((it) => it.id === updated.id)?.summary).toBe('Updated summary by user');
  });

  it('creates a new custom tactics note', () => {
    const newItem: TacticsNoteItem = {
      id: 'custom-note-1',
      category: 'custom',
      title: 'My Secret Castle',
      tag: 'Experimental',
      summary: 'My own experimental castle structure.',
    };
    const savedList = saveTacticsItem(newItem);
    expect(savedList.length).toBe(DEFAULT_TACTICS_ITEMS.length + 1);
    expect(savedList[0]?.id).toBe('custom-note-1');
  });

  it('deletes an item', () => {
    const initial = loadTacticsItems();
    const idToDelete = initial[0]?.id;
    if (!idToDelete) throw new Error('Expected items');
    const remaining = deleteTacticsItem(idToDelete);
    expect(remaining.length).toBe(initial.length - 1);
    expect(remaining.find((it) => it.id === idToDelete)).toBeUndefined();
  });

  it('resets to default templates', () => {
    saveTacticsItem({
      id: 'custom-temp',
      category: 'custom',
      title: 'Temp',
      tag: 'Temp',
      summary: 'Temp',
    });
    expect(getSafeStorage().getItem(TACTICS_STORAGE_KEY)).not.toBeNull();

    const reset = resetTacticsToDefault();
    expect(reset.length).toBe(DEFAULT_TACTICS_ITEMS.length);
    expect(getSafeStorage().getItem(TACTICS_STORAGE_KEY)).toBeNull();
  });

  it('updates move comments for a tactic', () => {
    const first = DEFAULT_TACTICS_ITEMS[0];
    if (!first) throw new Error('Expected default items');
    const updated = updateTacticsMoveComment(first.id, 1, 'Opening move comment');
    expect(updated?.moveComments).toEqual([{ ply: 1, comment: 'Opening move comment' }]);

    const loaded = getTacticsItemById(first.id);
    expect(loaded?.moveComments).toEqual([{ ply: 1, comment: 'Opening move comment' }]);
  });

  it('exports and imports tactics bundle correctly', () => {
    const jsonStr = exportTacticsAsJson();
    expect(jsonStr).toContain('joseki-tree');

    // Create a new bundle with custom items
    const customBundle = JSON.stringify({
      version: '1.0',
      appName: 'joseki-tree',
      items: [
        {
          id: 'imported-tactic-1',
          category: 'attacks',
          title: 'Imported Tactic',
          tag: 'Imported',
          summary: 'Imported from community',
        },
      ],
    });

    const res = importTacticsFromJson(customBundle);
    expect(res.success).toBe(true);
    expect(res.count).toBe(1);

    const loaded = getTacticsItemById('imported-tactic-1');
    expect(loaded?.title).toBe('Imported Tactic');
    expect(loaded?.isCustom).toBe(true);
  });

  it('tracks deletion tombstones and updates jkfJson comments in updateTacticsMoveComment', () => {
    saveTacticsItem({
      id: 't-jkf',
      category: 'custom',
      title: 'JKF Tactic',
      tag: 'Study',
      summary: 'Summary',
      jkfJson: JSON.stringify({
        header: {},
        moves: [{}, { move: { to: { x: 7, y: 6 }, piece: 'FU', color: 0 } }],
      }),
    });

    const updated = updateTacticsMoveComment('t-jkf', 1, 'Vital push');
    expect(updated?.moveComments).toEqual([{ ply: 1, comment: 'Vital push' }]);
    const parsedJkf = JSON.parse(updated?.jkfJson ?? '{}') as {
      moves?: Array<{ comments?: string[] }>;
    };
    expect(parsedJkf.moves?.[1]?.comments).toEqual(['Vital push']);

    deleteTacticsItem('t-jkf');
    expect(loadDeletedTacticIds()).toContain('t-jkf');
  });
});
