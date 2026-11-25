/**
 * Free Board Diagram (部分盤面図) Local Storage Service (Issue #176 Phase 3).
 * Manages CRUD, deletion tombstones, dimension clamping/pruning, and triggers
 * automatic backup sync on updates.
 * Strictly English code, comments, and identifiers (Rule 1).
 * Strictly TypeScript strict typed without any (Rule 2).
 */

import type { FreeBoardDiagram } from '../types/freeBoardDiagram';
import { scheduleAutoBackupToSyncDirectory } from './folderSyncBackup';
import { getSafeStorage } from './matchHistoryStorage';

export const FREE_BOARD_DIAGRAMS_KEY = 'joseki_tree_free_board_diagrams_v1';
export const DELETED_DIAGRAM_IDS_KEY = 'joseki_tree_deleted_diagram_ids';

/**
 * Clamps a board dimension to an integer in 1..9.
 */
export function clampDiagramDimension(n: number): number {
  if (!Number.isFinite(n)) return 5;
  return Math.max(1, Math.min(9, Math.round(n)));
}

/**
 * Resizes a diagram to `nextCols x nextRows` (clamped to 1..9) and prunes
 * any pieces, highlights, markers, or arrows outside the new bounds.
 */
export function resizeDiagramData(
  diagram: FreeBoardDiagram,
  nextCols: number,
  nextRows: number
): FreeBoardDiagram {
  const cols = clampDiagramDimension(nextCols);
  const rows = clampDiagramDimension(nextRows);
  const inBounds = (col: number, row: number): boolean =>
    col >= 0 && col < cols && row >= 0 && row < rows;

  return {
    ...diagram,
    cols,
    rows,
    pieces: diagram.pieces.filter((p) => inBounds(p.col, p.row)),
    highlights: diagram.highlights.filter((h) => inBounds(h.col, h.row)),
    markers: diagram.markers.filter((m) => inBounds(m.col, m.row)),
    arrows: diagram.arrows.filter(
      (a) => inBounds(a.fromCol, a.fromRow) && inBounds(a.toCol, a.toRow)
    ),
  };
}

export function loadDeletedDiagramIds(): string[] {
  try {
    const raw = getSafeStorage().getItem(DELETED_DIAGRAM_IDS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : [];
  } catch {
    return [];
  }
}

export function markDiagramDeleted(id: string): void {
  if (!id) return;
  try {
    const set = new Set(loadDeletedDiagramIds());
    set.add(id);
    getSafeStorage().setItem(DELETED_DIAGRAM_IDS_KEY, JSON.stringify(Array.from(set)));
  } catch {
    // ignore storage errors
  }
}

export function clearDeletedDiagramId(id: string): void {
  if (!id) return;
  try {
    const current = loadDeletedDiagramIds();
    if (!current.includes(id)) return;
    getSafeStorage().setItem(
      DELETED_DIAGRAM_IDS_KEY,
      JSON.stringify(current.filter((x) => x !== id))
    );
  } catch {
    // ignore storage errors
  }
}

export function clearFreeBoardDiagramsStorage(): void {
  const storage = getSafeStorage();
  storage.removeItem(FREE_BOARD_DIAGRAMS_KEY);
  storage.removeItem(DELETED_DIAGRAM_IDS_KEY);
}

export function loadFreeBoardDiagrams(): FreeBoardDiagram[] {
  try {
    const raw = getSafeStorage().getItem(FREE_BOARD_DIAGRAMS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (d): d is FreeBoardDiagram =>
        Boolean(d && typeof d === 'object' && typeof (d as FreeBoardDiagram).id === 'string')
    );
  } catch {
    return [];
  }
}

export function saveFreeBoardDiagrams(diagrams: FreeBoardDiagram[]): void {
  scheduleAutoBackupToSyncDirectory();
  try {
    getSafeStorage().setItem(FREE_BOARD_DIAGRAMS_KEY, JSON.stringify(diagrams));
  } catch (err) {
    console.warn('[FreeBoardDiagramStorage] Failed saving diagrams:', err);
  }
}

export function saveFreeBoardDiagram(diagram: FreeBoardDiagram): FreeBoardDiagram {
  clearDeletedDiagramId(diagram.id);
  const nowIso = new Date().toISOString();
  const normalized: FreeBoardDiagram = {
    ...resizeDiagramData(diagram, diagram.cols, diagram.rows),
    createdAt: diagram.createdAt || nowIso,
    updatedAt: nowIso,
  };
  const all = loadFreeBoardDiagrams();
  const idx = all.findIndex((d) => d.id === normalized.id);
  if (idx >= 0) {
    all[idx] = normalized;
  } else {
    all.unshift(normalized);
  }
  saveFreeBoardDiagrams(all);
  return normalized;
}

export function deleteFreeBoardDiagram(id: string): void {
  markDiagramDeleted(id);
  const all = loadFreeBoardDiagrams();
  saveFreeBoardDiagrams(all.filter((d) => d.id !== id));
}
