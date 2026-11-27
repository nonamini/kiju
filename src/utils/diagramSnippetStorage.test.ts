import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FreeBoardDiagram } from '../types/freeBoardDiagram';

const memoryStorage = new Map<string, string>();

vi.mock('./matchHistoryStorage', () => ({
  getSafeStorage: () => ({
    getItem: (k: string) => memoryStorage.get(k) ?? null,
    setItem: (k: string, v: string) => {
      memoryStorage.set(k, v);
    },
    removeItem: (k: string) => {
      memoryStorage.delete(k);
    },
  }),
}));

import {
  BUILTIN_DIAGRAM_SNIPPETS,
  applySnippetToDiagram,
  deleteUserDiagramSnippet,
  loadAllDiagramSnippets,
  loadUserDiagramSnippets,
  saveDiagramSnippetFromDiagram,
} from './diagramSnippetStorage';

function makeEmptyDiagram(): FreeBoardDiagram {
  return {
    id: 'diag-1',
    title: '',
    cols: 5,
    rows: 5,
    showCoords: true,
    startFile: 5,
    startRank: 1,
    pieces: [],
    highlights: [],
    markers: [],
    arrows: [],
    tags: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

describe('diagramSnippetStorage (Issue #17)', () => {
  beforeEach(() => {
    memoryStorage.clear();
  });

  it('has valid piece bounds across all built-in castle snippets', () => {
    expect(BUILTIN_DIAGRAM_SNIPPETS.length).toBeGreaterThanOrEqual(4);
    for (const snip of BUILTIN_DIAGRAM_SNIPPETS) {
      expect(snip.isBuiltIn).toBe(true);
      for (const p of snip.pieces) {
        expect(p.col).toBeGreaterThanOrEqual(0);
        expect(p.col).toBeLessThan(snip.cols);
        expect(p.row).toBeGreaterThanOrEqual(0);
        expect(p.row).toBeLessThan(snip.rows);
      }
    }
  });

  it('saves, loads, and deletes custom diagram snippets', () => {
    const diagram: FreeBoardDiagram = {
      ...makeEmptyDiagram(),
      title: '片美濃囲い',
      cols: 4,
      rows: 4,
      pieces: [{ col: 2, row: 2, owner: 'b', kind: 'K' }],
      highlights: [{ col: 1, row: 1, color: 'amber' }],
    };

    const saved = saveDiagramSnippetFromDiagram(diagram);
    expect(saved.name).toBe('片美濃囲い');
    expect(loadUserDiagramSnippets()).toHaveLength(1);
    expect(loadAllDiagramSnippets().length).toBe(
      BUILTIN_DIAGRAM_SNIPPETS.length + 1
    );

    deleteUserDiagramSnippet(saved.id);
    expect(loadUserDiagramSnippets()).toHaveLength(0);
  });

  it('deep-clones snippet geometry when applying to a diagram', () => {
    const mino = BUILTIN_DIAGRAM_SNIPPETS.find((s) => s.id === 'builtin_mino')!;
    const applied = applySnippetToDiagram(makeEmptyDiagram(), mino);

    expect(applied.title).toBe(mino.name);
    expect(applied.cols).toBe(5);
    expect(applied.rows).toBe(4);
    expect(applied.pieces).toHaveLength(mino.pieces.length);

    applied.pieces[0]!.col = 99;
    expect(mino.pieces[0]!.col).not.toBe(99);
  });
});
