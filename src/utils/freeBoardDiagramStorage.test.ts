import { beforeEach, describe, expect, it } from 'vitest';
import type { FreeBoardDiagram } from '../types/freeBoardDiagram';
import {
  clampDiagramDimension,
  clearFreeBoardDiagramsStorage,
  deleteFreeBoardDiagram,
  loadDeletedDiagramIds,
  loadFreeBoardDiagrams,
  resizeDiagramData,
  saveFreeBoardDiagram,
} from './freeBoardDiagramStorage';

function makeSampleDiagram(id = 'diag-1'): FreeBoardDiagram {
  return {
    id,
    title: 'Sample Partial Board',
    description: 'Corner tesuji shape',
    cols: 5,
    rows: 5,
    showCoords: true,
    startFile: 5,
    startRank: 1,
    pieces: [
      { col: 1, row: 1, owner: 'w', kind: 'K' },
      { col: 4, row: 4, owner: 'b', kind: '+R' },
    ],
    highlights: [
      { col: 1, row: 1, color: 'amber' },
      { col: 4, row: 2, color: 'sky' },
    ],
    markers: [
      { col: 2, row: 2, symbol: '○', color: 'emerald' },
      { col: 4, row: 4, symbol: '★', color: 'rose' },
    ],
    arrows: [
      { fromCol: 1, fromRow: 1, toCol: 2, toRow: 2, color: 'amber' },
      { fromCol: 4, fromRow: 4, toCol: 2, toRow: 2, color: 'rose' },
    ],
    tags: ['部分図'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('clampDiagramDimension & resizeDiagramData', () => {
  it('clamps dimensions safely between 1 and 9', () => {
    expect(clampDiagramDimension(0)).toBe(1);
    expect(clampDiagramDimension(-3)).toBe(1);
    expect(clampDiagramDimension(3.6)).toBe(4);
    expect(clampDiagramDimension(12)).toBe(9);
    expect(clampDiagramDimension(Number.NaN)).toBe(5);
  });

  it('prunes out-of-bounds pieces, highlights, markers, and arrows on shrink', () => {
    const sample = makeSampleDiagram();
    const shrunk = resizeDiagramData(sample, 3, 3);

    expect(shrunk.cols).toBe(3);
    expect(shrunk.rows).toBe(3);
    expect(shrunk.pieces).toEqual([{ col: 1, row: 1, owner: 'w', kind: 'K' }]);
    expect(shrunk.highlights).toEqual([{ col: 1, row: 1, color: 'amber' }]);
    expect(shrunk.markers).toEqual([{ col: 2, row: 2, symbol: '○', color: 'emerald' }]);
    expect(shrunk.arrows).toEqual([
      { fromCol: 1, fromRow: 1, toCol: 2, toRow: 2, color: 'amber' },
    ]);
  });
});

describe('freeBoardDiagramStorage CRUD & tombstones', () => {
  beforeEach(() => {
    clearFreeBoardDiagramsStorage();
  });

  it('saves, updates, loads, and deletes diagrams while tracking tombstones', () => {
    expect(loadFreeBoardDiagrams()).toEqual([]);

    const saved = saveFreeBoardDiagram(makeSampleDiagram('diag-a'));
    expect(loadFreeBoardDiagrams()).toHaveLength(1);
    expect(loadFreeBoardDiagrams()[0]?.id).toBe(saved.id);

    saveFreeBoardDiagram({ ...saved, title: 'Updated Title' });
    expect(loadFreeBoardDiagrams()).toHaveLength(1);
    expect(loadFreeBoardDiagrams()[0]?.title).toBe('Updated Title');

    deleteFreeBoardDiagram('diag-a');
    expect(loadFreeBoardDiagrams()).toEqual([]);
    expect(loadDeletedDiagramIds()).toEqual(['diag-a']);

    // Re-saving clears the deletion tombstone
    saveFreeBoardDiagram(makeSampleDiagram('diag-a'));
    expect(loadDeletedDiagramIds()).toEqual([]);
  });
});
