/**
 * Partial Board Diagram Snippet (template) storage & built-in castle presets (Issue #17).
 * Allows saving reusable FreeBoardDiagram layouts as snippets and applying them
 * inside the Partial Board Diagram Editor (with deep cloning to avoid mutation).
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import type {
  DiagramArrow,
  DiagramHighlight,
  DiagramMarker,
  DiagramPiece,
  FreeBoardDiagram,
} from '../types/freeBoardDiagram';
import { getSafeStorage } from './matchHistoryStorage';

export const DIAGRAM_SNIPPETS_KEY = 'joseki_tree_diagram_snippets_v1';

export type DiagramSnippetCategory = 'castle' | 'tesuji' | 'custom';

export interface DiagramSnippet {
  id: string;
  name: string;
  category: DiagramSnippetCategory;
  cols: number;
  rows: number;
  showCoords?: boolean;
  startFile?: number;
  startRank?: number;
  pieces: DiagramPiece[];
  highlights: DiagramHighlight[];
  markers: DiagramMarker[];
  arrows: DiagramArrow[];
  isBuiltIn?: boolean;
  createdAt: string;
}

export const BUILTIN_DIAGRAM_SNIPPETS: readonly DiagramSnippet[] = [
  {
    id: 'builtin_mino',
    name: '美濃囲い',
    category: 'castle',
    cols: 5,
    rows: 4,
    showCoords: true,
    startFile: 5,
    startRank: 6,
    pieces: [
      { col: 3, row: 2, owner: 'b', kind: 'K' },
      { col: 2, row: 2, owner: 'b', kind: 'S' },
      { col: 1, row: 3, owner: 'b', kind: 'G' },
      { col: 0, row: 2, owner: 'b', kind: 'G' },
      { col: 4, row: 1, owner: 'b', kind: 'P' },
      { col: 3, row: 1, owner: 'b', kind: 'P' },
      { col: 2, row: 1, owner: 'b', kind: 'P' },
      { col: 1, row: 1, owner: 'b', kind: 'P' },
    ],
    highlights: [],
    markers: [],
    arrows: [],
    isBuiltIn: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'builtin_yagura',
    name: '矢倉囲い',
    category: 'castle',
    cols: 5,
    rows: 5,
    showCoords: true,
    startFile: 9,
    startRank: 5,
    pieces: [
      { col: 1, row: 3, owner: 'b', kind: 'K' },
      { col: 2, row: 2, owner: 'b', kind: 'S' },
      { col: 2, row: 3, owner: 'b', kind: 'G' },
      { col: 3, row: 2, owner: 'b', kind: 'G' },
      { col: 0, row: 2, owner: 'b', kind: 'P' },
      { col: 1, row: 2, owner: 'b', kind: 'P' },
      { col: 2, row: 1, owner: 'b', kind: 'P' },
      { col: 3, row: 1, owner: 'b', kind: 'P' },
      { col: 0, row: 4, owner: 'b', kind: 'L' },
      { col: 1, row: 4, owner: 'b', kind: 'N' },
      { col: 2, row: 4, owner: 'b', kind: 'B' },
    ],
    highlights: [],
    markers: [],
    arrows: [],
    isBuiltIn: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'builtin_funagakoi',
    name: '船囲い',
    category: 'castle',
    cols: 5,
    rows: 4,
    showCoords: true,
    startFile: 9,
    startRank: 6,
    pieces: [
      { col: 2, row: 2, owner: 'b', kind: 'K' },
      { col: 2, row: 3, owner: 'b', kind: 'S' },
      { col: 3, row: 3, owner: 'b', kind: 'G' },
      { col: 4, row: 2, owner: 'b', kind: 'G' },
      { col: 1, row: 2, owner: 'b', kind: 'B' },
      { col: 0, row: 1, owner: 'b', kind: 'P' },
      { col: 1, row: 1, owner: 'b', kind: 'P' },
      { col: 2, row: 1, owner: 'b', kind: 'P' },
      { col: 3, row: 1, owner: 'b', kind: 'P' },
    ],
    highlights: [],
    markers: [],
    arrows: [],
    isBuiltIn: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'builtin_anaguma',
    name: '穴熊囲い',
    category: 'castle',
    cols: 5,
    rows: 4,
    showCoords: true,
    startFile: 5,
    startRank: 6,
    pieces: [
      { col: 4, row: 3, owner: 'b', kind: 'K' },
      { col: 4, row: 2, owner: 'b', kind: 'L' },
      { col: 3, row: 2, owner: 'b', kind: 'S' },
      { col: 2, row: 3, owner: 'b', kind: 'G' },
      { col: 2, row: 2, owner: 'b', kind: 'G' },
      { col: 4, row: 1, owner: 'b', kind: 'P' },
      { col: 3, row: 1, owner: 'b', kind: 'P' },
      { col: 2, row: 1, owner: 'b', kind: 'P' },
    ],
    highlights: [],
    markers: [],
    arrows: [],
    isBuiltIn: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

export function loadUserDiagramSnippets(): DiagramSnippet[] {
  try {
    const raw = getSafeStorage().getItem(DIAGRAM_SNIPPETS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is DiagramSnippet =>
        Boolean(s) &&
        typeof s === 'object' &&
        typeof (s as DiagramSnippet).id === 'string' &&
        typeof (s as DiagramSnippet).name === 'string' &&
        Array.isArray((s as DiagramSnippet).pieces)
    );
  } catch {
    return [];
  }
}

function saveUserDiagramSnippets(snippets: DiagramSnippet[]): void {
  try {
    getSafeStorage().setItem(DIAGRAM_SNIPPETS_KEY, JSON.stringify(snippets));
  } catch {
    // Ignore storage quota / private mode errors
  }
}

export function loadAllDiagramSnippets(): DiagramSnippet[] {
  return [...loadUserDiagramSnippets(), ...BUILTIN_DIAGRAM_SNIPPETS];
}

export function saveDiagramSnippetFromDiagram(
  diagram: FreeBoardDiagram,
  name?: string,
  category: DiagramSnippetCategory = 'custom'
): DiagramSnippet {
  const cleanName = (name ?? diagram.title).trim() || 'Snippet';
  const snippet: DiagramSnippet = {
    id: `snip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: cleanName,
    category,
    cols: diagram.cols,
    rows: diagram.rows,
    showCoords: diagram.showCoords,
    startFile: diagram.startFile,
    startRank: diagram.startRank,
    pieces: diagram.pieces.map((p) => ({ ...p })),
    highlights: diagram.highlights.map((h) => ({ ...h })),
    markers: diagram.markers.map((m) => ({ ...m })),
    arrows: diagram.arrows.map((a) => ({ ...a })),
    isBuiltIn: false,
    createdAt: new Date().toISOString(),
  };

  const existing = loadUserDiagramSnippets();
  saveUserDiagramSnippets([snippet, ...existing]);
  return snippet;
}

export function deleteUserDiagramSnippet(id: string): void {
  const existing = loadUserDiagramSnippets();
  saveUserDiagramSnippets(existing.filter((s) => s.id !== id));
}

/**
 * Applies a snippet's board dimensions, coordinates, pieces, highlights,
 * markers, and arrows to a diagram while deep-cloning all element arrays.
 */
export function applySnippetToDiagram(
  prev: FreeBoardDiagram,
  snippet: DiagramSnippet
): FreeBoardDiagram {
  return {
    ...prev,
    title: prev.title.trim() ? prev.title : snippet.name,
    cols: snippet.cols,
    rows: snippet.rows,
    showCoords: snippet.showCoords ?? prev.showCoords,
    startFile: snippet.startFile ?? snippet.cols,
    startRank: snippet.startRank ?? 1,
    pieces: snippet.pieces.map((p) => ({ ...p })),
    highlights: snippet.highlights.map((h) => ({ ...h })),
    markers: snippet.markers.map((m) => ({ ...m })),
    arrows: snippet.arrows.map((a) => ({ ...a })),
  };
}
